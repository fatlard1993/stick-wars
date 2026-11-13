import { emptyArt, newDrawing } from './rules.js';

// A tournament of gladiators: up to eight players each draw one, then a knockout bracket of duels, one at a time, until
// one is left: the champion. Game.js runs it; this is its bookkeeping.

/** How many can enter a tournament */
export const MOST_ENTRANTS = 8;

/** A player entering: their own pages to draw on, their own clock, and no record in the hall yet */
export const newEntrant = id => ({ id, art: emptyArt('gladiator'), drawing: newDrawing('gladiator'), fame: null, gone: false });

// The entrants (by their place in the list) in a random order, two by two; an odd one out has a bye
const pairsOf = list => {
	const shuffled = [...list];

	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));

		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}

	return Array.from({ length: Math.ceil(shuffled.length / 2) }, (_, k) => shuffled.slice(k * 2, k * 2 + 2));
};

/** A bracket for entrants (their places in the list): its rounds of pairings, the one being fought, and who's through */
export const newBracket = places => ({ rounds: [pairsOf(places)], round: 0, match: 0, winners: [], champion: null });

/** The pairing up now, or null once the champion's crowned */
export const currentPair = bracket => (bracket && bracket.champion === null ? bracket.rounds[bracket.round][bracket.match] : null);

/**
 * A duel decided (or a bye, or a walkover): its winner through, and the bracket on to the next pairing, the next round,
 * or its champion
 * @returns {object} The bracket
 */
export const advance = (bracket, winner) => {
	bracket.winners.push(winner);
	bracket.match++;
	if (bracket.match < bracket.rounds[bracket.round].length) return bracket;
	if (bracket.winners.length === 1) {
		bracket.champion = bracket.winners[0];

		return bracket;
	}
	bracket.rounds.push(pairsOf(bracket.winners));
	bracket.round++;
	bracket.match = 0;
	bracket.winners = [];

	return bracket;
};
