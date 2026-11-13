import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, transformWithEsbuild, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { precacheList } from "./precache";

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
      const buildId = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 16);
      // Patch after naming chunks to avoid a circular build-id/content-hash dependency.
      for (const output of Object.values(bundle)) {
        if (output.type === "chunk")
          output.code = output.code.replaceAll(buildPlaceholder, buildId);
      }
      const source = await readFile(new URL("./src/sw/service-worker.ts", import.meta.url), "utf8");
      const urls = precacheList(
        files,
        await publicFiles(fileURLToPath(new URL("./public", import.meta.url))),
      );
      const compiled = await transformWithEsbuild(source, "service-worker.ts", {
        target: "es2022",
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
