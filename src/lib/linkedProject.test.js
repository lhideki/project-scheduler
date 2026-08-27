import { describe, expect, it } from "vitest";
import { getLinkedProjectKey, LINKED_PROJECT_QUERY_PARAM } from "./linkedProject.js";

describe("getLinkedProjectKey", () => {
  it("schedule queryを関連付けキーとして返す", () => {
    expect(getLinkedProjectKey("?schedule=%2FUsers%2Ftaro%2FDropbox%2Fplan.json"))
      .toBe("/Users/taro/Dropbox/plan.json");
  });

  it("Windows形式のパスをURLエンコード後の値で返す", () => {
    const path = "C:\\Users\\taro\\OneDrive\\plan.json";
    expect(getLinkedProjectKey(`?${LINKED_PROJECT_QUERY_PARAM}=${encodeURIComponent(path)}`)).toBe(path);
  });

  it("未指定または空文字ならnullを返す", () => {
    expect(getLinkedProjectKey("")).toBeNull();
    expect(getLinkedProjectKey("?schedule=%20%20")).toBeNull();
    expect(getLinkedProjectKey("?other=plan.json")).toBeNull();
  });
});
