export function precacheList(bundleFiles: string[], publicFiles: string[]): string[] {
  return [
    ...new Set(
      [
        "/",
        ...bundleFiles.filter((file) => /\.(js|css|woff2|ttf|otf)$/.test(file)),
        ...publicFiles.filter(
          (file) =>
            file === "manifest.webmanifest" ||
            file.startsWith("icons/") ||
            /^cards\/.*\.(webp|png|svg|jpe?g)$/.test(file),
        ),
      ].map((file) => (file.startsWith("/") ? file : "/" + file)),
    ),
  ].sort();
}
import { createHash } from "node:crypto";

export function buildIdentity(
  bundleFiles: string[],
  publicFiles: Record<string, Uint8Array | string>,
): string {
  const publicHashes = precacheList([], Object.keys(publicFiles))
    .filter((url) => url !== "/")
    .map((url) => [url, createHash("sha256").update(publicFiles[url.slice(1)]!).digest("hex")]);
  return createHash("sha256")
    .update(JSON.stringify([[...bundleFiles].sort(), publicHashes]))
    .digest("hex")
    .slice(0, 16);
}
