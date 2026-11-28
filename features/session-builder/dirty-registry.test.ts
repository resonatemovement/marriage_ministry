import { afterEach, describe, expect, it, vi } from "vitest";

import { hasUnsavedSessionBuilderChangesInOtherTab, sessionBuilderDirtyMarkerKey } from "./dirty-registry";

class TestStorage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe("cross-tab Session Builder dirty markers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("detects another tab's recent unsaved edits for the target Session", () => {
    const storage = new TestStorage();
    vi.stubGlobal("localStorage", storage);
    storage.setItem(sessionBuilderDirtyMarkerKey("destination", "tab-a"), String(Date.now()));
    expect(hasUnsavedSessionBuilderChangesInOtherTab("destination")).toBe(true);
    expect(hasUnsavedSessionBuilderChangesInOtherTab("unrelated")).toBe(false);
  });

  it("removes expired stale markers instead of blocking moves forever", () => {
    const storage = new TestStorage();
    vi.stubGlobal("localStorage", storage);
    storage.setItem(sessionBuilderDirtyMarkerKey("destination", "closed-tab"), String(Date.now() - 3 * 60 * 1000));
    expect(hasUnsavedSessionBuilderChangesInOtherTab("destination")).toBe(false);
    expect(storage.length).toBe(0);
  });

  it("fails closed if browser storage cannot be inspected", () => {
    vi.stubGlobal("localStorage", { get length() { throw new Error("blocked"); } });
    expect(hasUnsavedSessionBuilderChangesInOtherTab("destination")).toBeNull();
  });
});
