// Horloge de l'autopilote : l'heure d'exécution d'un jour dans le fuseau du portefeuille (jamais celui de la machine,
// qui diffère entre le téléphone et le serveur), le jour de décision (dernière bougie journalière UTC close), la semaine ISO.

/** Décalage (ms) du fuseau à l'instant donné : heure locale − heure UTC. */
function offsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - Math.floor(ms / 1000) * 1000;
}

/** Instant (ms UTC) où il est `hour` h dans le fuseau, le jour local `day` (AAAA-MM-JJ). */
export function execInstant(day: string, hour: number, timeZone: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const naive = Date.UTC(y, m - 1, d, hour);
  let t = naive - offsetMs(naive, timeZone);
  t = naive - offsetMs(t, timeZone); // second passage : le décalage de l'instant trouvé (changement d'heure)
  return t;
}

/** Jour de décision : la dernière journée UTC entièrement close à cet instant. */
export function decisionDay(execMs: number): string {
  return new Date(Math.floor(execMs / 86400_000) * 86400_000 - 86400_000).toISOString().slice(0, 10);
}

export function localDay(ms: number, timeZone: string): string {
  return new Date(ms + offsetMs(ms, timeZone)).toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
}

/** Semaine ISO (lundi), ex. « 2026-W47 ». */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow + 3); // jeudi de la semaine
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
