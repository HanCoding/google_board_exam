/**
 * 모두의 게시판 서비스 워커
 *
 * 앱 셸(HTML/CSS/JS/아이콘)만 캐시합니다.
 * Apps Script API 호출과 Google 로그인 스크립트는 교차 출처이며
 * 아래 fetch 핸들러에서 가로채지 않으므로 항상 네트워크로 직접 나갑니다.
 *
 * 앱 셸 파일을 수정하면 CACHE_VERSION을 올려야 기존 사용자에게 갱신됩니다.
 */

"use strict";

const CACHE_VERSION = "v2";
const CACHE_NAME = `board-shell-${CACHE_VERSION}`;
const OFFLINE_URL = "./index.html";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
  "./app.js",
  "./manifest.json",
  "./assets/favicon.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 파일 하나가 실패해도 설치 전체가 실패하지 않도록 개별 처리합니다.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: "reload" }));
          } catch (error) {
            console.warn("[sw] 프리캐시 실패:", url, error);
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith("board-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // 교차 출처(Apps Script API, Google 로그인)와 GET 이외 요청은 건드리지 않습니다.
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigate(request));
    return;
  }

  event.respondWith(handleAsset(request));
});

/** 화면 이동은 네트워크 우선 — 배포 직후 최신 HTML을 받도록 합니다. */
async function handleNavigate(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(OFFLINE_URL, response.clone());
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(request)) || (await caches.match(OFFLINE_URL));
    if (cached) return cached;
    throw error;
  }
}

/** 정적 자산은 캐시를 먼저 보여주고 뒤에서 조용히 갱신합니다. */
async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      // 오류·불투명 응답을 캐시에 남기지 않습니다.
      if (response.ok && response.type === "basic") cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;

  const response = await network;
  if (response) return response;
  throw new Error(`오프라인 상태이며 캐시에 없습니다: ${request.url}`);
}
