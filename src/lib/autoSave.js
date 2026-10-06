/**
 * デバウンス保存を直列化する。古い非同期保存の終了が新しい編集を「保存済み」にせず、
 * 古い書き込みが新しい保存を後から上書きすることもない。stateは最新revisionにのみ通知する。
 */
export function createAutoSaver({ persist, onState, delay = 800 }) {
  let revision = 0;
  let snapshot;
  let timer;
  let queue = Promise.resolve();
  let disposed = false;

  function flush() {
    clearTimeout(timer);
    const targetRevision = revision;
    const target = snapshot;
    queue = queue.then(async () => {
      if (disposed || targetRevision !== revision) return;
      let saved = false;
      try { saved = await persist(target); } catch { /* 通信・シリアライズ失敗も保存失敗 */ }
      if (!disposed && targetRevision === revision) onState(saved ? "saved" : "failed");
    });
    return queue;
  }

  return {
    update(next, { immediate = false } = {}) {
      if (disposed) return;
      snapshot = next;
      revision += 1;
      clearTimeout(timer);
      onState("pending");
      if (immediate) return flush();
      timer = setTimeout(flush, delay);
    },
    dispose() {
      disposed = true;
      revision += 1;
      clearTimeout(timer);
    },
  };
}
