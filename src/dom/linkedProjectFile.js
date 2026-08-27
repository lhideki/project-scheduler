const DB_NAME = "project-scheduler-linked-files";
const DB_VERSION = 1;
const STORE_NAME = "file-handles";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_open_failed"));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("indexeddb_request_failed"));
  });
}

async function accessStore(mode, callback) {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(STORE_NAME, mode);
    const result = await callback(transaction.objectStore(STORE_NAME));
    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("indexeddb_transaction_failed"));
      transaction.onabort = () => reject(transaction.error || new Error("indexeddb_transaction_aborted"));
    });
    return result;
  } finally {
    db.close();
  }
}

export function supportsPersistentFileHandle() {
  return typeof window !== "undefined"
    && typeof window.showOpenFilePicker === "function"
    && typeof indexedDB !== "undefined";
}

export async function getLinkedFileHandle(key) {
  try {
    return await accessStore("readonly", store => requestResult(store.get(key)));
  } catch (e) {
    return null;
  }
}

export async function saveLinkedFileHandle(key, handle) {
  await accessStore("readwrite", store => requestResult(store.put(handle, key)));
}

export async function pickLinkedProjectFile() {
  if (!supportsPersistentFileHandle()) return null;
  const handles = await window.showOpenFilePicker({
    id: "project-scheduler-linked-json",
    multiple: false,
    excludeAcceptAllOption: true,
    types: [{
      description: "Project Scheduler JSON",
      accept: { "application/json": [".json"] },
    }],
  });
  return handles && handles[0] ? handles[0] : null;
}

export async function queryLinkedFilePermission(handle) {
  if (!handle || typeof handle.queryPermission !== "function") return "prompt";
  try {
    return await handle.queryPermission({ mode: "read" });
  } catch (e) {
    return "prompt";
  }
}

export async function requestLinkedFilePermission(handle) {
  if (!handle || typeof handle.requestPermission !== "function") return "denied";
  try {
    return await handle.requestPermission({ mode: "read" });
  } catch (e) {
    return "denied";
  }
}

export async function readLinkedProjectFile(handle) {
  const file = await handle.getFile();
  return {
    name: file.name,
    lastModified: file.lastModified,
    text: await file.text(),
  };
}
