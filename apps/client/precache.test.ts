import { expect, it } from "vitest";
import { buildIdentity, precacheList } from "./precache";

it("includes the shell, emitted code and woff2 fonts, icons and card art without maps or docs", () => {
  expect(
    precacheList(
      [
        "assets/app.js",
        "assets/app.css",
        "assets/font.woff2",
        "assets/font.woff",
        "assets/app.js.map",
        "index.html",
      ],
      [
        "manifest.webmanifest",
        "icons/icon-192.png",
        "cards/classic/back-red.webp",
        "cards/README.md",
        "other.txt",
        "icons/icon-192.png",
      ],
    ),
  ).toEqual([
    "/",
    "/assets/app.css",
    "/assets/app.js",
    "/assets/font.woff2",
    "/cards/classic/back-red.webp",
    "/icons/icon-192.png",
    "/manifest.webmanifest",
  ]);
});

it("changes build identity when only precached public bytes change", () => {
  const bundle = ["index.html", "assets/app-unchanged.js"];
  const original = { "icons/icon-192.png": new Uint8Array([1, 2]), "cards/back.svg": "old" };
  const identity = buildIdentity(bundle, original);
  expect(buildIdentity(bundle, { ...original, "cards/back.svg": "new" })).not.toBe(identity);
  expect(
    buildIdentity(bundle, { ...original, "icons/icon-192.png": new Uint8Array([1, 3]) }),
  ).not.toBe(identity);
  expect(
    buildIdentity([...bundle].reverse(), {
      "cards/back.svg": "old",
      "icons/icon-192.png": new Uint8Array([1, 2]),
    }),
  ).toBe(identity);
});
