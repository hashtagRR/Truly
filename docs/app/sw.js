// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 hashtagRR

// Lets Truly open and play saved music without a connection. Only public
// files are cached: the app itself, the music list, the models once used, and
// the recordings a listener chose to keep for offline listening. Nothing
// personal is stored here.

const VERSION = "v1";
const SHELL = `truly-shell-${VERSION}`;
const MODELS = `truly-models-${VERSION}`;
const MUSIC = "truly-offline-music";
const NETWORK_WAIT_MS = 4000;

const SHELL_FILES = [
  "./",
  "index.html",
  "app.css",
  "app.js",
  "music.js",
  "store.js",
  "checkin.json",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "../fonts/atkinson-hyperlegible-latin-400-normal.woff2",
  "../fonts/atkinson-hyperlegible-latin-700-normal.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL, MODELS, MUSIC]);
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith("truly-") && !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Tries the network first so updates arrive, and falls back to the cached
// copy when the network fails or is too slow.
async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), NETWORK_WAIT_MS)),
    ]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

// Models and the runtime are large and change only with their file names,
// so after the first download they come from the cache.
async function cacheFirst(request) {
  const cache = await caches.open(MODELS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

// Serves a saved recording, answering range requests so seeking works.
async function savedAudio(request) {
  const cache = await caches.open(MUSIC);
  const cached = await cache.match(request.url);
  if (!cached) return fetch(request);
  const range = request.headers.get("range");
  if (!range) return cached;
  const blob = await cached.blob();
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const size = blob.size;
  let start = match && match[1] ? Number(match[1]) : 0;
  let end = match && match[2] ? Number(match[2]) : size - 1;
  if (match && !match[1] && match[2]) {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  }
  if (start >= size || end < start) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/Truly-music/audio/") || url.pathname.endsWith(".mp3")) {
    event.respondWith(savedAudio(request));
  } else if (url.pathname.includes("/models/") || url.pathname.includes("/vendor/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
