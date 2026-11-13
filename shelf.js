import { existsSync } from 'node:fs';

import { NEW_LOOK, unlike } from './art.js';
import Store from './store.js';

/** How many drawings a shelf keeps at most: past it, the least loved (and least deadly) goes */
export const MOST_ON_SHELF = 200;

/** How many players' thumbs one drawing keeps: past it, a new voter's thumb isn't counted */
export const MOST_VOTERS = 2000;

// How well a drawing's thought of: loved, and deadly; never below a little, so every one is borrowed now and then
const regard = entry => Math.max(0.2, 1 + entry.up - entry.down + entry.kills * 0.5);

/** The ways a shelf's page sorts its drawings */
export const SORTS = {
	loved: (a, b) => b.up - b.down - (a.up - a.down) || b.up - a.up,
	hated: (a, b) => b.down - b.up - (a.down - a.up) || b.down - a.down,
	// Many votes, split down the middle
	controversial: (a, b) => Math.min(b.up, b.down) * 2 - Math.abs(b.up - b.down) * 0.5 - (Math.min(a.up, a.down) * 2 - Math.abs(a.up - a.down) * 0.5) || b.up + b.down - (a.up + a.down),
	deadliest: (a, b) => b.kills - a.kills || b.uses - a.uses,
};

/**
 * A shelf of drawings players have made, voted on with thumbs. The armory is one: every weapon a player has drawn (one too
 * like a weapon already in it isn't kept again), with how often it's fought, how many it's killed, and the thumbs players
 * have given it; players can borrow one instead of drawing their own, and the computer arms its side from it too. The
 * crowd is another: the stick men players have drawn, who watch from the arena's stands. Kept in a file of its own (or
 * only in memory, with none).
 */
export default class Shelf extends Store {
	/**
	 * @param {string} [file] - Where it's kept
	 * @param {object} [options] - { alike(a, b): whether two drawings are too alike to keep both, show(item): what its
	 *   page is sent of each drawing }
	 */
	constructor(file = null, { alike = (a, b) => unlike(a.raw, b.raw) <= NEW_LOOK, show = item => ({ raw: item.raw, name: item.stats?.name }) } = {}) {
		super(file);
		this.alike = alike;
		this.show = show;
	}

	/** A new shelf stocked with drawings made before it was opened (each new one kept, as if just drawn): once, only */
	stockOnce(items) {
		if (!this.file || existsSync(this.file)) return;
		this.load();
		for (const item of items) if (item?.raw) this.offer(item);
		this.flush();
	}

	/**
	 * A drawing a player made, kept if it's new to the shelf
	 * @param {object} item - The drawing as judged (art.js), its `raw` strokes among it
	 * @returns {string|null} Its entry, or null if one like it is there already
	 */
	offer(item) {
		const list = this.load();

		if (list.some(entry => this.alike(entry.item, item))) return null;

		const { drawn: _drawn, armory: _armory, ...weapon } = item;
		const entry = { id: Store.id(), item: weapon, up: 0, down: 0, votes: {}, uses: 0, kills: 0, born: Date.now() };

		list.push(entry);
		while (list.length > MOST_ON_SHELF) {
			const worst = list.filter(other => other !== entry).sort((a, b) => regard(a) - regard(b) || a.born - b.born)[0];

			list.splice(list.indexOf(worst), 1);
		}
		this.save();

		return entry.id;
	}

	/** Some drawings to lend (weapons to arm a side with), the better thought of the likelier, each at most once: their entries */
	lend(count) {
		const left = [...this.load()], out = [];

		while (out.length < count && left.length) {
			let roll = Math.random() * left.reduce((sum, entry) => sum + regard(entry), 0);
			const at = Math.max(0, left.findIndex(entry => (roll -= regard(entry)) < 0));

			out.push(left.splice(at, 1)[0]);
		}

		return out;
	}

	/** A player's thumb on a drawing: 1 up, -1 down, 0 taken back; one each, changed as they like */
	vote(id, voter, thumb) {
		const entry = this.get(id);

		if (!entry || typeof voter !== 'string' || !voter || voter.length > 64 || ![1, -1, 0].includes(thumb)) return null;
		if (thumb && !(voter in entry.votes) && Object.keys(entry.votes).length >= MOST_VOTERS) return entry;
		if (thumb) entry.votes[voter] = thumb;
		else delete entry.votes[voter];
		entry.up = Object.values(entry.votes).filter(v => v > 0).length;
		entry.down = Object.values(entry.votes).filter(v => v < 0).length;
		this.save();

		return entry;
	}

	/** A battle fought: each weapon in it used once more, and the kills it made (the armory's) */
	fought(uses, kills) {
		for (const id of new Set(uses)) {
			const entry = this.get(id);

			if (entry) entry.uses++;
		}
		for (const [id, count] of Object.entries(kills)) {
			const entry = this.get(id);

			if (entry) entry.kills += count;
		}
		this.save();
	}

	/** The shelf as its page shows it, sorted one of the ways (the first `take` of them): each drawing and its numbers, and a voter's own thumb */
	listing(sort, voter, take = MOST_ON_SHELF) {
		return [...this.load()]
			.sort(SORTS[sort] ?? SORTS.loved)
			.slice(0, Math.max(1, Math.min(MOST_ON_SHELF, Number(take) || MOST_ON_SHELF)))
			.map(({ id, item, up, down, votes, uses, kills }) => ({ id, ...this.show(item), up, down, uses, kills, mine: votes[voter] ?? 0 }));
	}
}
