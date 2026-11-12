// The field the battle is fought on, and the geometry the server's battle (battle.js) and the page (client/) share:
// its size, where things stand, how its depth is drawn, catapults' shape, a fling's path, the orders men take.

import { BONES, PI, clamp } from './art.js';

export const W = 1900, H = 860, GROUND = 780, GRAV = 900, DT = 1 / 60;
export const SM_H = 80;
export const WALL = { cols: 3, rows: 7, cw: 34, ch: 22 };
export const ARMY = 12, AMMO = 6, RELOAD = 4.5;
/** The fastest a catapult flings, in world units a second */
export const MOST_FLING = 1350;
export const CAT_REST = PI - 0.3, CAT_FIRE = 1.5 * PI + 0.35, CAT_ARM = 74, CAT_PIV = -56;
export const WALL_X = [430, W - 430 - WALL.cols * WALL.cw];
export const CAT_X = [
	[90, 220],
	[W - 90, W - 220],
];
/** How long a side waits between sending stick men out one at a time, in seconds */
export const SEND_EVERY = 0.4;
/** How many can crew one catapult: one to fire it at all, each more loading it faster */
export const MOST_CREW = 3;
/** How close an enemy comes before a man who isn't charging turns to fight him */
export const ENGAGE = 150;
/** What a man can be told to do: stay home, crew a catapult, hold by the wall, or charge */
export const ORDERS = ['idle', 'crew', 'repair', 'hold', 'charge'];
/** Each order as a page is sent it, one letter apiece */
export const ORDER_CODE = { idle: 'i', crew: 'w', repair: 'r', hold: 'h', charge: 'c' };
/** How far one hammer blow rebuilds a smashed catapult (it takes this many over one): a long job alone, quicker together */
export const REBUILD_PER_BLOW = 0.06;
/** How much one blow mends a damaged catapult */
export const MEND_PER_BLOW = 8;

/** How long the dead and the wreckage lie before they fade (seconds): men and their parts, loose things, fallen stones */
export const LINGER = { body: 8, prop: 6, brick: 6 };
/** How long fading takes, in seconds */
export const FADE = 2.5;

/** How much of something is left as it fades: 1 until it's lain its while, then down to 0 */
export const faded = (age, linger) => clamp(1 - (age - linger) / FADE, 0, 1);

/** How deep the field runs, front to back, in world units */
export const DEPTH = 190;
/** How the field's depth is drawn: each unit back slides a point this far right and up, and the back row this small */
export const SKEW_X = 0.28, SKEW_Y = 0.55, BACK_SCALE = 0.82;
/** How close in depth two men must be to cross blades */
export const LANE = 16;
/** Where the side's two catapults stand in depth: one forward, one back */
export const CAT_Z = [55, 140];

/** How small a thing at depth z is drawn */
export const depthScale = z => 1 - (1 - BACK_SCALE) * (z / DEPTH);

/**
 * Where a point of the world is drawn: x, y of a thing standing at depth z, whose own ground point is at ax. Its ground
 * point slides back and up the field; its height above the ground shrinks with distance.
 * @returns {[number, number]} The point on the page
 */
export const project = (x, y, z, ax = x) => {
	const k = depthScale(z);

	return [ax + z * SKEW_X + (x - ax) * k, GROUND - z * SKEW_Y + (y - GROUND) * k];
};

/** Where a side's k-th man stands at home: in rows behind his wall, four along and three deep */
export const homeOf = (team, k) => {
	const x = 270 + (k % 4) * 42 + (Math.floor(k / 4) % 2) * 20;
	const z = 28 + Math.floor(k / 4) * 62;

	return { x: team === 0 ? x : W - x, z };
};

export const ADJ = BONES.map(a => BONES.map(b => a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]));

export const subtreeMask = b => {
	const m = new Array(10).fill(false), st = [b];

	while (st.length) {
		const x = st.pop();

		m[x] = true;
		for (let k = 0; k < 10; k++) if (BONES[k][0] === BONES[x][1] && !m[k]) st.push(k);
	}

	return m;
};

// ---------------------------------------------------------------- geometry the page shares

/** A catapult's parts, from where it stands, which way it faces and where its arm is */
export const catGeometry = (x, dir, arm) => {
	const L = (lx, ly) => [x + lx * dir, GROUND + ly];
	const p = L(0, CAT_PIV);
	const armEnd = a => [p[0] + Math.cos(a) * CAT_ARM * dir, p[1] + Math.sin(a) * CAT_ARM];
	const back = [p[0] - Math.cos(arm) * 14 * dir, p[1] - Math.sin(arm) * 14];

	return {
		L,
		pivot: p,
		launch: armEnd(CAT_FIRE - 0.35),
		wheels: [L(-32, -13), L(32, -13)],
		segs: [
			[L(-48, -24), L(48, -24)],
			[L(-28, -24), L(0, -64)],
			[L(28, -24), L(0, -64)],
			[back, armEnd(arm)],
		],
	};
};

/** How thick a beam is drawn across a span: as drawn, but never fatter than a plank */
export const beamScale = (item, len) => Math.min(len, 9 / Math.max(item.wr, 0.01));

/** A fling's path from a catapult, as points, stopping where it meets the ground (groundAt: x to the top of whatever's
 * there): for aiming */
export const flingPath = (from, vx, vy, groundAt = () => GROUND) => {
	const out = [];
	let [x, y] = from;

	for (let i = 0; i < 200; i++) {
		vy += GRAV / 60;
		x += vx / 60;
		y += vy / 60;
		if (x < 0 || x > W || (vy > 0 && y > groundAt(x))) break;
		out.push([x, y]);
	}

	return out;
};

/** A fling's speed, held to what a catapult can do */
export const holdFling = (vx, vy) => {
	const m = Math.hypot(vx, vy);

	return m > MOST_FLING ? [(vx * MOST_FLING) / m, (vy * MOST_FLING) / m] : [vx, vy];
};

