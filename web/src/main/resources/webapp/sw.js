/*
 * Service worker for offline play.
 *
 * The cache name embeds a build stamp injected by BuildWeb, so every deploy
 * precaches into a fresh cache. The new worker activates on the next app
 * launch after a deploy (no skipWaiting), which means a running game session
 * is never switched to mismatched files mid-play; old caches are deleted on
 * activation.
 *
 * Install precaches the app shell plus every asset listed in
 * assets/preload.txt (including all region music), so the game is fully
 * playable offline after the first online launch completes.
 */
const CACHE = 'shpd-%BUILD_VERSION%';
const CORE = [
	'./',
	'./index.html',
	'./dungeon.js',
	'./manifest.webmanifest',
	'./icon_128.png',
	'./icon_256.png',
	'./scripts/freetype.js',
	'./scripts/gdx.wasm.js',
	'./scripts/howler.js',
	'./assets/preload.txt'
];

async function preloadAssetList(cache) {
	const manifest = await (await cache.match('./assets/preload.txt')).text();
	return manifest.split('\n')
		.map((line) => line.split(':'))
		.filter((parts) => parts.length >= 3 && parts[2].startsWith('/'))
		.map((parts) => './assets' + parts[2]);
}

self.addEventListener('install', (event) => {
	event.waitUntil((async () => {
		const cache = await caches.open(CACHE);
		await cache.addAll(CORE);
		const files = await preloadAssetList(cache);
		// first pass in small chunks (kind to iOS), tolerating transient failures
		const CHUNK = 20;
		for (let i = 0; i < files.length; i += CHUNK) {
			await Promise.all(files.slice(i, i + CHUNK).map(async (f) => {
				try {
					if (!(await cache.match(f))) await cache.add(f);
				} catch (e) { /* retried in the strict pass below */ }
			}));
		}
		// strict pass: offline support must be complete or install fails and retries
		for (const f of files) {
			if (!(await cache.match(f))) await cache.add(f);
		}
	})());
});

self.addEventListener('activate', (event) => {
	event.waitUntil((async () => {
		for (const key of await caches.keys()) {
			if (key !== CACHE) await caches.delete(key);
		}
		await self.clients.claim();
	})());
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
	event.respondWith((async () => {
		const cache = await caches.open(CACHE);
		const cached = await cache.match(event.request, { ignoreSearch: true })
			|| (event.request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
		if (cached) return cached;
		const resp = await fetch(event.request);
		if (resp.ok) cache.put(event.request, resp.clone());
		return resp;
	})());
});
