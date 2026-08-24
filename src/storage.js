/* =========================================================================================
   window.storage ラッパー
   ========================================================================================= */
// このツールは利用者のローカルブラウザ上でスタンドアロンのHTMLとして動かす想定のため、
// window.storage を localStorage を使った同期的な実装で用意する（同名の永続化APIを
// 提供するホスト環境に埋め込まれた場合はそちらを優先し、上書きしない）。
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      try {
        const v = window.localStorage.getItem(key);
        return v !== null ? { value: v } : null;
      } catch (e) {
        return null;
      }
    },
    async set(key, value) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        return false;
      }
    },
  };
}
export async function storageGet(key) {
  try { const r = await window.storage.get(key, false); return r ? JSON.parse(r.value) : null; }
  catch (e) { return null; }
}
export async function storageSet(key, value) {
  try { await window.storage.set(key, JSON.stringify(value), false); return true; }
  catch (e) { return false; }
}
