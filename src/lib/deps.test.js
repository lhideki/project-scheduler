import { describe, it, expect } from "vitest";
import { parseDepInput, parseDepString, dedupeDeps, formatDepLabel, formatDeps } from "./deps.js";

const noToId = { "1": "id-1", "2": "id-2", "1.1": "id-1-1" };

describe("parseDepString", () => {
  it("空文字/未入力は空配列を返す", () => {
    expect(parseDepString("", noToId)).toEqual([]);
    expect(parseDepString(undefined, noToId)).toEqual([]);
    expect(parseDepString("   ", noToId)).toEqual([]);
  });

  it("型・ラグ省略時はFS+0として解釈する", () => {
    expect(parseDepString("1", noToId)).toEqual([{ id: "id-1", type: "FS", lag: 0 }]);
  });

  it("型とラグ（+/-）を解釈する", () => {
    expect(parseDepString("1FS+2", noToId)).toEqual([{ id: "id-1", type: "FS", lag: 2 }]);
    expect(parseDepString("2SS-1", noToId)).toEqual([{ id: "id-2", type: "SS", lag: -1 }]);
    expect(parseDepString("1.1FF", noToId)).toEqual([{ id: "id-1-1", type: "FF", lag: 0 }]);
  });

  it("小文字の型表記も受け付ける", () => {
    expect(parseDepString("1fs+3", noToId)).toEqual([{ id: "id-1", type: "FS", lag: 3 }]);
  });

  it("カンマ区切りで複数指定でき、存在しないWBS番号は無視する", () => {
    expect(parseDepString("1, 2SS-1, 99FS", noToId)).toEqual([
      { id: "id-1", type: "FS", lag: 0 },
      { id: "id-2", type: "SS", lag: -1 },
    ]);
  });

  it("同じ先行タスクへの重複指定は後勝ちで1本にまとめる", () => {
    expect(parseDepString("1FS, 1SS-2", noToId)).toEqual([{ id: "id-1", type: "SS", lag: -2 }]);
  });

  it("不正なトークンは無視する", () => {
    expect(parseDepString("abc, 1FS", noToId)).toEqual([{ id: "id-1", type: "FS", lag: 0 }]);
  });
});

describe("dedupeDeps", () => {
  it("同一idの依存関係は最後の1本だけ残す", () => {
    const deps = [
      { id: "a", type: "FS", lag: 0 },
      { id: "b", type: "SS", lag: 1 },
      { id: "a", type: "FF", lag: 2 },
    ];
    expect(dedupeDeps(deps)).toEqual([
      { id: "a", type: "FF", lag: 2 },
      { id: "b", type: "SS", lag: 1 },
    ]);
  });
});

describe("formatDepLabel / formatDeps", () => {
  it("ラグ0は符号を付けない", () => {
    expect(formatDepLabel({ type: "FS", lag: 0 })).toBe("FS");
  });
  it("正のラグは+付き、負のラグはそのまま", () => {
    expect(formatDepLabel({ type: "FS", lag: 2 })).toBe("FS+2");
    expect(formatDepLabel({ type: "SS", lag: -1 })).toBe("SS-1");
  });
  it("formatDepsはWBS番号+ラベルをカンマ区切りで連結する", () => {
    const idToNo = { "id-1": "1", "id-2": "2" };
    const deps = [{ id: "id-1", type: "FS", lag: 1 }, { id: "id-2", type: "SS", lag: 0 }];
    expect(formatDeps(deps, idToNo)).toBe("1FS+1, 2SS");
  });
  it("idToNoに存在しない参照は除外する", () => {
    const idToNo = { "id-1": "1" };
    const deps = [{ id: "id-1", type: "FS", lag: 0 }, { id: "id-ghost", type: "FS", lag: 0 }];
    expect(formatDeps(deps, idToNo)).toBe("1FS");
  });
  it("空/未指定はから文字列を返す", () => {
    expect(formatDeps([], {})).toBe("");
    expect(formatDeps(undefined, {})).toBe("");
  });
});

describe("parseDepInput", () => {
  it("reports all invalid tokens and keeps valid tokens available for diagnostics", () => {
    expect(parseDepInput("1FS, 99SS-1, abc,", noToId)).toEqual({
      deps: [{ id: "id-1", type: "FS", lag: 0 }],
      errors: [
        { code: "unknown-wbs", no: "99", token: "99SS-1", index: 1 },
        { code: "invalid-format", token: "abc", index: 2 },
        { code: "invalid-format", token: "", index: 3 },
      ],
    });
  });
  it.each(["1FS+2", "1SS-2", "1FF", "1SF", "1fs + 2", "1, 2SS-1", "", "   "])("accepts the existing syntax: %s", text => {
    expect(parseDepInput(text, noToId).errors).toEqual([]);
  });
  it.each(["1XX", "1FS+1.5", "1FS+99999999999999999999", "１ＦＳ", "1FS;2SS"])("rejects invalid syntax: %s", text => {
    expect(parseDepInput(text, noToId).errors).toHaveLength(1);
  });
});
