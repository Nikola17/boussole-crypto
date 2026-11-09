// Génère les icônes (Windows + Android) et les écrans de démarrage Android à partir du logo vectoriel.
// Utilisation : npx electron scripts/make-icons.cjs   (Electron sert de moteur de rendu)
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const BRAND = '#1c5cab';
const DARK = '#0d0d0d';

const glyph = `
  <circle cx="256" cy="256" r="170" fill="none" stroke="#ffffff" stroke-opacity="0.9" stroke-width="22"/>
  <polygon points="256,104 296,256 256,236 216,256" fill="#ffffff"/>
  <polygon points="256,408 216,256 256,276 296,256" fill="#ffffff" fill-opacity="0.45"/>
  <circle cx="256" cy="256" r="20" fill="#ffffff"/>`;
const SVG_SQUARE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${BRAND}"/>${glyph}</svg>`;
const SVG_ROUND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="${BRAND}"/>${glyph}</svg>`;
const SVG_GLYPH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${glyph}</svg>`;

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body></body></html>');
  await win.webContents.executeJavaScript(`
    window.render = async (svg, w, h, bg, scale) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;base64,' + btoa(svg);
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
      const size = Math.min(w, h) * scale;
      ctx.drawImage(img, (w - size) / 2, (h - size) / 2, size, size);
      return c.toDataURL('image/png').split(',')[1];
    };
    true;
  `);
  const render = async (svg, w, h, bg = null, scale = 1) =>
    Buffer.from(await win.webContents.executeJavaScript(`render(${JSON.stringify(svg)}, ${w}, ${h}, ${JSON.stringify(bg)}, ${scale})`), 'base64');

  // Windows / Electron
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), await render(SVG_SQUARE, 1024, 1024));
  console.log('build/icon.png');

  if (fs.existsSync(RES)) {
    const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
    for (const [d, f] of Object.entries(densities)) {
      const dir = path.join(RES, `mipmap-${d}`);
      fs.mkdirSync(dir, { recursive: true });
      const legacy = Math.round(48 * f);
      const fg = Math.round(108 * f);
      fs.writeFileSync(path.join(dir, 'ic_launcher.png'), await render(SVG_SQUARE, legacy, legacy, null, 0.92));
      fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), await render(SVG_ROUND, legacy, legacy, null, 0.92));
      fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), await render(SVG_GLYPH, fg, fg, null, 0.8));
      console.log(`mipmap-${d}`);
    }
    const values = path.join(RES, 'values');
    fs.mkdirSync(values, { recursive: true });
    fs.writeFileSync(path.join(values, 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND}</color>\n</resources>\n`);
    // Écrans de démarrage : on remplace chaque splash.png existant à la même taille.
    for (const dir of fs.readdirSync(RES).filter((x) => x.startsWith('drawable'))) {
      const file = path.join(RES, dir, 'splash.png');
      if (!fs.existsSync(file)) continue;
      const { w, h } = pngSize(file);
      fs.writeFileSync(file, await render(SVG_ROUND, w, h, DARK, 0.28));
      console.log(`${dir}/splash.png ${w}x${h}`);
    }
  }
  app.quit();
});
