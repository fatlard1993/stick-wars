import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** How many more fights a saved gladiator may lose than it's won before it's retired */
export const MOST_BEHIND = 3;
/** How many gladiators are kept at most: past it, the worst record goes */
export const MOST_GLADIATORS = 40;

/**
 * The hall of gladiators: every one that has won a fight, kept with its record and fought again by the computer. One
 * that loses is kept a while (a few fights' grace), and retired once it's lost MOST_BEHIND more than it's won. Kept in a
 * file of its own (or only in memory, with none), outliving any one game.
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

	save() {
		if (!this.file) return;
		mkdirSync(dirname(this.file), { recursive: true });
		writeFileSync(this.file, JSON.stringify(this.list));
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
	 * A fight's end: the winner's record up (kept now, if it wasn't), the loser's down, and retired if it's fallen too far
	 * behind.
	 * @param {object} winner - { id: its entry, if it has one, art }
	 * @param {object} loser - { id: its entry, if it has one }
	 * @returns {string} The winner's entry
	 */
	record(winner, loser) {
		const list = this.load();
		let won = this.get(winner.id);

		if (!won) {
			won = { id: Math.random().toString(36).slice(2, 10), art: winner.art, wins: 0, losses: 0, born: Date.now() };
			list.push(won);
		}
		won.wins++;

		const lost = this.get(loser.id);

		if (lost) {
			lost.losses++;
			if (lost.losses - lost.wins >= MOST_BEHIND) list.splice(list.indexOf(lost), 1);
		}
		while (list.length > MOST_GLADIATORS) {
			const worst = list.filter(entry => entry !== won).sort((a, b) => a.wins - a.losses - (b.wins - b.losses) || a.born - b.born)[0];

			list.splice(list.indexOf(worst), 1);
		}
		this.save();

		return won.id;
	}
}
