/* =========================================================================================
   window.storage ラッパー
   ========================================================================================= */
// このツールは利用者のローカルブラウザ上でスタンドアロンのHTMLとして動かす想定のため、
// window.storage を localStorage を使った同期的な実装で用意する（同名の永続化APIを
// 提供するホスト環境に埋め込まれた場合はそちらを優先し、上書きしない）。
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      const v = window.localStorage.getItem(key);
      return v !== null ? { value: v } : null;
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
  const result = await storageRead(key);
  return result.status === "loaded" ? result.value : null;
}
// 起動時は「データなし」と「読めなかった」を区別し、読めない保存データを上書きしない。
export async function storageRead(key) {
  try {
    const r = await window.storage.get(key, false);
    return r == null ? { status: "missing" } : { status: "loaded", value: JSON.parse(r.value) };
  } catch (e) { return { status: "failed" }; }
}
export async function storageSet(key, value) {
  // ホスト提供APIの void / オブジェクト形式の成功応答を維持し、明示的な false を失敗とする。
  try { return (await window.storage.set(key, JSON.stringify(value), false)) !== false; }
  catch (e) { return false; }
}
