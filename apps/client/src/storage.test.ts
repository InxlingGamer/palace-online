import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSaved,
  forgetRoom,
  loadSaved,
  markPresented,
  rememberRoom,
  savedName,
  savedRoom,
  saveSaved,
} from "./storage";

function storage() {
  const values: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
    removeItem: (key: string) => {
      delete values[key];
    },
  });
  // Enumeration matches the native Storage object.
  vi.stubGlobal(
    "localStorage",
    new Proxy(localStorage, {
      ownKeys: () => Object.keys(values),
      getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    }),
  );
  return values;
}
afterEach(() => {
  forgetRoom();
  clearSaved("palace-name");
  vi.unstubAllGlobals();
});
describe("saved seat", () => {
  it("saves, loads and forgets the room while keeping the name", () => {
    storage();
    rememberRoom("ABC234", "Ada");
    expect(savedRoom()).toBe("ABC234");
    expect(savedName()).toBe("Ada");
    forgetRoom();
    expect(savedRoom()).toBeNull();
    expect(savedName()).toBe("Ada");
  });
  it("works when access throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error();
      },
      setItem: () => {
        throw new Error();
      },
      removeItem: () => {
        throw new Error();
      },
    });
    rememberRoom("ABC234", "Ada");
    expect(savedRoom()).toBe("ABC234");
    forgetRoom();
    expect(savedRoom()).toBeNull();
    saveSaved("palace-boot-ABC234", "boot");
    expect(loadSaved("palace-boot-ABC234")).toBe("boot");
    clearSaved("palace-boot-ABC234");
  });
  it.each(["palace-deal-", "palace-result-"])("keeps ten newest %s markers", (prefix) => {
    const values = storage();
    for (let index = 0; index < 12; index++) markPresented(`${prefix}test-${index}`);
    expect(Object.keys(values).filter((key) => key.startsWith(prefix))).toHaveLength(10);
    expect(loadSaved(`${prefix}test-0`)).toBeNull();
    expect(loadSaved(`${prefix}test-11`)).toBe("true");
    for (let index = 0; index < 12; index++) clearSaved(`${prefix}test-${index}`);
    clearSaved("palace-recent-" + prefix);
  });
});
