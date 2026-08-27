// Unlocks all hero classes in the SPD web build by writing the unlock badges
// into badges.dat in the browser's IndexedDB virtual file system.
//
// Usage: open the game in the browser, press F12 -> Console, paste this whole
// file, press Enter, then reload the page. Any badges already earned are kept.
// (No recompile needed - hero unlocks are ordinary badge save data.)
(async () => {
	const UNLOCKS = ['UNLOCK_MAGE', 'UNLOCK_ROGUE', 'UNLOCK_HUNTRESS', 'UNLOCK_DUELIST', 'UNLOCK_CLERIC'];
	const DIR = '/shattered-pixel-dungeon/';
	const PATH = DIR + 'badges.dat/';

	const db = await new Promise((res, rej) => {
		const r = indexedDB.open('db/assets');
		r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
	});
	const get = (key) => new Promise((res) => {
		const g = db.transaction('FILE_DATA', 'readonly').objectStore('FILE_DATA').get(key);
		g.onsuccess = () => res(g.result); g.onerror = () => res(null);
	});
	const put = (val, key) => new Promise((res, rej) => {
		const tx = db.transaction('FILE_DATA', 'readwrite');
		tx.objectStore('FILE_DATA').put(val, key);
		tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
	});

	// keep badges the player already earned
	let existing = [];
	const cur = await get(PATH);
	if (cur && cur.contents) {
		try {
			existing = JSON.parse(new TextDecoder().decode(new Uint8Array(cur.contents))).badges ?? [];
		} catch (e) { /* corrupt or empty - start fresh */ }
	}
	const badges = [...new Set([...existing, ...UNLOCKS])];
	const bytes = new TextEncoder().encode(JSON.stringify({ badges }));

	// the virtual FS stores files as {type:2, date, contents:Int8Array}
	if (!(await get(DIR))) await put({ type: 1, date: new Date().toISOString() }, DIR);
	await put({ type: 2, date: new Date().toISOString(), contents: new Int8Array(bytes) }, PATH);

	console.log('Unlocked:', badges.join(', '), '- reload the page.');
})();
