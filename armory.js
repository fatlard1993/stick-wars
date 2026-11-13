import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { NEW_LOOK, unlike } from './art.js';

/** How many weapons are kept at most: past it, the least loved and least deadly goes */
export const MOST_WEAPONS = 200;

// How well a weapon's thought of: loved, and deadly; never below a little, so every one is borrowed now and then
const regard = entry => Math.max(0.2, 1 + entry.up - entry.down + entry.kills * 0.5);

/** The ways the armory's page sorts its weapons */
export const SORTS = {
	loved: (a, b) => b.up - b.down - (a.up - a.down) || b.up - a.up,
	hated: (a, b) => b.down - b.up - (a.down - a.up) || b.down - a.down,
	// Many votes, split down the middle
	controversial: (a, b) => Math.min(b.up, b.down) * 2 - Math.abs(b.up - b.down) * 0.5 - (Math.min(a.up, a.down) * 2 - Math.abs(a.up - a.down) * 0.5) || b.up + b.down - (a.up + a.down),
	deadliest: (a, b) => b.kills - a.kills || b.uses - a.uses,
};

/**
 * The armory: every weapon a player has drawn (one too like a weapon already in it isn't kept again), with how often it's
 * fought, how many it's killed, and the thumbs players have given it. Players can borrow one instead of drawing their own,
 * and the computer arms its side from it too. Kept in a file of its own (or only in memory, with none).
 */
export default class Armory {
	constructor(file = null) {
		this.file = file;
		this.list = null;
	}

	load() {
		if (this.list) return this.list;
		try {
			this.list = this.file && existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : [];
		} catch {
			this.list = [];
		}

		return this.list;
	}

	// Written only once it's been read: a list never loaded is never written over the one in the file
	save() {
		if (!this.file || !this.list) return;
		mkdirSync(dirname(this.file), { recursive: true });
		writeFileSync(this.file, JSON.stringify(this.list));
	}

	/** A new armory stocked with weapons drawn before it was opened (each new one kept, as if just drawn): once, only */
	stockOnce(items) {
		if (!this.file || existsSync(this.file)) return;
		this.load();
		for (const item of items) if (item?.raw && item.shape) this.offer(item);
		this.save();
	}

	get(id) {
		return id ? this.load().find(entry => entry.id === id) : undefined;
	}

	/**
	 * A weapon a player drew, kept if it's new to the armory
	 * @param {object} item - The weapon as judged (art.js), its `raw` strokes among it
	 * @returns {string|null} Its entry, or null if one like it is there already
	 */
	offer(item) {
		const list = this.load();

		if (list.some(entry => unlike(entry.item.raw, item.raw) <= NEW_LOOK)) return null;

		const { drawn: _drawn, armory: _armory, ...weapon } = item;
		const entry = { id: Math.random().toString(36).slice(2, 10), item: weapon, up: 0, down: 0, votes: {}, uses: 0, kills: 0, born: Date.now() };

		list.push(entry);
		while (list.length > MOST_WEAPONS) {
			const worst = list.filter(other => other !== entry).sort((a, b) => regard(a) - regard(b) || a.born - b.born)[0];

			list.splice(list.indexOf(worst), 1);
		}
		this.save();

		return entry.id;
	}

	/** Some weapons to arm a side with, the better thought of the likelier, each at most once: their entries */
	lend(count) {
		const left = [...this.load()], out = [];

		while (out.length < count && left.length) {
			let roll = Math.random() * left.reduce((sum, entry) => sum + regard(entry), 0);
			const at = Math.max(0, left.findIndex(entry => (roll -= regard(entry)) < 0));

			out.push(left.splice(at, 1)[0]);
		}

		return out;
	}

	/** A player's thumb on a weapon: 1 up, -1 down, 0 taken back; one each, changed as they like */
	vote(id, voter, thumb) {
		const entry = this.get(id);

		if (!entry || typeof voter !== 'string' || !voter || voter.length > 64 || ![1, -1, 0].includes(thumb)) return null;
		if (thumb) entry.votes[voter] = thumb;
		else delete entry.votes[voter];
		entry.up = Object.values(entry.votes).filter(v => v > 0).length;
		entry.down = Object.values(entry.votes).filter(v => v < 0).length;
		this.save();

		return entry;
	}

	/** A battle fought: each weapon in it used once more, and the kills it made */
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

	/** The armory as its page shows it, sorted one of the ways: each weapon's drawing and numbers, and a voter's own thumb */
	listing(sort, voter) {
		return [...this.load()]
			.sort(SORTS[sort] ?? SORTS.loved)
			.map(({ id, item, up, down, votes, uses, kills }) => ({ id, raw: item.raw, name: item.stats?.name, up, down, uses, kills, mine: votes[voter] ?? 0 }));
	}
}
