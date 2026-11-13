import { NAMED_AT_WINS, gladiatorName } from './names.js';
import Store from './store.js';

/** How many gladiators are kept at most: past it, the worst record goes */
export const MOST_GLADIATORS = 40;

/**
 * The hall of gladiators: every one that has won a fight, or lost one and been spared by the crowd, kept with its record
 * and fought again by the computer. One the crowd gives the thumbs down is struck from it. Kept in a file of its own (or
 * only in memory, with none), outliving any one game.
 */
export default class Roster extends Store {
	/** Everyone in the hall, best record first, as their drawings and records: for the hall's page */
	standings() {
		const raw = items => items?.[0]?.raw ?? null;

		return [...this.load()]
			.sort((a, b) => b.wins - b.losses - (a.wins - a.losses) || b.wins - a.wins || a.born - b.born)
			.map(({ id, wins, losses, art }) => ({
				id,
				wins,
				losses,
				// A name, once it's won enough to earn one
				...(wins >= NAMED_AT_WINS && { name: gladiatorName(art) }),
				warrior: raw(art.stickmen),
				weapon: raw(art.swords),
				armor: raw(art.armor),
				shield: raw(art.shield),
			}));
	}

	/** One to fight, the better its record the likelier (none of those `taken`); null with none kept */
	pick(taken = []) {
		const list = this.load().filter(entry => !taken.includes(entry.id));
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
			const entry = { id: Store.id(), art, wins: 0, losses: 0, born: Date.now() };

			list.push(entry);

			return entry;
		};
		const won = this.get(winner.id) ?? enter(winner.art);

		won.wins++;
		// Kept as it won: enlisted again, its weapon may be another
		if (winner.art) won.art = winner.art;

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
