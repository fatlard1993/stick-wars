import { freshOf } from './art.js';

// What the game is, shared by the server, which runs it, and the page, which draws it, so the two can't disagree.
// Stick Men Wars: each side draws its army (stick men, wall stones, catapult beams, ammo, weapons) against the clock,
// then the drawings fight: walls, catapults and stick men, last man standing wins. Or, as gladiators, each draws one
// warrior with its weapon, armor and shield, and the two fight it out in the arena. The battle itself is battle.js.

/** The kinds of art, in the order they're drawn, each with how long there is to draw it (seconds) */
export const STEPS = [
	{ kind: 'stickmen', seconds: 45, title: 'Draw your stick men' },
	{ kind: 'stones', seconds: 25, title: 'Draw stones for the wall' },
	{ kind: 'beams', seconds: 25, title: 'Draw beams for the catapult' },
	{ kind: 'ammo', seconds: 25, title: 'Draw rocks for the catapult' },
	{ kind: 'swords', seconds: 40, title: 'Draw weapons in the box' },
];

/** A gladiator's pages: one warrior, its weapon, and armor and a shield if wanted (left empty, it fights without) */
export const GLADIATOR_STEPS = [
	{ kind: 'stickmen', seconds: 60, title: 'Draw your gladiator' },
	{ kind: 'swords', seconds: 50, title: 'Draw its weapon in the box' },
	{ kind: 'armor', seconds: 60, title: 'Armor? Draw it on', optional: true },
	{ kind: 'shield', seconds: 45, title: 'A shield?', optional: true },
];

/** The two ways to play: a war of armies, or one gladiator against another; each with its pages */
export const STYLES = { war: STEPS, gladiator: GLADIATOR_STEPS };

/** The pages a game draws on, for its style */
export const stepsOf = state => STYLES[state?.style] ?? STEPS;

/** How many drawings of one kind a side keeps, at most */
export const MOST_KEPT = 12;

/** Against the computer, or two players each on their own device */
export const MODES = { cpu: 'vs computer', duo: 'two players' };

/** The two sides: blue on the left, green on the right */
export const TEAMS = [
	{ name: 'Blue', ink: '#1f3f9e' },
	{ name: 'Green', ink: '#1c6e35' },
];

/** How often the game moves on and every page is sent the picture, in ms */
export const TICK_MS = 50;

/** A new game's state, for a mode and a style */
export const newState = (mode, style) => ({
	mode: mode === 'duo' ? 'duo' : 'cpu',
	style: style === 'gladiator' ? 'gladiator' : 'war',
	// Which saved gladiator (the hall of them, roster.js) each side fights with, if it's one: a gladiators' fight only
	fame: [null, null],
	// Drawing, fighting, or a battle over
	phase: 'draw',
	// Who sits on each side: team 0 (blue) and team 1 (green, the computer's in a game against it)
	seats: [null, null],
	art: [emptyArt(style), emptyArt(style)],
	// How far each side is through drawing: which step, and seconds left in it
	drawing: [newDrawing(style), newDrawing(style)],
	// The last battle's end: { winner (0, 1, or -1 for nobody), stats }
	result: null,
	battles: 0,
});

export const emptyArt = style => Object.fromEntries((STYLES[style] ?? STEPS).map(({ kind }) => [kind, []]));

/** How many men a side has with none of the bonus, and how many the bonus can add */
export const BASE_ARMY = 10, MOST_BONUS = 6;

// Only what was drawn counts toward a bonus, never the defaults (kept drawings carry `drawn`)
const drawnOf = items => (items ?? []).filter(item => item.drawn).length;

// And of stick men and weapons, only the different ones: copies of one don't count
const newOf = (kind, items) => freshOf(kind, (items ?? []).filter(item => item.drawn)).filter(Boolean).length;

/** A side's army: ten men, and one more for each different stick man and weapon drawn past the first of each */
export const armySize = art =>
	BASE_ARMY + Math.min(MOST_BONUS, Math.max(0, newOf('stickmen', art?.stickmen) - 1) + Math.max(0, newOf('swords', art?.swords) - 1));

/** The computer's side: a middling army and wall, what a person drawing a fair few of each would get */
export const CPU_SIZE = { army: BASE_ARMY + MOST_BONUS / 2, wall: { cols: 3, rows: 7 } };

/** A side's wall: six stones high and three thick; a row higher for each stone drawn past the first (three at most),
 * and a column thicker for five or more */
export const wallSize = art => {
	const stones = drawnOf(art?.stones);

	return { cols: 3 + (stones >= 5 ? 1 : 0), rows: 6 + Math.min(3, Math.max(0, stones - 1)) };
};

export const newDrawing = style => ({ step: 0, left: (STYLES[style] ?? STEPS)[0].seconds, done: false });

/** The sides played by people in this game: both against a friend, blue alone against the computer */
export const humanTeams = state => (state.mode === 'duo' ? [0, 1] : [0]);

/** Whose art each side fights with: always its own; the computer's is drawn for it (art.js cpuArmy) */
export const artOf = () => [0, 1];
