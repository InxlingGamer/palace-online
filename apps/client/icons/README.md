# Home Screen icon E

`icon-e.svg` and `icon-e-maskable.svg` are the full-bleed vector sources. They embed the existing Classic red back. The maskable pair is scaled to 80% on the same felt background. The front palace paths are also used by `src/palace-art.ts` for the waking screen; keep them in sync when editing the artwork.

From the repository root, with the existing Playwright Chromium installed:

```sh
node scripts/render-icons.mjs
```

This writes the 180, 192, 512, maskable 512 and 32 pixel PNGs to `public/icons/`. Commit these PNGs before building or deploying; the script is intentionally separate from the normal build. No rounded tile corners or transparency are baked into the PNGs.
