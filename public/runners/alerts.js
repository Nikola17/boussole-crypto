// Boussole : vérification des alertes en arrière-plan sur Android (application fermée).
// Ce script tourne dans le moteur JavaScript du plugin Background Runner, sans interface ni accès au stockage de l'application :
// l'application lui transmet l'état à surveiller (« syncWatch ») et il y garde ce qu'il a déjà notifié.
// Il couvre : alertes de prix et paliers de vente. Le reste des alertes (panier, bilan du dimanche) est programmé par l'application.

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

addEventListener('checkAlerts', function (resolve, reject) {
  var watch = readJson('watch', { alerts: [], exits: [] });
  var ids = {};
  (watch.alerts || []).forEach(function (a) { ids[a.coinId] = true; });
  (watch.exits || []).forEach(function (x) { ids[x.coinId] = true; });
  var list = Object.keys(ids).slice(0, 80);
  if (!list.length) { resolve({ checked: 0 }); return; }

  fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + encodeURIComponent(list.join(',')) + '&vs_currencies=usd', { method: 'GET', headers: { Accept: 'application/json' } })
    .then(function (res) { return res.json(); })
    .then(function (prices) {
      var sent = readJson('sent', {});
      var now = Date.now();
      var firedAlerts = readJson('firedAlerts', []);
      var out = [];

      (watch.alerts || []).forEach(function (a) {
        var p = prices[a.coinId] && prices[a.coinId].usd;
        if (typeof p !== 'number') return;
        var hit = a.condition === 'above' ? p >= a.priceUsd : p <= a.priceUsd;
        var key = 'alert:' + a.id;
        if (hit && !sent[key]) {
          sent[key] = now;
          firedAlerts.push(a.id);
          out.push({ id: notifId(key), title: 'Alerte ' + String(a.symbol).toUpperCase(), body: a.name + ' est passé ' + (a.condition === 'above' ? 'au-dessus' : 'en dessous') + ' de ' + fmt(a.priceUsd) + ' $ (cours : ' + fmt(p) + ' $).', scheduleAt: new Date(now + 1000) });
        }
      });

      (watch.exits || []).forEach(function (x) {
        var p = prices[x.coinId] && prices[x.coinId].usd;
        if (typeof p !== 'number' || p < x.targetUsd) return;
        var key = 'exit:' + x.coinId + ':' + x.multiple;
        if (sent[key] && now - sent[key] < 7 * DAY) return;
        sent[key] = now;
        out.push({ id: notifId(key), title: 'Palier ×' + x.multiple + ' atteint sur ' + String(x.symbol).toUpperCase(), body: 'Vends ' + x.pct + ' % de ta position de départ : ce palier a été fixé à froid. Ouvre Boussole.', scheduleAt: new Date(now + 1000) });
      });

      Object.keys(sent).forEach(function (k) { if (now - sent[k] > 30 * DAY) delete sent[k]; });
      writeJson('sent', sent);
      writeJson('firedAlerts', firedAlerts);
      if (out.length) CapacitorNotifications.schedule(out);
      resolve({ checked: list.length, notified: out.length });
    })
    .catch(function () {
      // Réseau indisponible ou limite atteinte : on réessaiera au prochain passage.
      resolve({ checked: 0 });
    });
});
