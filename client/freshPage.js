import { GET } from '@vanilla-bean/components';

// How often a page asks which build is out, in ms
const LOOK_EVERY = 20_000;

// What would be lost to a reload right now: each a function saying so (a line being drawn, a drawing not kept)
const busy = new Set();

/**
 * Something that a reload would lose, while it's so: a page won't reload itself while any says it's busy
 * @param {Function} isBusy - Whether it's busy now
 * @returns {Function} No longer asked
 */
export const holdReload = isBusy => {
	busy.add(isBusy);

	return () => busy.delete(isBusy);
};

/**
 * Keep this page the newest build: it asks now and then (and when it's back in view) which build is out, and once a
 * newer one is, reloads itself the first moment nothing would be lost. A game's page comes back where it was (the
 * server holds the game), so a player gets every fix without being told to reload.
 */
export const stayFresh = async () => {
	const ask = async () => (await GET('/build', { apiId: 'build', invalidateAfter: 0 }).catch(() => null))?.body?.build ?? null;
	const mine = await ask();
	let newer = false;

	if (!mine) return;

	const look = async () => {
		if (!newer) {
			const out = await ask();

			newer = Boolean(out && out !== mine);
		}
		if (newer && ![...busy].some(isBusy => isBusy())) window.location.reload();
	};

	setInterval(look, LOOK_EVERY);
	// Newer and waiting for a quiet moment: tried again often
	setInterval(() => newer && look(), 2000);
	document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && look());
};
