// Mock "file storage" for uploaded photos: blobs kept in the browser's IndexedDB.
// The real store backend saves uploads to disk or object storage and returns a URL.

const DB = "stockroom-mock";
const STORE = "media";
const urls = new Map<string, string>();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putMedia(id: string, blob: Blob): Promise<string> {
  await tx("readwrite", (s) => s.put(blob, id));
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

export async function deleteMedia(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
}

/** Object URL for a stored photo, or null if it is missing (e.g. storage was cleared). */
export async function mediaUrl(id: string): Promise<string | null> {
  const cached = urls.get(id);
  if (cached) return cached;
  try {
    const blob = await tx<Blob | undefined>("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(id, url);
    return url;
  } catch {
    return null;
  }
}
