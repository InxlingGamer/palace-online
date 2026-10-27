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
