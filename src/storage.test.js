import { afterEach, describe, expect, it, vi } from "vitest";

async function withStorage(storage) {
  vi.resetModules();
  vi.stubGlobal("window", { storage });
  return import("./storage.js");
}
afterEach(() => vi.unstubAllGlobals());

describe("storageSet", () => {
  it.each([true, undefined, { key: "pm_project" }])("accepts successful host response %j", async response => {
    const set = vi.fn().mockResolvedValue(response);
    const { storageSet } = await withStorage({ set });
    expect(await storageSet("pm_project", { tasks: [] })).toBe(true);
    expect(set).toHaveBeenCalledWith("pm_project", '{"tasks":[]}', false);
  });
  it("propagates explicit false and rejected host writes", async () => {
    const { storageSet } = await withStorage({ set: vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("quota")) });
    expect(await storageSet("p", {})).toBe(false);
    expect(await storageSet("p", {})).toBe(false);
  });
  it("reports localStorage quota failure through the default adapter", async () => {
    vi.resetModules();
    vi.stubGlobal("window", { localStorage: { setItem: () => { throw new Error("QuotaExceededError"); } } });
    const { storageSet } = await import("./storage.js");
    expect(await storageSet("p", {})).toBe(false);
  });
  it("catches serialization failure without calling the host", async () => {
    const set = vi.fn();
    const { storageSet } = await withStorage({ set });
    const circular = {}; circular.self = circular;
    expect(await storageSet("p", circular)).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });
});

describe("storageRead", () => {
  it("distinguishes missing, unreadable and loaded empty data", async () => {
    const get = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ value: "{bad" })
      .mockRejectedValueOnce(new Error("blocked")).mockResolvedValueOnce({ value: '{"tasks":[]}' });
    const { storageRead } = await withStorage({ get });
    expect(await storageRead("p")).toEqual({ status: "missing" });
    expect(await storageRead("p")).toEqual({ status: "failed" });
    expect(await storageRead("p")).toEqual({ status: "failed" });
    expect(await storageRead("p")).toEqual({ status: "loaded", value: { tasks: [] } });
  });
});
