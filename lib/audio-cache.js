const DB_NAME = 'readflow-audio-cache';
const STORE_NAME = 'audio';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generate a cache key from URL and content using SHA-256.
 */
export async function generateCacheKey(url, content) {
  const data = new TextEncoder().encode(url + '|' + content);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get cached audio by key.
 * @returns {Promise<{cacheKey, audioBlobs, url, title, timestamp, ttsModel, voice}|null>}
 */
export async function getCachedAudio(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Store audio in cache.
 * @param {string} key - Cache key
 * @param {Blob[]} blobs - Audio blobs (one per chunk)
 * @param {object} metadata - { url, title, ttsModel, voice }
 */
export async function cacheAudio(key, blobs, metadata) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put({
      cacheKey: key,
      audioBlobs: blobs,
      url: metadata.url || '',
      title: metadata.title || '',
      timestamp: Date.now(),
      ttsModel: metadata.ttsModel || '',
      voice: metadata.voice || '',
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear all cached audio.
 */
export async function clearCache() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
