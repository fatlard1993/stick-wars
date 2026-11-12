import { Circle, Edge, Polygon, Vec2, World as Physics } from 'planck';

import { TAU, clamp, rand } from './art.js';
import { DEPTH, FADE, GRAV, GROUND, LINGER, W, WALL, faded } from './field.js';

// The walls as real stones, on the server: every block is one of the side's stone drawings, its outline its shape in a
// rigid-body world (planck), stacked into the wall and left resting until something disturbs it. A boulder knocks
// stones loose and whatever loses its support falls the way its shape makes it fall: flat stones stack sturdy, round
// ones roll. A stone takes as much battering as its drawn size gives it, then cracks apart into rubble. The world
// also tells the battle where the top of everything is (a height map), so men climb rubble and stop at walls, and
// ragdolls and debris land on it.

/** Pixels to a meter of the physics world: its stones come out a meter or so across, where it's at its steadiest */
const PPM = 30;
const toM = value => value / PPM;
const toPx = value => value * PPM;
/** How finely the height map is kept, in pixels */
const BUCKET = 4;
const BUCKETS = Math.ceil(W / BUCKET) + 1;
/** Contact impulses (kg·m/s) below this do a stone no harm; past it, each unit does DAMAGE_PER_IMPULSE */
const HARMLESS = 12;
const DAMAGE_PER_IMPULSE = 0.35;
/** A stone's toughness from its drawn size: a cell's worth of stone takes about six of hp */
const HP_PER_AREA = 1 / 120;

// A convex outline cut down to at most `most` corners, each time dropping the corner whose loss changes it least
const simplify = (points, most) => {
	const out = points.slice();
	const area = (a, b, c) => Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));

	while (out.length > most) {
		let least = 0, smallest = Infinity;

		for (let i = 0; i < out.length; i++) {
			const size = area(out[(i - 1 + out.length) % out.length], out[i], out[(i + 1) % out.length]);

			if (size < smallest) {
				smallest = size;
				least = i;
			}
		}
		out.splice(least, 1);
	}

	return out;
};

// A stone's outline pushed most of the way out to its box: flat sides and corners to rest on, so stones stack the way
// blocks do; a lumpier drawing still gives a lumpier, less steady stone
const BLOCKINESS = 0.9;

const blocky = (points, halfW, halfH) =>
	points.map(({ x, y }) => {
		// Each corner slides toward the nearer of its box's sides, and on toward the corner when it's near both
		const toX = Math.sign(x || 1) * halfW, toY = Math.sign(y || 1) * halfH;
		const nearX = 1 - Math.abs(x) / halfW, nearY = 1 - Math.abs(y) / halfH;

		return {
			x: x + (toX - x) * BLOCKINESS * (nearX <= nearY ? 1 : 0.85),
			y: y + (toY - y) * BLOCKINESS * (nearY <= nearX ? 1 : 0.85),
		};
	});

const polygonArea = points =>
	Math.abs(points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length].y - points[(i + 1) % points.length].x * p.y, 0)) / 2;

export class Masonry {
	/**
	 * @param {object} options - Options
	 * @param {Array<{team: number, x0: number, x1: number}>} options.walls - Where each side's wall stands
	 * @param {Function} options.pickArt - (team, kind) one of a side's drawings, as a reference
	 * @param {Function} options.itemOf - (ref) the drawing a reference names
	 * @param {Function} [options.onBreak] - (brick, { x, y, a, vx, vy }) a stone cracked apart
	 * @param {Function} [options.onKnock] - (x, y, impulse) a hard knock, for dust and sound
	 */
	constructor({ walls, pickArt, itemOf, onBreak = () => {}, onKnock = () => {} }) {
		Object.assign(this, { walls, pickArt, itemOf, onBreak, onKnock });
		this.physics = new Physics({ gravity: Vec2(0, toM(GRAV)) });
		this.bricks = [];
		this.nextId = 1;
		this.broken = new Set();
		this.heights = new Float32Array(BUCKETS);
		this.teamHeights = [new Float32Array(BUCKETS), new Float32Array(BUCKETS)];

		// The ground, and ends past the field's edges that nothing tumbles off
		const ground = this.physics.createBody();

		ground.createFixture(new Edge(Vec2(toM(-300), toM(GROUND)), Vec2(toM(W + 300), toM(GROUND))), { friction: 0.9 });
		ground.createFixture(new Edge(Vec2(toM(-300), 0), Vec2(toM(-300), toM(GROUND))), { friction: 0.9 });
		ground.createFixture(new Edge(Vec2(toM(W + 300), 0), Vec2(toM(W + 300), toM(GROUND))), { friction: 0.9 });

		for (const wall of walls) {
			for (let c = 0; c < WALL.cols; c++) {
				for (let r = 0; r < WALL.rows; r++) {
					this.addBrick(wall.team, pickArt(wall.team, 'stones'), wall.x0 + (c + 0.5) * WALL.cw, GROUND - (r + 0.5) * WALL.ch, true);
				}
			}
		}
		this.physics.on('post-solve', (contact, impulse) => this.knock(contact, impulse));
		this.settle();
		this.measure();
	}

	// Before the battle, the walls are let settle: stones touching wake each other, and lumpy ones stacked in a grid
	// nestle down into each other by their shapes. Done quietly (no harm, heavily damped), and where each comes to rest
	// is its place in the wall; a stone that rolled out of it while settling isn't missed from it. Then they sleep until
	// something disturbs them.
	settle() {
		this.settling = true;
		for (const brick of this.bricks) {
			brick.body.setAngularDamping(4);
			brick.body.setLinearDamping(1.5);
		}
		for (let i = 0; i < 300; i++) this.physics.step(1 / 60, 8, 3);
		for (const brick of this.bricks) {
			const wall = this.walls.find(w => w.team === brick.team);
			const { x, y } = this.read(brick.body);

			brick.body.setAngularDamping(1.5);
			brick.body.setLinearDamping(0.05);
			brick.body.setLinearVelocity(Vec2(0, 0));
			brick.body.setAngularVelocity(0);
			brick.body.setAwake(false);
			brick.home = { x, y };
			brick.loose = x < wall.x0 - WALL.cw * 0.5 || x > wall.x1 + WALL.cw * 0.5;
			brick.looseAt = 0;
		}
		for (const wall of this.walls) wall.full = this.bricks.filter(brick => brick.team === wall.team && !brick.loose).length;
		this.settling = false;
	}

	/**
	 * A stone of one of the side's drawings, fitted to a wall's cell, at x, y; resting (asleep) unless `awake`
	 * @returns {object} The brick
	 */
	addBrick(team, ref, x, y, awake) {
		const hull = this.itemOf(ref).shape.hull;
		const xs = hull.map(p => p.x), ys = hull.map(p => p.y);
		const sx = (WALL.cw * 0.98) / Math.max(0.05, Math.max(...xs) - Math.min(...xs));
		const sy = (WALL.ch * 0.98) / Math.max(0.05, Math.max(...ys) - Math.min(...ys));
		const outline = simplify(
			blocky(
				hull.map(p => ({ x: p.x * sx, y: p.y * sy })),
				(WALL.cw * 0.98) / 2,
				(WALL.ch * 0.98) / 2,
			),
			10,
		);
		const area = polygonArea(outline);
		const body = this.physics.createBody({
			type: 'dynamic',
			position: Vec2(toM(x), toM(y)),
			awake,
			allowSleep: true,
			angularDamping: 1.5,
			linearDamping: 0.05,
		});

		body.createFixture(new Polygon(outline.map(p => Vec2(toM(p.x), toM(p.y)))), { density: 3.5, friction: 1, restitution: 0 });

		const hp = clamp(area * HP_PER_AREA, 2, 10);
		const brick = { id: this.nextId++, team, ref, body, hp, max: hp, sx, sy, home: { x, y }, loose: false, z: rand(8, DEPTH - 8), cr: [rand(0, TAU), rand(0, TAU)] };

		body.setUserData(brick);
		this.bricks.push(brick);

		return brick;
	}

	/** A boulder, a heavy round body flung into the stones: { body }, its place and speed read back in pixels */
	addBoulder(x, y, vx, vy, radius, mass) {
		const body = this.physics.createBody({ type: 'dynamic', position: Vec2(toM(x), toM(y)), bullet: true, angularDamping: 0.2 });
		const r = toM(radius);

		body.createFixture(new Circle(r), { density: (1.8 * mass) / (Math.PI * r * r), friction: 0.6, restitution: 0.3 });
		body.setLinearVelocity(Vec2(toM(vx), toM(vy)));
		body.setUserData({ boulder: true });

		return body;
	}

	/** A body's place and speed in pixels */
	read(body) {
		const p = body.getPosition(), v = body.getLinearVelocity();

		return { x: toPx(p.x), y: toPx(p.y), a: body.getAngle(), vx: toPx(v.x), vy: toPx(v.y), va: body.getAngularVelocity() };
	}

	/** A body's speed set, in pixels a second */
	setSpeed(body, vx, vy) {
		body.setLinearVelocity(Vec2(toM(vx), toM(vy)));
	}

	remove(body) {
		this.physics.destroyBody(body);
	}

	// A contact pushed hard enough to hurt: every stone in it takes the harm
	knock(contact, impulse) {
		const hit = Math.max(...impulse.normalImpulses);

		if (this.settling || hit <= HARMLESS) return;

		const a = contact.getFixtureA().getBody(), b = contact.getFixtureB().getBody();

		for (const body of [a, b]) {
			const brick = body.getUserData();

			if (!brick?.max) continue;
			brick.hp -= (hit - HARMLESS) * DAMAGE_PER_IMPULSE;
			if (brick.hp <= 0) this.broken.add(brick);
		}
		if (hit > HARMLESS * 2) {
			const p = a.getUserData()?.max ? a.getPosition() : b.getPosition();

			this.onKnock(toPx(p.x), toPx(p.y), hit);
		}
	}

	/** A stone cracked apart: gone from the world, its rubble handed to the battle, and what rested on it woken to fall */
	breakBrick(brick) {
		if (!this.bricks.includes(brick)) return;

		const { x, y, a, vx, vy } = this.read(brick.body);
		const reach = Math.max(WALL.cw, WALL.ch) * 1.3;

		this.remove(brick.body);
		this.bricks = this.bricks.filter(other => other !== brick);
		for (const other of this.bricks) {
			const p = this.read(other.body);

			if (Math.abs(p.x - x) < reach && Math.abs(p.y - y) < reach * 1.6) other.body.setAwake(true);
		}
		this.onBreak(brick, { x, y, a, vx, vy });
	}

	step(dt, time = 0) {
		this.time = time;
		this.physics.step(dt, 8, 3);
		for (const brick of this.broken) this.breakBrick(brick);
		this.broken.clear();
		// A stone lying loose has its while, then fades away and is no longer in anyone's way
		for (const brick of this.bricks.filter(b => b.loose && time - b.looseAt > LINGER.brick + FADE)) this.clearBrick(brick);
		this.measure();
	}

	// A stone gone without a crack: out of the world, what rested on it woken
	clearBrick(brick) {
		const { x, y } = this.read(brick.body);

		this.remove(brick.body);
		this.bricks = this.bricks.filter(other => other !== brick);
		for (const other of this.bricks) {
			const p = this.read(other.body);

			if (Math.abs(p.x - x) < WALL.cw * 1.3 && Math.abs(p.y - y) < WALL.ch * 2) other.body.setAwake(true);
		}
	}

	// Where the top of everything is, all along the field, and of each side's stones alone; and which stones have left
	// their wall (fallen loose, they're drawn lying in one place on the field rather than as the wall's thickness)
	measure() {
		this.heights.fill(GROUND);
		this.teamHeights[0].fill(GROUND);
		this.teamHeights[1].fill(GROUND);
		for (const brick of this.bricks) {
			const box = brick.body.getFixtureList().getAABB(0);
			const top = toPx(box.lowerBound.y);
			const from = clamp(Math.floor(toPx(box.lowerBound.x) / BUCKET), 0, BUCKETS - 1);
			const to = clamp(Math.ceil(toPx(box.upperBound.x) / BUCKET), 0, BUCKETS - 1);
			const own = this.teamHeights[brick.team];

			for (let i = from; i <= to; i++) {
				if (top < this.heights[i]) this.heights[i] = top;
				if (top < own[i]) own[i] = top;
			}
			if (!brick.loose) {
				const p = brick.body.getPosition();
				const dx = Math.abs(toPx(p.x) - brick.home.x), dy = Math.abs(toPx(p.y) - brick.home.y);

				brick.loose = dx > WALL.cw * 1.2 || dy > WALL.ch * 2;
				if (brick.loose) brick.looseAt = this.time ?? 0;
			}
		}
	}

	/** The top of whatever's at x: the ground, or the stones piled there */
	groundAt(x) {
		return this.heights[clamp(Math.round(x / BUCKET), 0, BUCKETS - 1)];
	}

	/** The top of one side's stones at x (a man walks through his own wall's gate, and climbs the enemy's) */
	groundOf(team, x) {
		return this.teamHeights[team][clamp(Math.round(x / BUCKET), 0, BUCKETS - 1)];
	}

	/** A man's blade on a side's stones: the one nearest where it lands takes the blow. Returns whether one did */
	hack(team, x, y, damage) {
		let best = null, nearest = 26;

		for (const brick of this.bricks) {
			if (brick.team !== team) continue;

			const p = this.read(brick.body);
			const d = Math.hypot(Math.max(0, Math.abs(p.x - x) - WALL.cw / 2), Math.max(0, Math.abs(p.y - y) - WALL.ch / 2));

			if (d < nearest) {
				nearest = d;
				best = brick;
			}
		}
		if (!best) return false;
		best.hp -= damage;
		if (best.hp <= 0) this.breakBrick(best);

		return true;
	}

	// A side's stones still standing in its wall
	standing(team) {
		return this.bricks.filter(brick => brick.team === team && !brick.loose);
	}

	/** How many stones a side's wall is short of whole */
	missing(team) {
		const wall = this.walls.find(w => w.team === team);

		return Math.max(0, wall.full - this.standing(team).length);
	}

	needsRepair(team) {
		return this.missing(team) > 0 || this.standing(team).some(brick => brick.hp < brick.max);
	}

	/**
	 * One repairer's hammer blow at a side's wall: the most cracked stone in it patched, or with none cracked, a new stone
	 * (of the side's drawings) set down onto the lowest point of the wall, to settle into the gap. Returns where.
	 * @returns {{x: number, y: number} | null} Where the work was done
	 */
	repair(team) {
		const cracked = this.standing(team)
			.filter(brick => brick.hp < brick.max)
			.sort((a, b) => a.hp / a.max - b.hp / b.max)[0];

		if (cracked) {
			cracked.hp = Math.min(cracked.max, cracked.hp + 1.5);

			return this.read(cracked.body);
		}
		if (!this.missing(team)) return null;

		const wall = this.walls.find(w => w.team === team);
		let lowest = wall.x0 + WALL.cw / 2, top = 0;

		for (let x = wall.x0 + WALL.cw / 2; x <= wall.x1 - WALL.cw / 2; x += BUCKET) {
			const at = this.groundOf(team, x);

			if (at > top) {
				top = at;
				lowest = x;
			}
		}

		const brick = this.addBrick(team, this.pickArt(team, 'stones'), lowest, top - WALL.ch * 0.5 - 8, true);

		// Set into this wall: it belongs where it lands
		brick.home = { x: lowest, y: top - WALL.ch * 0.5 };

		return { x: lowest, y: top };
	}

	/** The stones as every page draws them */
	snapshot() {
		const r2 = v => Math.round(v * 100) / 100;

		return this.bricks.map(brick => {
			const { x, y, a } = this.read(brick.body);

			return [brick.id, brick.team, brick.ref.a, brick.ref.i, Math.round(x), Math.round(y), r2(a), r2(clamp(brick.hp / brick.max, 0, 1)), r2(brick.sx), r2(brick.sy), brick.loose ? Math.round(brick.z) : -1, r2(brick.cr[0]), r2(brick.cr[1]), brick.loose ? r2(faded(this.time - brick.looseAt, LINGER.brick)) : 1];
		});
	}
}
