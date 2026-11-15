// Petit magasin clé-valeur IndexedDB (base « boussole-cache », magasin « kv ») : données de marché et historiques,
// trop volumineux pour le stockage local. Un confort : en cas d'échec, on lit null et on n'écrit rien.

const DB_NAME = 'boussole-cache';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB indisponible')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

export async function idbGet<T>(key: string): Promise<T | null> {
  return run<T>('readonly', (s) => s.get(key) as IDBRequest<T>);
}

export async function idbPut(key: string, value: unknown): Promise<void> {
  await run('readwrite', (s) => s.put(value, key));
}
