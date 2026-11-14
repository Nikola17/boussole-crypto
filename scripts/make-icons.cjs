// Génère le logo de Boussole et toutes ses déclinaisons à partir d'une seule définition géométrique :
// web (favicon + logo dans l'app), Windows (.ico, icône près de l'horloge), macOS (.icns), Android (icône adaptative
// vectorielle + monochrome, anciennes icônes, écrans de démarrage, icône de notification) et iOS (AppIcon 1024 clair /
// sombre / teinté). Les fichiers sources SVG sont aussi écrits dans branding/.
//
// Utilisation : npx electron scripts/make-icons.cjs     (Electron sert de moteur de rendu)
//          ou : node scripts/make-icons.cjs             (si Playwright est installé)
//
// Le logo : un anneau de boussole ouvert, une courbe qui monte et une pointe d'aiguille dorée qui sort de l'anneau.
// Palette « Nuit & or ».

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const BRANDING = path.join(ROOT, 'branding');

const C = {
  bgTop: '#26365a',
  bgBottom: '#070a12',
  glow: 0.1,
  ink: '#ffffff',
  gold: '#ffd45e',
  goldDark: '#f0a312',
  page: '#0d0d0d',
};

// ---------- Géométrie (repère 1024 × 1024, centre 512,512) ----------

/** Grande taille (≥ 40 px) et petite taille (≤ 32 px, traits épaissis, courbe simplifiée). */
const GEOMETRY = {
  full: { R: 318, sw: 50, lw: 56, P: [[300, 668], [430, 538], [528, 628]], gap: 0.32, tipOut: 104, tipLen: 168, hw: 64, back: 10 },
  small: { R: 326, sw: 84, lw: 92, P: [[336, 636], [446, 526], [532, 612]], gap: 0.42, tipOut: 132, tipLen: 214, hw: 100, back: 0 },
};

const r1 = (n) => Math.round(n * 10) / 10;

function shapes(g) {
  const cx = 512, cy = 512;
  const u = [Math.SQRT1_2, -Math.SQRT1_2]; // dernier segment : 45° vers le haut-droite
  const n = [-u[1], u[0]];
  const last = g.P[g.P.length - 1];
  const dx = last[0] - cx, dy = last[1] - cy;
  const b = dx * u[0] + dy * u[1];
  const t = -b + Math.sqrt(b * b - (dx * dx + dy * dy - g.R * g.R)); // sortie de l'anneau
  const along = (k) => [last[0] + u[0] * k, last[1] + u[1] * k];
  const exit = along(t);
  const ang = Math.atan2(exit[1] - cy, exit[0] - cx);
  const onRing = (a) => [cx + g.R * Math.cos(a), cy + g.R * Math.sin(a)];
  const s = onRing(ang + g.gap), e = onRing(ang - g.gap);
  const tip = along(t + g.tipOut);
  const base = along(t - g.tipLen);
  const mid = [base[0] + u[0] * g.back, base[1] + u[1] * g.back];
  const left = [mid[0] - n[0] * g.hw, mid[1] - n[1] * g.hw]; // facette éclairée (haut-gauche)
  const right = [mid[0] + n[0] * g.hw, mid[1] + n[1] * g.hw];
  const lineEnd = along(t - g.tipLen + g.back + 10);
  const P = (pts) => pts.map((p) => `${r1(p[0])},${r1(p[1])}`);
  return {
    ring: `M${P([s])[0]} A${g.R},${g.R} 0 1 1 ${P([e])[0]}`,
    line: `M${P([...g.P, lineEnd]).join(' L')}`,
    lit: `M${P([tip, left, base]).join(' L')} Z`,
    shade: `M${P([tip, right, base]).join(' L')} Z`,
    sw: g.sw,
    lw: g.lw,
  };
}

/** Glyphe SVG. tone : 'color' (or + blanc), 'mono' (une seule couleur), 'tinted' (niveaux de gris, iOS). */
function glyphSvg(size = 'full', tone = 'color', ink = C.ink) {
  const s = shapes(GEOMETRY[size]);
  const [lit, shade] = tone === 'color' ? [C.gold, C.goldDark] : tone === 'tinted' ? ['#ffffff', '#bdbdbd'] : [ink, ink];
  return `<path d="${s.ring}" fill="none" stroke="${ink}" stroke-width="${s.sw}" stroke-linecap="round"/>`
    + `<path d="${s.line}" fill="none" stroke="${ink}" stroke-width="${s.lw}" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${s.lit}" fill="${lit}"/><path d="${s.shade}" fill="${shade}"/>`;
}

const DEFS = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${C.bgTop}"/><stop offset="1" stop-color="${C.bgBottom}"/></linearGradient>`
  + `<radialGradient id="gl" cx=".45" cy=".35" r=".6"><stop offset="0" stop-color="#fff" stop-opacity="${C.glow}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
  + `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity=".3"/></filter></defs>`;

/**
 * Icône complète dans un carré 1024.
 * shape : 'square' (plein cadre : iOS, Play Store), 'tile' (carré arrondi, avec marge), 'round', 'mac' (grille Apple), 'none'.
 */
function iconSvg({ shape = 'tile', size = 'full', inset = 0, rim = 0.16, rimW = 10, scale = 1, tone = 'color', px } = {}) {
  let plate = '';
  if (shape === 'square') plate = `<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#gl)"/>`;
  if (shape === 'tile' || shape === 'mac') {
    const m = shape === 'mac' ? 100 : inset;
    const w = 1024 - 2 * m, rx = shape === 'mac' ? 185 : w * 0.225;
    const rect = (extra) => `<rect x="${m}" y="${m}" width="${w}" height="${w}" rx="${rx}" ${extra}/>`;
    plate = rect(`fill="url(#bg)"${shape === 'mac' ? ' filter="url(#sh)"' : ''}`) + rect('fill="url(#gl)"');
    if (rim) plate += `<rect x="${m + rimW / 2}" y="${m + rimW / 2}" width="${w - rimW}" height="${w - rimW}" rx="${rx - rimW / 2}" fill="none" stroke="#fff" stroke-opacity="${rim}" stroke-width="${rimW}"/>`;
    if (shape === 'mac') scale *= w / 1024;
    else if (inset) scale *= w / 1024;
  }
  if (shape === 'round') {
    plate = `<circle cx="512" cy="512" r="512" fill="url(#bg)"/><circle cx="512" cy="512" r="512" fill="url(#gl)"/>`;
    if (rim) plate += `<circle cx="512" cy="512" r="${512 - rimW / 2}" fill="none" stroke="#fff" stroke-opacity="${rim}" stroke-width="${rimW}"/>`;
  }
  const g = glyphSvg(size, tone);
  const glyph = scale === 1 ? g : `<g transform="translate(512 512) scale(${r1(scale * 1000) / 1000}) translate(-512 -512)">${g}</g>`;
  const dim = px ? ` width="${px}" height="${px}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"${dim}>${DEFS}${plate}${glyph}</svg>`;
}

/** Glyphe seul centré dans un cadre w × h (écrans de démarrage). */
function splashSvg(w, h, ratio) {
  const s = (Math.min(w, h) * ratio) / 1024;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${C.page}"/>`
    + `<g transform="translate(${w / 2} ${h / 2}) scale(${s}) translate(-512 -512)">${glyphSvg('full')}</g></svg>`;
}


// ---------- Android : dessins vectoriels ----------

function vectorGlyph(size, tone, scale) {
  const s = shapes(GEOMETRY[size]);
  const hex = (c) => '#FF' + c.slice(1).toUpperCase();
  const [lit, shade] = tone === 'color' ? [hex(C.gold), hex(C.goldDark)] : ['#FFFFFFFF', '#FFFFFFFF'];
  return `    <group android:pivotX="512" android:pivotY="512" android:scaleX="${scale}" android:scaleY="${scale}">
        <path android:pathData="${s.ring}" android:strokeColor="#FFFFFFFF" android:strokeWidth="${s.sw}" android:strokeLineCap="round" android:fillColor="#00000000"/>
        <path android:pathData="${s.line}" android:strokeColor="#FFFFFFFF" android:strokeWidth="${s.lw}" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/>
        <path android:pathData="${s.lit}" android:fillColor="${lit}"/>
        <path android:pathData="${s.shade}" android:fillColor="${shade}"/>
    </group>`;
}

const vector = (dp, body, aapt = false) => `<?xml version="1.0" encoding="utf-8"?>
<!-- Généré par scripts/make-icons.cjs : ne pas modifier à la main. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"${aapt ? '\n    xmlns:aapt="http://schemas.android.com/aapt"' : ''}
    android:width="${dp}dp"
    android:height="${dp}dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
${body}
</vector>
`;

const argb = (c, a = 1) => '#' + Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase() + c.slice(1).toUpperCase();
const ANDROID_BG = vector(108, `    <path android:pathData="M0,0h1024v1024h-1024z">
        <aapt:attr name="android:fillColor">
            <gradient android:type="linear" android:startX="0" android:startY="0" android:endX="358.4" android:endY="1024">
                <item android:offset="0" android:color="${argb(C.bgTop)}"/>
                <item android:offset="1" android:color="${argb(C.bgBottom)}"/>
            </gradient>
        </aapt:attr>
    </path>
    <path android:pathData="M0,0h1024v1024h-1024z">
        <aapt:attr name="android:fillColor">
            <gradient android:type="radial" android:centerX="460.8" android:centerY="358.4" android:gradientRadius="614.4">
                <item android:offset="0" android:color="${argb('#ffffff', C.glow)}"/>
                <item android:offset="1" android:color="#00FFFFFF"/>
            </gradient>
        </aapt:attr>
    </path>`, true);

// Zone sûre de l'icône adaptative : cercle de 66 dp dans 108 dp. La pointe sort à ≈ 415 unités du centre.
const ADAPTIVE_SCALE = 0.75;
const ADAPTIVE = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`;

// ---------- Encodeurs PNG (RVB sans transparence pour iOS), ICO et ICNS ----------

const CRC = new Int32Array(256).map((_, k) => { let c = k; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const x of buf) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function rgbPng(rgba, w, h) {
  const zlib = require('node:zlib');
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * w + x) * 4, d = y * row + 1 + x * 3;
    raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head[e] = size >= 256 ? 0 : size; head[e + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map((x) => x.png)]);
}
function icns(entries) {
  const parts = entries.map(({ type, png }) => { const h = Buffer.alloc(8); h.write(type, 0, 'ascii'); h.writeUInt32BE(png.length + 8, 4); return Buffer.concat([h, png]); });
  const body = Buffer.concat(parts), h = Buffer.alloc(8);
  h.write('icns', 0, 'ascii'); h.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([h, body]);
}
function pngSize(file) { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }

// ---------- Moteur de rendu (Electron ou Playwright) ----------

const PAGE_JS = `window.raster = async (svg, w, h, raw) => {
  const img = new Image();
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  await img.decode();
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
  if (!raw) return c.toDataURL('image/png').split(',')[1];
  const d = ctx.getImageData(0, 0, w, h).data; let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
  return btoa(s);
}; true;`;

async function engine() {
  if (process.versions.electron) {
    const { app, BrowserWindow } = require('electron');
    await app.whenReady();
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await win.loadURL('data:text/html,<html><body></body></html>');
    await win.webContents.executeJavaScript(PAGE_JS);
    return { run: (js) => win.webContents.executeJavaScript(js), close: () => app.quit() };
  }
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.evaluate(PAGE_JS);
  return { run: (js) => page.evaluate(js), close: () => browser.close() };
}

// ---------- Génération ----------

(async () => {
  const E = await engine();
  const render = async (svg, w, h = w) => Buffer.from(await E.run(`raster(${JSON.stringify(withPxOnce(svg, w, h))}, ${w}, ${h}, false)`), 'base64');
  const renderRgb = async (svg, px) => rgbPng(Buffer.from(await E.run(`raster(${JSON.stringify(withPxOnce(svg, px, px))}, ${px}, ${px}, true)`), 'base64'), px, px);
  const write = (rel, data) => { const f = path.join(ROOT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); console.log(rel); };

  // Petites tailles : glyphe simplifié et liseré plus marqué. Grandes : glyphe complet, petite marge.
  const winIcon = (px) => (px <= 32
    ? iconSvg({ size: 'small', rim: 0.22, rimW: 40 })
    : iconSvg({ inset: Math.round(1024 * 0.03), rim: 0.16, rimW: 10 }));
  const macIcon = (px) => iconSvg({ shape: 'mac', size: px <= 32 ? 'small' : 'full', rim: px <= 32 ? 0.2 : 0.14, rimW: px <= 32 ? 30 : 8 });

  // Sources SVG
  write('public/icon.svg', iconSvg({ rim: 0.16, rimW: 10 }));
  write('branding/svg/icone.svg', iconSvg({ rim: 0.16, rimW: 10 }));
  write('branding/svg/icone-plein-cadre.svg', iconSvg({ shape: 'square' }));
  write('branding/svg/icone-petite-taille.svg', iconSvg({ size: 'small', rim: 0.22, rimW: 40 }));
  write('branding/svg/glyphe.svg', iconSvg({ shape: 'none' }));
  write('branding/svg/glyphe-monochrome.svg', iconSvg({ shape: 'none', tone: 'mono' }));
  write('branding/svg/fond.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${DEFS}<rect width="1024" height="1024" fill="url(#bg)"/><rect width="1024" height="1024" fill="url(#gl)"/></svg>`);

  // Windows / Electron
  write('build/icon.png', await render(winIcon(1024), 1024));
  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
  write('build/icon.ico', ico(await Promise.all(icoSizes.map(async (s) => ({ size: s, png: await render(winIcon(s), s) })))));
  write('build/tray.png', await render(winIcon(16), 16));
  write('build/tray@2x.png', await render(winIcon(32), 32));

  // macOS
  const icnsTypes = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024], ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512]];
  const icnsPx = { ic11: 16, ic12: 32, ic13: 128, ic14: 256 }; // @2x : dessin de la taille logique
  write('build/icon.icns', icns(await Promise.all(icnsTypes.map(async ([type, px]) => ({ type, png: await render(macIcon(icnsPx[type] ?? px), px) })))));

  // iOS (à copier dans ios/App/App/Assets.xcassets/AppIcon.appiconset après « npx cap add ios »)
  const ios = 'branding/ios/AppIcon.appiconset';
  write(`${ios}/AppIcon-1024.png`, await renderRgb(iconSvg({ shape: 'square' }), 1024));
  write(`${ios}/AppIcon-1024-dark.png`, await render(iconSvg({ shape: 'none' }), 1024));
  write(`${ios}/AppIcon-1024-tinted.png`, await renderRgb(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#000"/>${glyphSvg('full', 'tinted')}</svg>`, 1024));
  const img = (file, appearance) => ({ ...(appearance ? { appearances: [{ appearance: 'luminosity', value: appearance }] } : {}), filename: file, idiom: 'universal', platform: 'ios', size: '1024x1024' });
  write(`${ios}/Contents.json`, JSON.stringify({ images: [img('AppIcon-1024.png'), img('AppIcon-1024-dark.png', 'dark'), img('AppIcon-1024-tinted.png', 'tinted')], info: { author: 'xcode', version: 1 } }, null, 2) + '\n');

  // Android
  write('branding/android/play-store-512.png', await render(iconSvg({ shape: 'square' }), 512));
  if (fs.existsSync(RES)) {
    const res = (rel) => path.relative(ROOT, path.join(RES, rel));
    write(res('drawable/ic_launcher_background.xml'), ANDROID_BG);
    write(res('drawable/ic_launcher_foreground.xml'), vector(108, vectorGlyph('full', 'color', ADAPTIVE_SCALE)));
    write(res('drawable/ic_launcher_monochrome.xml'), vector(108, vectorGlyph('full', 'mono', ADAPTIVE_SCALE)));
    write(res('drawable/ic_stat_boussole.xml'), vector(24, vectorGlyph('small', 'mono', 0.86)));
    write(res('mipmap-anydpi-v26/ic_launcher.xml'), ADAPTIVE);
    write(res('mipmap-anydpi-v26/ic_launcher_round.xml'), ADAPTIVE);
    write(res('values/ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${C.bgBottom}</color>\n</resources>\n`);
    // Anciennes versions d'Android (7.x) : icônes bitmap.
    for (const [d, f] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
      const px = Math.round(48 * f);
      write(res(`mipmap-${d}/ic_launcher.png`), await render(iconSvg({ inset: Math.round(1024 * 0.04), rim: 0.16, rimW: 14 }), px));
      write(res(`mipmap-${d}/ic_launcher_round.png`), await render(iconSvg({ shape: 'round', rim: 0.16, rimW: 14, scale: 0.92 }), px));
      const old = path.join(RES, `mipmap-${d}`, 'ic_launcher_foreground.png');
      if (fs.existsSync(old)) fs.unlinkSync(old); // remplacé par le dessin vectoriel
    }
    const oldV24 = path.join(RES, 'drawable-v24', 'ic_launcher_foreground.xml');
    if (fs.existsSync(oldV24)) fs.unlinkSync(oldV24); // masquerait drawable/ic_launcher_foreground.xml
    // Écrans de démarrage : on remplace chaque splash.png existant à la même taille.
    for (const dir of fs.readdirSync(RES).filter((x) => x.startsWith('drawable'))) {
      const file = path.join(RES, dir, 'splash.png');
      if (!fs.existsSync(file)) continue;
      const { w, h } = pngSize(file);
      write(res(`${dir}/splash.png`), await render(splashSvg(w, h, 0.34), w, h));
    }
  }
  await E.close();
})().catch((e) => { console.error(e); process.exit(1); });

function withPxOnce(svg, w, h) {
  return /^<svg[^>]*\swidth="/.test(svg) ? svg : svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
}
