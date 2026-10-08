/**
 * Оффлайн-копии книг на этом устройстве.
 *
 * Не service worker и не общий Cache API: туда попали бы чужие сессии.
 * IndexedDB привязан к этому браузеру; книга лежит как Blob, читать её
 * можно без сети и без живого токена /api/files.
 */

const DB_NAME = "blablablarden-offline";
const STORE = "books";
const VERSION = 1;

export type OfflineBookMeta = {
  id: string;
  title: string;
  fileType: string;
  savedAt: number;
  bytes: number;
};

type OfflineBookRow = OfflineBookMeta & { blob: Blob };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineBook(id: string): Promise<OfflineBookRow | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    const row = await requestToPromise(
      db.transaction(STORE, "readonly").objectStore(STORE).get(id),
    );
    return (row as OfflineBookRow | undefined) ?? null;
  } finally {
    db.close();
  }
}

export async function saveOfflineBook(row: OfflineBookRow) {
  const db = await openDb();
  try {
    await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(row));
  } finally {
    db.close();
  }
}

export async function removeOfflineBook(id: string) {
  const db = await openDb();
  try {
    await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } finally {
    db.close();
  }
}

export async function hasOfflineBook(id: string) {
  const row = await getOfflineBook(id);
  return Boolean(row?.blob);
}
