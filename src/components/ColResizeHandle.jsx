import React from "react";

/** WBS表ヘッダーの列境界に置く、列幅調整用のドラッグハンドル。
 *  WBSGanttView のレンダーごとに再生成されない、安定したモジュールスコープのコンポーネントとして定義する
 *  （もしコンポーネント本体の中で定義すると、ドラッグ中の setState のたびに型参照が変わり、
 *  DOM ノードが再マウントされて addEventListener ベースのドラッグ状態が失われてしまうため）。 */
export function ColResizeHandle({ onResizeStart, onReset }) {
  return (
    <div
      onPointerDown={onResizeStart}
      onDoubleClick={onReset}
      title="ドラッグで列幅を変更（ダブルクリックで既定幅に戻す）"
      className="absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize hover:bg-indigo-400/60 active:bg-indigo-500/70 z-20"
      style={{ touchAction: "none" }}
    />
  );
}
