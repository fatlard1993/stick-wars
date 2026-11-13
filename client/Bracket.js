import { icon } from './icons.js';
import { drawRawFit } from './paint.js';
import { PENCIL, RED_PENCIL } from './theme.js';

/**
 * A tournament's bracket, drawn: each round a row of its pairings, each gladiator as its drawing; the one through ringed,
 * the one out crossed and faded, the duel being fought marked, the champion crowned
 * @param {object} state - The game's state (entrants, bracket)
 * @param {object} art - The art the page has (art.entrants: each entrant's art, by player)
 * @returns {HTMLElement} The bracket
 */
export const bracket = (state, art) => {
	const { bracket: b, entrants } = state;
	const out = document.createElement('div');

	out.style.cssText = 'display: flex; flex-direction: column; gap: 10px; align-items: center;';
	if (!b) return out;

	// Who went through each round: those in the next round's pairings, or so far this round, or the champion
	const through = round =>
		new Set(round < b.rounds.length - 1 ? b.rounds[round + 1].flat() : round === b.round ? (b.champion !== null ? [b.champion] : b.winners) : []);
	const face = (at, state) => {
		const canvas = document.createElement('canvas'), id = entrants[at]?.id;

		canvas.width = 64;
		canvas.height = 76;
		canvas.style.cssText = `width: 32px; height: 38px; border-radius: 8px; ${state === 'out' ? 'opacity: 0.35;' : ''} ${state === 'through' ? `outline: 2.5px solid ${PENCIL};` : ''}`;
		drawRawFit(canvas, art?.entrants?.[id]?.stickmen?.[0]?.raw ?? [], state === 'out' ? RED_PENCIL : PENCIL);

		return canvas;
	};

	// The duel just fought, its verdict in but the bracket not yet moved on: shown decided already
	const justFought = state.phase === 'over' && b.champion === null && state.result?.winner >= 0;

	b.rounds.forEach((pairs, round) => {
		const row = document.createElement('div'), went = through(round);

		row.style.cssText = 'display: flex; gap: 14px; justify-content: center; flex-wrap: wrap;';
		pairs.forEach((pair, match) => {
			const cell = document.createElement('span');
			const current = round === b.round && match === b.match && b.champion === null;
			const decided = round < b.round || (round === b.round && match < b.match) || b.champion !== null || (current && justFought);
			const now = current && !justFought;

			if (current && justFought) went.add(pair[state.result.winner === 1 ? 1 : 0]);

			cell.style.cssText = `display: inline-flex; gap: 2px; align-items: center; padding: 2px 6px; border-radius: 10px; ${now ? 'background: #ffe36e;' : ''}`;
			pair.forEach((at, k) => {
				if (k) cell.append(icon('sword', { size: '0.9em' }));
				cell.append(face(at, decided ? (went.has(at) ? 'through' : 'out') : 'waiting'));
			});
			row.append(cell);
		});
		out.append(row);
	});
	if (b.champion !== null) {
		const crown = document.createElement('div');

		crown.style.cssText = 'display: flex; gap: 6px; align-items: center;';
		crown.append(icon('trophy', { size: '2em' }), face(b.champion, 'through'));
		out.append(crown);
	}

	return out;
};
