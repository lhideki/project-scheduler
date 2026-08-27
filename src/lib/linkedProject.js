export const LINKED_PROJECT_QUERY_PARAM = "schedule";

/**
 * URLのqueryから、ローカルJSONとの関連付けを識別するキーを取得する。
 * 値はOS上のパスとして直接開かず、ユーザーが選択したFileSystemFileHandleを
 * IndexedDBから取り出すためのキーとしてのみ使用する。
 */
export function getLinkedProjectKey(search = "") {
  const params = new URLSearchParams(search);
  const value = params.get(LINKED_PROJECT_QUERY_PARAM);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}
