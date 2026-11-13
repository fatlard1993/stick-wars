// The field the battle is fought on, and the geometry the server's battle (battle.js) and the page (client/) share:
// its size, where things stand, how its depth is drawn, catapults' shape, a fling's path, the orders men take.

import { BONES, PI, clamp } from './art.js';

export const W = 1900, H = 860, GROUND = 780, GRAV = 900, DT = 1 / 60;
export const SM_H = 80;
export const WALL = { cols: 3, rows: 7, cw: 34, ch: 22 };
/** A side's army with no say in it (a test's), how many rocks a side can draw for its catapult in a battle, and how long it
 * takes to load the next */
export const ARMY = 12, AMMO = 10, RELOAD = 4.5;
/** The fastest a catapult flings, in world units a second */
export const MOST_FLING = 1350;
export const CAT_REST = PI - 0.3, CAT_FIRE = 1.5 * PI + 0.35, CAT_ARM = 74, CAT_PIV = -56;
export const WALL_X = [430, W - 430 - WALL.cols * WALL.cw];
/** How far either side of the arena's middle its two gates stand, in its back wall: where gladiators walk out */
export const ARENA_GATE = 330;
/** Each side's catapult, behind its wall among its army's rows: where it starts */
export const CAT_X = [[170], [W - 170]];
/** How far forward a catapult can be rolled from there: to halfway, short of the middle */
export const CAT_FORWARD = W / 2 - 150 - CAT_X[0][0];
/** How fast a catapult rolls, in world units a second: its crew push it, each more a little faster */
export const CAT_ROLL = 22;
/** Where a side's catapult may stand, nearest home first: [home, furthest forward] */
export const catRange = team => (team === 0 ? [CAT_X[0][0], CAT_X[0][0] + CAT_FORWARD] : [CAT_X[1][0], CAT_X[1][0] - CAT_FORWARD]);
/** How long a side waits between sending stick men out one at a time, in seconds */
export const SEND_EVERY = 0.4;
/** How many can crew one catapult: one to fire it at all, each more loading it faster */
export const MOST_CREW = 3;
/** How close an enemy comes before a man who isn't charging turns to fight him */
export const ENGAGE = 150;
/** What a man can be told to do: stay home, crew the catapult, repair it or the wall, hold by the wall, or charge */
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
/** Where each side's catapult stands in depth */
export const CAT_Z = [95];

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

/** Where a side's k-th man of n stands at home: in rows behind his wall, four along, the rows spread front to back */
export const homeOf = (team, k, n = 12) => {
	const rows = Math.max(1, Math.ceil(n / 4)), row = Math.floor(k / 4);
	const x = 270 + (k % 4) * 42 + (row % 2) * 20;
	const z = rows === 1 ? DEPTH / 2 : 25 + (row * (DEPTH - 50)) / (rows - 1);

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

/**
 * How a rock's heft tells on its throw: a big, spiky one hits harder (its mass, in battle.js) but flies shorter and takes
 * longer to load. `speed` is the part of the aimed speed it leaves the bucket with, `reload` how much longer loading takes.
 */
export const rockThrow = rock => {
	const heft = rock ? clamp((rock.radius - 9) / 7, 0, 1) + 0.25 * (rock.spiky ?? 0) : 0;

	return { speed: 1 - 0.2 * heft, reload: 1 + 0.6 * heft };
};

/** The lowest and steepest a catapult throws, in radians above level, and always forward */
export const FLING_ANGLES = [0.35, 1.2];

/**
 * How far a side's catapult can throw, standing at x (at home if not given): from home, into the enemy's wall and never
 * past it, so men at home behind it are out of reach; rolled forward, as much further as it was rolled
 */
export const reachOf = (team, x = CAT_X[team][0]) => (team === 0 ? WALL_X[1] + WALL.cols * WALL.cw - 60 : WALL_X[0] + 60) + (x - CAT_X[team][0]);

// How far a throw from a side's catapult lands on open ground, at a speed and angle (from home: the ground is level, so
// the same from anywhere)
const thrownTo = (team, speed, angle) => {
	const [, ly] = catGeometry(CAT_X[team][0], team === 0 ? 1 : -1, CAT_FIRE).launch;
	const up = speed * Math.sin(angle);

	return (speed * Math.cos(angle) * (up + Math.sqrt(up * up + 2 * GRAV * (GROUND - ly)))) / GRAV;
};

/** The fastest a side's catapult throws at an angle: as fast as it can, or just enough to reach as far as it may */
export const reachSpeed = (team, angle) => {
	// The same distance from wherever it stands
	const [lx] = catGeometry(CAT_X[team][0], team === 0 ? 1 : -1, CAT_FIRE).launch;
	const far = Math.abs(reachOf(team) - lx);
	let low = 0, high = MOST_FLING;

	if (thrownTo(team, high, angle) <= far) return high;
	for (let i = 0; i < 24; i++) {
		const mid = (low + high) / 2;

		if (thrownTo(team, mid, angle) > far) high = mid;
		else low = mid;
	}

	return low;
};

/** A throw at an angle (held to the catapult's angles) and a part of its reach (0 to 1), as a speed [vx, vy] */
export const flingFor = (team, angle, part) => {
	const held = clamp(angle, ...FLING_ANGLES), speed = clamp(part, 0, 1) * reachSpeed(team, held), dir = team === 0 ? 1 : -1;

	return [Math.cos(held) * speed * dir, -Math.sin(held) * speed];
};

/** The angle of a throw [vx, vy] for a side, above level, forward */
export const flingAngle = (team, vx, vy) => Math.atan2(-vy, vx * (team === 0 ? 1 : -1));

/** A throw held to what a side's catapult can do: forward, between its angles, and no further than its reach */
export const holdFling = (team, vx, vy) => {
	const angle = clamp(flingAngle(team, vx, vy), ...FLING_ANGLES);

	return flingFor(team, angle, Math.hypot(vx, vy) / reachSpeed(team, angle));
};

