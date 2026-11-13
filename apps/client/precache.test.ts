import { expect, it } from "vitest";
import { precacheList } from "./precache";

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
