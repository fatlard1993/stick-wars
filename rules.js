// What the game is, shared by the server, which runs it, and the page, which draws it, so the two can't disagree.
// Stick Men Wars: each side draws its army (stick men, wall stones, catapult beams, ammo, weapons) against the clock,
// then the drawings fight: walls, catapults and stick men, last man standing wins. The battle itself is battle.js.

/** The kinds of art, in the order they're drawn, each with how long there is to draw it (seconds) */
export const STEPS = [
	{ kind: 'stickmen', seconds: 45, title: 'Draw your stick men' },
	{ kind: 'stones', seconds: 25, title: 'Draw stones for the wall' },
	{ kind: 'beams', seconds: 25, title: 'Draw beams for the catapults' },
	{ kind: 'ammo', seconds: 25, title: 'Draw catapult ammo' },
	{ kind: 'swords', seconds: 40, title: 'Draw weapons in the box' },
];

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

/** A new game's state, for a mode */
export const newState = mode => ({
	mode: mode === 'duo' ? 'duo' : 'cpu',
	// Waiting for players, drawing, at war, or a battle won
	phase: 'draw',
	// Who sits on each side: team 0 (blue) and team 1 (green, the computer's in a game against it)
	seats: [null, null],
	// Each side's art, by kind
	art: [emptyArt(), emptyArt()],
	// How far each side is through drawing: which step, and seconds left in it
	drawing: [newDrawing(), newDrawing()],
	// The last battle's end: { winner (0, 1, or -1 for nobody), stats }
	result: null,
	// How many battles this game has had
	battles: 0,
});

export const emptyArt = () => Object.fromEntries(STEPS.map(({ kind }) => [kind, []]));

export const newDrawing = () => ({ step: 0, left: STEPS[0].seconds, done: false });

/** The sides played by people in this game: both against a friend, blue alone against the computer */
export const humanTeams = state => (state.mode === 'duo' ? [0, 1] : [0]);

/** Whose art each side fights with: against the computer, both armies are made from the player's drawings */
export const artOf = state => (state.mode === 'duo' ? [0, 1] : [0, 0]);
