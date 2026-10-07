/**
 * 保存状態は通知時のスナップショットだけを表す。次の編集が描画されてから
 * update が呼ばれるまでの間も、以前の「保存済み」を新しい編集へ表示しない。
 * 復元失敗中はスナップショットに関係なく警告と復旧操作を維持する。
 */
export function getAutoSaveStatus(state, snapshot, { restoreBlocked = false } = {}) {
  if (restoreBlocked) return "failed";
  return state && state.snapshot === snapshot ? state.status : "pending";
}

/**
 * デバウンス保存を直列化する。古い非同期保存の終了が新しい編集を「保存済み」にせず、
 * 古い書き込みが新しい保存を後から上書きすることもない。
 * state は最新revisionにのみ通知し、保存対象のスナップショットを同じ参照で含める。
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
      if (!disposed && targetRevision === revision) {
        onState({ status: saved ? "saved" : "failed", snapshot: target });
      }
    });
    return queue;
  }

  return {
    update(next, { immediate = false } = {}) {
      if (disposed) return;
      snapshot = next;
      revision += 1;
      clearTimeout(timer);
      onState({ status: "pending", snapshot: next });
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
