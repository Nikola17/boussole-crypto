// Boussole : vérification des alertes en arrière-plan sur Android (application fermée).
// Ce script tourne dans le moteur JavaScript du plugin Background Runner, sans interface ni accès au stockage de l'application :
// l'application lui transmet l'état à surveiller (« syncWatch ») et il y garde ce qu'il a déjà notifié.
// Il couvre : alertes de prix et paliers de vente. Le reste des alertes (panier, bilan du dimanche) est programmé par l'application.
//
// Règles de fiabilité :
//  - une alerte n'est marquée « envoyée » qu'APRÈS que sa notification a été programmée sans erreur ;
//  - une réponse en erreur de CoinGecko (429 : limite atteinte, 5xx…) n'est jamais lue comme « aucun prix » ;
//  - le script garde la date de son dernier contrôle réussi (événement « getStatus ») : l'application l'affiche, pour que
//    tu saches si la surveillance tourne vraiment (les économiseurs de batterie peuvent l'empêcher de s'exécuter).

var DAY = 24 * 3600 * 1000;

function readJson(key, fallback) {
  try {
    var r = CapacitorKV.get(key);
    return r && r.value ? JSON.parse(r.value) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try { CapacitorKV.set(key, JSON.stringify(value)); } catch (e) { /* ignoré */ }
}

// Identifiant de notification stable dérivé d'une clé (plage réservée 3000-3999).
function notifId(key) {
  var h = 0;
  for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 1000;
  return 3000 + h;
}

function fmt(n) {
  if (n >= 1000) return Math.round(n).toLocaleString('fr-FR');
  if (n >= 1) return (Math.round(n * 100) / 100).toString().replace('.', ',');
  return (Math.round(n * 1e6) / 1e6).toString().replace('.', ',');
}

// État de la surveillance : dernière tentative, dernier succès, dernière erreur.
function recordStatus(patch) {
  var st = readJson('status', {});
  var now = Date.now();
  st.attemptAt = now;
  if (patch.ok) { st.okAt = now; st.error = null; st.checked = patch.checked || 0; }
  else st.error = patch.error || 'erreur inconnue';
  writeJson('status', st);
}

addEventListener('syncWatch', function (resolve, reject, args) {
  try {
    var state = (args && args.state) || { alerts: [], exits: [] };
    writeJson('watch', state);
    resolve({ ok: true });
  } catch (e) {
    reject(e);
  }
});

// L'application relit ce qui a été notifié en son absence pour ne pas le répéter à l'ouverture.
addEventListener('getFired', function (resolve) {
  try {
    var fired = readJson('firedAlerts', []);
    writeJson('firedAlerts', []);
    resolve({ alerts: fired });
  } catch (e) {
    resolve({ alerts: [] });
  }
});

// Pour afficher « dernier contrôle réussi il y a … » dans les Réglages.
addEventListener('getStatus', function (resolve) {
  var st = readJson('status', {});
  var watch = readJson('watch', { alerts: [], exits: [] });
  resolve({ okAt: st.okAt || null, attemptAt: st.attemptAt || null, error: st.error || null, watching: (watch.alerts || []).length + (watch.exits || []).length });
});

addEventListener('checkAlerts', function (resolve) {
  var watch = readJson('watch', { alerts: [], exits: [] });
  var ids = {};
  (watch.alerts || []).forEach(function (a) { ids[a.coinId] = true; });
  (watch.exits || []).forEach(function (x) { ids[x.coinId] = true; });
  var list = Object.keys(ids).slice(0, 80);
  // Rien à surveiller (alertes désactivées, ou aucune alerte) : aucun appel réseau.
  if (!list.length) { resolve({ checked: 0 }); return; }

  var headers = { Accept: 'application/json' };
  // La clé « Demo » gratuite de l'utilisateur (si elle existe) relève la limite de requêtes de CoinGecko.
  if (watch.cgKey) headers['x-cg-demo-api-key'] = String(watch.cgKey);

  fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(list.join(',')) + '&vs_currencies=usd', { method: 'GET', headers: headers })
    .then(function (res) {
      if (!res.ok) throw new Error('CoinGecko a répondu ' + res.status + (res.status === 429 ? ' (limite de requêtes atteinte)' : ''));
      return res.json();
    })
    .then(function (prices) {
      var sent = readJson('sent', {});
      var now = Date.now();
      var firedAlerts = readJson('firedAlerts', []);
      var out = [];
      var pending = []; // clés à marquer « envoyées » une fois la notification programmée
      var pendingAlertIds = [];

      (watch.alerts || []).forEach(function (a) {
        var p = prices[a.coinId] && prices[a.coinId].usd;
        if (typeof p !== 'number') return;
        var hit = a.condition === 'above' ? p >= a.priceUsd : p <= a.priceUsd;
        var key = 'alert:' + a.id;
        if (hit && !sent[key]) {
          pending.push(key);
          pendingAlertIds.push(a.id);
          out.push({ id: notifId(key), title: 'Alerte ' + String(a.symbol).toUpperCase(), body: a.name + ' est passé ' + (a.condition === 'above' ? 'au-dessus' : 'en dessous') + ' de ' + fmt(a.priceUsd) + ' $ (cours : ' + fmt(p) + ' $).', scheduleAt: new Date(now + 1000) });
        }
      });

      (watch.exits || []).forEach(function (x) {
        var p = prices[x.coinId] && prices[x.coinId].usd;
        if (typeof p !== 'number' || p < x.targetUsd) return;
        var key = 'exit:' + x.coinId + ':' + x.multiple;
        if (sent[key] && now - sent[key] < 7 * DAY) return;
        pending.push(key);
        out.push({ id: notifId(key), title: 'Palier ×' + x.multiple + ' atteint sur ' + String(x.symbol).toUpperCase(), body: 'Vends ' + x.pct + ' % de ta position de départ : ce palier a été fixé à froid. Ouvre Boussole.', scheduleAt: new Date(now + 1000) });
      });

      // La notification d'abord ; seulement si elle est programmée, l'alerte est « consommée ». Sinon (autorisation refusée, erreur du
      // plugin), elle sera retentée au prochain passage au lieu d'être perdue sans qu'on s'en aperçoive.
      if (out.length) {
        try {
          CapacitorNotifications.schedule(out);
        } catch (e) {
          recordStatus({ ok: false, error: 'notification impossible : ' + (e && e.message ? e.message : e) });
          resolve({ checked: list.length, notified: 0, error: 'notification impossible' });
          return;
        }
        pending.forEach(function (k) { sent[k] = now; });
        pendingAlertIds.forEach(function (id) { firedAlerts.push(id); });
      }

      Object.keys(sent).forEach(function (k) { if (now - sent[k] > 30 * DAY) delete sent[k]; });
      writeJson('sent', sent);
      writeJson('firedAlerts', firedAlerts);
      recordStatus({ ok: true, checked: list.length });
      resolve({ checked: list.length, notified: out.length });
    })
    .catch(function (e) {
      // Réseau indisponible ou limite atteinte : rien n'est consommé, on réessaiera au prochain passage, et l'échec est visible.
      recordStatus({ ok: false, error: e && e.message ? e.message : 'réseau indisponible' });
      resolve({ checked: 0, error: e && e.message ? e.message : 'réseau indisponible' });
    });
});
