import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** How many gladiators are kept at most: past it, the worst record goes */
export const MOST_GLADIATORS = 40;

/**
 * The hall of gladiators: every one that has won a fight, or lost one and been spared by the crowd, kept with its record
 * and fought again by the computer. One the crowd gives the thumbs down is struck from it. Kept in a file of its own (or
 * only in memory, with none), outliving any one game.
 */
export default class Roster {
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

	/** Everyone in the hall, best record first, as their drawings and records: for the hall's page */
	standings() {
		const raw = items => items?.[0]?.raw ?? null;

		return [...this.load()]
			.sort((a, b) => b.wins - b.losses - (a.wins - a.losses) || b.wins - a.wins || a.born - b.born)
			.map(({ id, wins, losses, art }) => ({ id, wins, losses, warrior: raw(art.stickmen), weapon: raw(art.swords), armor: raw(art.armor), shield: raw(art.shield) }));
	}

	get(id) {
		return id ? this.load().find(entry => entry.id === id) : undefined;
	}

	/** One to fight, the better its record the likelier; null with none kept */
	pick() {
		const list = this.load();
		const weight = entry => 1 + Math.max(0, entry.wins - entry.losses);
		let roll = Math.random() * list.reduce((sum, entry) => sum + weight(entry), 0);

		return list.find(entry => (roll -= weight(entry)) < 0) ?? null;
	}

	/**
	 * A fight's end: the winner's record up (kept now, if it wasn't). The loser's down: spared by the crowd it keeps its
	 * place (or is given one), and if not it's struck out.
	 * @param {object} winner - { id: its entry, if it has one, art }
	 * @param {object} loser - { id: its entry, if it has one, art, spared }
	 * @returns {{winner: string, loser: string|null}} Their entries now
	 */
	record(winner, loser) {
		const list = this.load();
		const enter = art => {
			const entry = { id: Math.random().toString(36).slice(2, 10), art, wins: 0, losses: 0, born: Date.now() };

			list.push(entry);

			return entry;
		};
		const won = this.get(winner.id) ?? enter(winner.art);

		won.wins++;

		let lost = this.get(loser.id);

		if (loser.spared) {
			lost ??= loser.art ? enter(loser.art) : null;
			if (lost) lost.losses++;
		} else if (lost) {
			list.splice(list.indexOf(lost), 1);
			lost = null;
		}
		while (list.length > MOST_GLADIATORS) {
			const worst = list.filter(entry => entry !== won && entry !== lost).sort((a, b) => a.wins - a.losses - (b.wins - b.losses) || a.born - b.born)[0];

			list.splice(list.indexOf(worst), 1);
		}
		this.save();

		return { winner: won.id, loser: lost?.id ?? null };
	}
}
