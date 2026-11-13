import { NAMED_AT_WINS, gladiatorName } from './names.js';
import Store from './store.js';

/** How many gladiators are kept at most: past it, the worst record goes */
export const MOST_GLADIATORS = 40;

/** How many of the fallen are remembered: past it, the longest gone are forgotten */
export const MOST_FALLEN = 60;

/**
 * The hall of gladiators: every one that has won a fight, or lost one and been spared by the crowd, kept with its record
 * and fought again by the computer. One the crowd gives the thumbs down is struck from it, and remembered among the
 * fallen (`fallenAt`): never fought or enlisted again. Kept in a file of its own (or only in memory, with none),
 * outliving any one game.
 */
export default class Roster extends Store {
	// Those still in the hall
	living() {
		return this.load().filter(entry => !entry.fallenAt);
	}

	/** One still in the hall, by its id (the fallen are gone from it) */
	get(id) {
		const entry = super.get(id);

		return entry && !entry.fallenAt ? entry : undefined;
	}

	/** Everyone in the hall, best record first, as their drawings and records: for the hall's page */
	standings() {
		return [...this.living()].sort((a, b) => b.wins - b.losses - (a.wins - a.losses) || b.wins - a.wins || a.born - b.born).map(Roster.card);
	}

	/** The fallen, the most recently fallen first, as the hall shows its own: for the fallen's page */
	fallen() {
		return this.load()
			.filter(entry => entry.fallenAt)
			.sort((a, b) => b.fallenAt - a.fallenAt)
			.map(entry => ({ ...Roster.card(entry), fallenAt: entry.fallenAt }));
	}

	// One gladiator as a page shows it: its drawings, its record, and its name once earned
	static card({ id, wins, losses, art }) {
		const raw = items => items?.[0]?.raw ?? null;

		return {
			id,
			wins,
			losses,
			// A name, once it's won enough to earn one
			...(wins >= NAMED_AT_WINS && { name: gladiatorName(art) }),
			warrior: raw(art.stickmen),
			weapon: raw(art.swords),
			armor: raw(art.armor),
			shield: raw(art.shield),
		};
	}

	/** One to fight, the better its record the likelier (none of those `taken`); null with none kept */
	pick(taken = []) {
		const list = this.living().filter(entry => !taken.includes(entry.id));
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
			// Struck from the hall, and remembered among the fallen
			lost.fallenAt = Date.now();
			lost = null;
		}
		while (this.living().length > MOST_GLADIATORS) {
			const worst = this.living().filter(entry => entry !== won && entry !== lost).sort((a, b) => a.wins - a.losses - (b.wins - b.losses) || a.born - b.born)[0];

			list.splice(list.indexOf(worst), 1);
		}
		const fallen = list.filter(entry => entry.fallenAt).sort((a, b) => a.fallenAt - b.fallenAt);

		for (const gone of fallen.slice(0, Math.max(0, fallen.length - MOST_FALLEN))) list.splice(list.indexOf(gone), 1);
		this.save();

		return { winner: won.id, loser: lost?.id ?? null };
	}
}
