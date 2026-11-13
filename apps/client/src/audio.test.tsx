import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { useSound } from "./audio";
import { clearSaved } from "./storage";

afterEach(() => {
  clearSaved("palace-muted");
  vi.unstubAllGlobals();
});

it("renders sound initial state and saves mute changes when storage throws", () => {
  const blocked = () => {
    throw new Error("Storage blocked");
  };
  vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked, removeItem: blocked });
  clearSaved("palace-muted");
  const sounds: ReturnType<typeof useSound>[] = [];
  function Probe() {
    const sound = useSound();
    sounds.push(sound);
    return <span>{String(sound.muted)}</span>;
  }
  expect(renderToStaticMarkup(<Probe />)).toBe("<span>false</span>");
  expect(() => sounds[0]!.setMuted(true)).not.toThrow();
  expect(renderToStaticMarkup(<Probe />)).toBe("<span>true</span>");
  expect(() => sounds[1]!.setMuted(false)).not.toThrow();

  vi.stubGlobal("window", { location: { pathname: "/" } });
  vi.stubGlobal("navigator", { onLine: true });
  const markup = renderToStaticMarkup(<App />);
  expect(markup).toContain("Create or join a room");
  expect(markup).toContain("Display name");
});
