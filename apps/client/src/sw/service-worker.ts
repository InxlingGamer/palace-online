/// <reference lib="webworker" />

// This file is compiled independently by Vite, with no runtime imports.
declare const __PRECACHE__: string[];
declare const __BUILD_ID__: string;
const worker = globalThis as unknown as ServiceWorkerGlobalScope;
const cacheName = `palace-${__BUILD_ID__}`;
const precache = new Set(__PRECACHE__);
const trusted = (response: Response) => response.ok && response.headers.get("X-Palace-App") === "1";

worker.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      await Promise.all(
        [...precache].map(async (url) => {
          const response = await fetch(url === "/" ? "/index.html" : url, { cache: "reload" });
          if (!trusted(response)) throw new Error(`Untrusted precache response: ${url}`);
          await cache.put(url, response);
        }),
      );
      await worker.skipWaiting();
    })(),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter((key) => key.startsWith("palace-") && key !== cacheName)
          .map((key) => caches.delete(key)),
      );
      await worker.clients.claim();
    })(),
  );
});

async function navigate(request: Request): Promise<Response> {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(request, { signal: controller.signal, cache: "no-store" });
    if (trusted(response)) {
      // Read the body inside the deadline too: a proxy can stall after its headers.
      const body = await response.blob();
      const headers = new Headers(response.headers);
      headers.delete("Content-Encoding");
      headers.delete("Content-Length");
      const shell = new Response(body, { status: response.status, headers });
      await cache.put("/", shell.clone());
      return shell;
    }
  } catch {
    /* Use our shell while offline, waking, or behind a foreign proxy page. */
  } finally {
    clearTimeout(timer);
  }
  return (await cache.match("/")) ?? Response.error();
}

async function staticGet(request: Request, cacheFirst: boolean): Promise<Response> {
  const cache = await caches.open(cacheName);
  if (cacheFirst) {
    const cached = await cache.match(request);
    if (cached) return cached;
  }
  try {
    const response = await fetch(request);
    if (trusted(response)) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) ?? Response.error();
  }
}

worker.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== worker.location.origin ||
    /^\/(api|socket\.io)(\/|$)/.test(url.pathname) ||
    url.pathname === "/healthz"
  )
    return;
  event.respondWith(
    request.mode === "navigate"
      ? navigate(request)
      : staticGet(request, precache.has(url.pathname)),
  );
});
