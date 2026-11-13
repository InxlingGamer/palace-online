import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, transformWithEsbuild, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { buildIdentity, precacheList } from "./precache";

const buildPlaceholder = "PALACE_BUILD_TAG_";
async function publicFiles(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? publicFiles(path.join(directory, entry.name), prefix + entry.name + "/")
          : Promise.resolve([prefix + entry.name]),
      ),
    )
  ).flat();
}

function appShell(): Plugin {
  return {
    name: "palace-app-shell",
    apply: "build",
    enforce: "post",
    async generateBundle(_options, bundle) {
      const files = Object.keys(bundle).sort();
      const publicDirectory = fileURLToPath(new URL("./public", import.meta.url));
      const urls = precacheList(files, await publicFiles(publicDirectory));
      const publicContents = Object.fromEntries(
        await Promise.all(
          urls
            .filter((url) => url !== "/" && !files.includes(url.slice(1)))
            .map(
              async (url) =>
                [url.slice(1), await readFile(path.join(publicDirectory, url.slice(1)))] as const,
            ),
        ),
      );
      const buildId = buildIdentity(files, publicContents);
      // Patch after naming chunks to avoid a circular build-id/content-hash dependency.
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk")
          output.code = output.code.replaceAll(buildPlaceholder, buildId);
      }
      const source = await readFile(new URL("./src/sw/service-worker.ts", import.meta.url), "utf8");
      const compiled = await transformWithEsbuild(source, "service-worker.ts", {
        target: "es2022",
        format: "iife",
        minify: true,
        define: { __PRECACHE__: JSON.stringify(urls), __BUILD_ID__: JSON.stringify(buildId) },
      });
      this.emitFile({ type: "asset", fileName: "sw.js", source: compiled.code });
      this.emitFile({ type: "asset", fileName: "build.json", source: JSON.stringify({ buildId }) });
    },
  };
}

export default defineConfig(({ command }) => ({
  define: { __PALACE_BUILD__: JSON.stringify(command === "build" ? buildPlaceholder : "dev") },
  plugins: [react(), appShell()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
      "/healthz": { target: "http://localhost:3001", changeOrigin: true },
      "/socket.io": { target: "ws://localhost:3001", ws: true },
    },
  },
  build: { sourcemap: true },
}));
