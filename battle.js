// The battle, run on the server: stick men skinned onto skeletons (kinematic while alive, verlet ragdolls once dead,
// crippled or cut apart), walls of drawn stones, catapults of drawn beams, flung ammo. What can't be seen from a
// snapshot (blood, dust, sounds, a shake) goes out as events for each page to play. The page draws it (client/Field.js)
// with the same geometry, imported from here.

import {
	BONES,
	BONE_KIND,
	FIST,
	PI,
	TAU,
	clamp,
	easeIn,
	easeInOut,
	easeOut,
	lerp,
	pick,
	rand,
	segDist,
	segInter,
} from './art.js';

export const W = 1400, H = 800, GROUND = 720, GRAV = 900, DT = 1 / 60;
export const SM_H = 94;
export const WALL = { cols: 3, rows: 7, cw: 34, ch: 22 };
export const ARMY = 12, AMMO = 6, RELOAD = 4.5;
/** The fastest a catapult flings, in world units a second */
export const MOST_FLING = 1150;
export const CAT_REST = PI - 0.3, CAT_FIRE = 1.5 * PI + 0.35, CAT_ARM = 74, CAT_PIV = -56;
export const WALL_X = [260, W - 260 - WALL.cols * WALL.cw];
export const CAT_X = [
	[85, 190],
	[W - 85, W - 190],
];
/** How long a side waits between sending stick men, in seconds */
export const SEND_EVERY = 0.6;

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

/** The ground under x: a wall's top where there's wall, else the ground */
export const groundAt = (walls, x) => {
	for (const wl of walls) {
		if (x >= wl.x0 && x < wl.x1) return GROUND - wl.cols[((x - wl.x0) / WALL.cw) | 0].length * WALL.ch;
	}

	return GROUND;
};

/** A fling's path from a catapult, as points, stopping at the ground or the far wall: for aiming */
export const flingPath = (from, vx, vy, walls) => {
	const out = [];
	let [x, y] = from;

	for (let i = 0; i < 200; i++) {
		vy += GRAV / 60;
		x += vx / 60;
		y += vy / 60;
		if (y > GROUND || x < 0 || x > W) break;
		if (y > groundAt(walls, x) && (x > walls[1].x0 ? vx > 0 : vx < 0)) break;
		out.push([x, y]);
	}

	return out;
};

/** A fling's speed, held to what a catapult can do */
export const holdFling = (vx, vy) => {
	const m = Math.hypot(vx, vy);

	return m > MOST_FLING ? [(vx * MOST_FLING) / m, (vy * MOST_FLING) / m] : [vx, vy];
};

// ---------------------------------------------------------------- bodies

let BODY_ID = 1;

// A set of 11 joints plus the bones it owns. Kinematic while a stick man is in control; a verlet ragdoll once dead,
// crippled, or cut off.
class Body {
	constructor(w, ref, team, flip, s) {
		this.w = w;
		this.id = BODY_ID++;
		this.ref = ref;
		this.tpl = w.itemOf(ref).rig;
		this.team = team;
		this.flip = flip;
		this.s = s;
		this.j = [];
		for (let i = 0; i < 11; i++) this.j.push({ x: 0, y: 0, px: 0, py: 0 });
		this.owned = new Array(10).fill(true);
		this.kin = true;
		this.stumps = [];
		this.weapon = null;
		this.wOff = -1.1;
		this.owner = null;
		this.squash = 1;
		this.still = 0;
	}

	split(mask) {
		const g = new Body(this.w, this.ref, this.team, this.flip, this.s);

		g.j = this.j.map(p => ({ ...p }));
		for (let b = 0; b < 10; b++) {
			g.owned[b] = mask[b] && this.owned[b];
			if (g.owned[b]) this.owned[b] = false;
		}
		g.kin = false;
		g.wOff = this.wOff;
		g.squash = this.squash;
		if (g.owned[5] && this.weapon) {
			g.weapon = this.weapon;
			this.weapon = null;
		}

		return g;
	}

	empty() {
		return !this.owned.some(Boolean);
	}

	usedJoints() {
		const u = new Array(11).fill(false);

		for (let b = 0; b < 10; b++) if (this.owned[b]) u[BONES[b][0]] = u[BONES[b][1]] = true;

		return u;
	}

	anchor() {
		const b = this.owned.indexOf(true);

		return b < 0 ? this.j[2] : this.j[BONES[b][1]];
	}

	update(dt) {
		const w = this.w;

		for (let i = this.stumps.length - 1; i >= 0; i--) {
			const st = this.stumps[i];

			st.t -= dt;
			if (st.t <= 0) {
				this.stumps.splice(i, 1);
				continue;
			}

			const p = this.j[st.j];
			const pulse = 0.5 + 0.5 * Math.sin(w.time * 13 + st.ph);

			if (Math.random() < Math.min(1, st.t * 0.6) * pulse * 0.5) w.spray(p.x, p.y, 4, st.dx, st.dy, 0.12, 90 + st.t * 70);
		}
		if (!this.kin) this.sim();
	}

	sim() {
		if (this.still > 2 && !this.stumps.length) return;

		const w = this.w, used = this.usedJoints(), j = this.j, g = GRAV * DT * DT;
		let motion = 0;

		for (let i = 0; i < 11; i++) {
			if (!used[i]) continue;

			const p = j[i];
			const vx = (p.x - p.px) * 0.99, vy = (p.y - p.py) * 0.99;

			motion += Math.abs(vx) + Math.abs(vy);
			p.px = p.x;
			p.py = p.y;
			p.x += vx;
			p.y += vy + g;
		}
		for (let it = 0; it < 6; it++) {
			for (let b = 0; b < 10; b++) {
				if (!this.owned[b]) continue;

				const A = j[BONES[b][0]], B = j[BONES[b][1]];
				const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 0.001;
				const k = ((d - this.tpl.lens[b] * this.s) / d) * 0.5;

				A.x += dx * k;
				A.y += dy * k;
				B.x -= dx * k;
				B.y -= dy * k;
			}
			for (let i = 0; i < 11; i++) if (used[i]) w.collideJoint(j[i]);
		}
		for (let i = 0; i < 11; i++) {
			if (!used[i]) continue;

			const p = j[i];

			if (p.y >= w.groundAt(p.x) - 0.6) p.px = p.x - (p.x - p.px) * 0.8;
		}
		this.still = motion < 0.3 ? this.still + DT : 0;
	}

	wake() {
		this.still = 0;
	}

	// A ragdoll can't hold a blade properly, so it lets go and the blade tumbles on its own
	dropWeapon() {
		if (!this.weapon || !this.owned[5]) return;

		const w = this.w, e = this.j[5], h = this.j[6], wp = this.weapon, L = w.itemOf(wp.ref).stats.reach;
		const ang = Math.atan2(h.y - e.y, h.x - e.x) + this.wOff * this.flip;
		const pr = new Prop(w, wp.ref, h.x + Math.cos(ang) * L * 0.5, h.y + Math.sin(ang) * L * 0.5, L, L, 'steel', 0.5, 1.7);

		pr.a = ang;
		pr.blood = wp.blood;
		pr.kick((h.x - h.px) * 60 + rand(-60, 60), (h.y - h.py) * 60 - rand(60, 160));
		pr.va = rand(-10, 10);
		w.props.push(pr);
		this.weapon = null;
	}

	snapshot() {
		const joints = [];

		for (const p of this.j) joints.push(Math.round(p.x), Math.round(p.y));

		let mask = 0;

		for (let b = 0; b < 10; b++) if (this.owned[b]) mask |= 1 << b;

		const wp = this.weapon && this.owned[5] ? this.weapon : null;

		return {
			id: this.id,
			r: [this.ref.a, this.ref.i],
			t: this.team,
			s: Math.round(this.s * 10) / 10,
			f: this.flip,
			q: Math.round(this.squash * 100) / 100,
			o: mask,
			j: joints,
			...(wp && { w: [wp.ref.a, wp.ref.i, Math.round(wp.blood * 100) / 100], wo: Math.round(this.wOff * 100) / 100 }),
			...(this.stumps.length && { st: this.stumps.map(st => st.j) }),
		};
	}
}

// ---------------------------------------------------------------- stick men

const POSE = new Float64Array(10);
const FK = new Float64Array(22);

class Stickman {
	constructor(w, team, x) {
		this.w = w;
		this.team = team;
		this.face = team === 0 ? 1 : -1;
		this.body = new Body(w, w.pickArt(team, 'stickmen'), team, this.face, SM_H * rand(0.9, 1.1));
		this.body.owner = this;
		this.body.weapon = { ref: w.pickArt(team, 'swords'), blood: 0 };
		this.x = x;
		this.hp = 100;
		this.bleed = 0;
		this.phase = rand(0, TAU);
		this.speed = rand(52, 68);
		this.atk = null;
		this.cd = rand(0.2, 0.8);
		this.kb = 0;
		this.stag = 0;
		this.dead = false;
		this.incap = false;
		this.yOff = 0;
		this.think = 0;
		this.target = null;
		this.moving = false;
		this.mv = 0;
		this.writhe = 0;
		this.slot = Math.random();
		this.pose(0, true);
	}

	alive() {
		return !this.dead && !this.incap;
	}

	armed() {
		return Boolean(this.body.weapon && this.body.owned[5]);
	}

	hasArm() {
		return this.body.owned[5] || this.body.owned[3];
	}

	stats() {
		return this.armed() ? this.w.itemOf(this.body.weapon.ref).stats : FIST;
	}

	reach() {
		return this.armed() ? this.stats().reach * 0.8 + 10 : 22;
	}

	// Where a side holding by its wall stands, each man his own spot
	holdX() {
		const wl = this.w.walls[this.team];

		return this.team === 0 ? wl.x1 + 40 + this.slot * 90 : wl.x0 - 40 - this.slot * 90;
	}

	pickTarget() {
		let best = null, bd = Infinity;

		for (const s of this.w.stickmen) {
			if (s.team === this.team || !s.alive()) continue;

			const d = Math.abs(s.x - this.x);

			if (d < bd) {
				bd = d;
				best = s;
			}
		}
		if (this.w.hold[this.team] && best && Math.abs(best.x - this.holdX()) > 320) best = null;
		this.target = best;
	}

	enemyWall() {
		return this.w.walls[1 - this.team];
	}

	// The enemy wall stops us unless the next column is at most one brick above our footing
	wallBlock(dir) {
		const ew = this.enemyWall(), fx = this.x + dir * 7;

		if (fx < ew.x0 || fx >= ew.x1) return null;

		const c = ((fx - ew.x0) / WALL.cw) | 0;

		return ew.cols[c].length * WALL.ch > this.yOff + WALL.ch * 1.1 ? { wall: ew, c } : null;
	}

	footing() {
		const ew = this.enemyWall();

		if (this.x < ew.x0 || this.x >= ew.x1) return 0;

		return ew.cols[((this.x - ew.x0) / WALL.cw) | 0].length * WALL.ch;
	}

	update(dt) {
		if (this.dead) return;

		const w = this.w;

		this.hp -= (this.bleed + this.body.stumps.length * 5) * dt;
		if (this.hp <= 0) {
			this.die(0, 0);

			return;
		}
		if (this.incap) {
			this.writhe -= dt;
			if (this.writhe <= 0) {
				this.writhe = rand(0.15, 0.5);

				const j = this.body.j;

				for (const k of [0, 4, 6, 8, 10]) {
					if (Math.random() < 0.5) {
						j[k].px += rand(-2.5, 2.5);
						j[k].py += rand(0, 3.5);
					}
				}
				this.body.wake();
			}

			return;
		}

		this.think -= dt;
		if (this.think <= 0) {
			this.think = rand(0.15, 0.3);
			this.pickTarget();
		}
		this.cd -= dt;
		this.stag = Math.max(0, this.stag - dt);

		let move = 0, want = null;
		const R = this.reach(), tg = this.target;
		const forward = this.team === 0 ? 1 : -1;

		if (tg && tg.alive()) {
			const dx = tg.x - this.x, adx = Math.abs(dx);

			this.face = dx >= 0 ? 1 : -1;
			if (adx > R) move = this.face;
			else if (adx < 9) move = -this.face;
			if (adx <= R + 4) want = { type: 'sm' };
		} else if (w.hold[this.team]) {
			const dx = this.holdX() - this.x;

			if (Math.abs(dx) > 6) move = Math.sign(dx);
			this.face = move || forward;
		} else {
			let cat = null, cd = Infinity;

			for (const c of w.cats) {
				if (c.team === this.team || c.dead) continue;

				const d = Math.abs(c.x - this.x);

				if (d < cd) {
					cd = d;
					cat = c;
				}
			}
			if (cat) {
				const dx = cat.x - this.x;

				this.face = Math.sign(dx) || 1;
				if (Math.abs(dx) > R + 28) move = this.face;
				else want = { type: 'cat', cat };
			} else {
				const gx = w.spawnX[1 - this.team] - forward * (30 + this.slot * 60);
				const dx = gx - this.x;

				if (Math.abs(dx) > 8) move = Math.sign(dx);
				this.face = move || forward;
			}
		}
		if (move) {
			const bl = this.wallBlock(move);

			if (bl) {
				move = 0;
				if (!want) want = { type: 'wall', wall: bl.wall, c: bl.c };
			}
		}

		if (want && !this.atk && this.cd <= 0 && this.stag <= 0 && this.hasArm()) this.startAttack(want);
		if (this.atk) {
			move = 0;
			this.stepAttack(dt);
		}

		this.moving = move !== 0;
		if (this.moving) {
			this.x += move * this.speed * dt * (this.hp < 35 ? 0.7 : 1);
			this.phase += dt * this.speed * 0.11;
		}
		if (Math.abs(this.kb) > 1) {
			if (!this.wallBlock(Math.sign(this.kb))) this.x += this.kb * dt;
			this.kb *= Math.pow(0.004, dt);
		}
		this.x = clamp(this.x, 12, W - 12);
		this.yOff += (this.footing() - this.yOff) * Math.min(1, dt * 10);
		this.pose(dt);
		if (this.atk) this.hitCheck();
	}

	startAttack(want) {
		const st = this.stats();
		let kind = 'chop';

		if (want.type === 'sm') {
			const r = Math.random();

			if (st.name === 'Skewer') kind = r < 0.65 ? 'stab' : 'chop';
			else kind = r < 0.6 ? 'chop' : 'sweep';
		}
		this.atk = { t: 0, dur: st.swing * rand(0.9, 1.1), kind, want, bones: new Set(), bodies: new Map(), done: false };
		this.prevSeg = null;
	}

	stepAttack(dt) {
		const a = this.atk, before = a.t, w = this.w;

		a.t += dt / a.dur;
		if (before < 0.45 && a.t >= 0.45) w.sound('swing');
		if (a.kind === 'stab' && a.t > 0.45 && a.t < 0.65 && !this.wallBlock(this.face)) this.x += this.face * 70 * dt;
		if (!a.done && a.t >= 0.58 && a.want.type !== 'sm') {
			a.done = true;

			const dmg = this.stats().dmg;

			if (a.want.type === 'wall') {
				const col = a.want.wall.cols[a.want.c];

				if (col.length) {
					const r = clamp(((this.yOff + SM_H * 0.5) / WALL.ch) | 0, 0, col.length - 1);

					w.hurtBrick(a.want.wall, a.want.c, r, dmg * 0.03);
					w.cleanWall(a.want.wall, this.face * 120, -60);
					w.dust(a.want.wall.x0 + (a.want.c + 0.5) * WALL.cw, GROUND - (r + 0.5) * WALL.ch, 4);
					w.sound('thud');
				}
			} else if (a.want.type === 'cat' && !a.want.cat.dead) {
				a.want.cat.damage(dmg * 0.35);
				w.sound('thud');
			}
		}
		if (a.t >= 1) {
			this.atk = null;
			this.cd = rand(0.1, 0.45);
			this.prevSeg = null;
		}
	}

	pose(dt, init) {
		const b = this.body, L = b.tpl.lens, s = b.s;
		const ph = this.phase, sn = Math.sin(ph), cs = Math.cos(ph);

		this.mv = lerp(this.mv, this.moving ? 1 : 0, Math.min(1, dt * 8));

		const mv = this.mv;
		const lean = 0.07 * mv - 1.2 * this.stag + Math.sin(this.w.time * 2 + this.slot * 10) * 0.03;
		const a = POSE;

		a[6] = PI / 2 + 0.55 * sn * mv + 0.16 * (1 - mv);
		a[8] = PI / 2 - 0.55 * sn * mv - 0.16 * (1 - mv);
		a[7] = a[6] + 0.08 + 0.85 * Math.max(0, cs) * mv;
		a[9] = a[8] + 0.08 + 0.85 * Math.max(0, -cs) * mv;
		a[2] = PI / 2 + 0.25 - 0.5 * sn * mv;
		a[3] = a[2] - 0.5;

		const I = this.armed() ? { ru: PI / 2 - 0.55, rf: -0.3, off: -1.15, lean } : { ru: PI / 2 - 0.9, rf: -0.9, off: 0, lean };
		let P = I;
		const at = this.atk;

		if (at) {
			const t = at.t;
			let Wd, S;

			if (at.kind === 'chop') {
				Wd = { ru: -PI / 2 - 0.9, rf: -PI / 2 - 1.4, off: -0.3, lean: lean - 0.12 };
				S = { ru: PI / 2 - 0.15, rf: PI / 2 - 0.4, off: -0.35, lean: lean + 0.3 };
			} else if (at.kind === 'sweep') {
				Wd = { ru: PI / 2 + 0.9, rf: PI / 2 + 1.2, off: -0.6, lean: lean - 0.05 };
				S = { ru: -0.35, rf: -0.55, off: -0.6, lean: lean + 0.25 };
			} else {
				Wd = { ru: 2.5, rf: 0, off: 0, lean: lean - 0.1 };
				S = { ru: 0.05, rf: 0, off: 0, lean: lean + 0.35 };
			}

			const mix = (A, B, k) => ({
				ru: lerp(A.ru, B.ru, k),
				rf: lerp(A.rf, B.rf, k),
				off: lerp(A.off, B.off, k),
				lean: lerp(A.lean, B.lean, k),
			});

			if (t < 0.45) P = mix(I, Wd, easeOut(t / 0.45));
			else if (t < 0.68) P = mix(Wd, S, easeIn((t - 0.45) / 0.23));
			else P = mix(S, I, easeInOut(clamp((t - 0.68) / 0.32, 0, 1)));
		}
		a[0] = -PI / 2 + P.lean;
		a[1] = a[0] + 0.05 * Math.sin(ph * 2) * mv;
		a[4] = P.ru;
		a[5] = P.rf;
		b.wOff = P.off;

		const Q = FK;
		const set = (ji, from, bi) => {
			Q[ji * 2] = Q[from * 2] + Math.cos(a[bi]) * L[bi] * s;
			Q[ji * 2 + 1] = Q[from * 2 + 1] + Math.sin(a[bi]) * L[bi] * s;
		};

		Q[4] = 0;
		Q[5] = 0;
		set(1, 2, 0);
		set(0, 1, 1);
		set(3, 1, 2);
		set(4, 3, 3);
		set(5, 1, 4);
		set(6, 5, 5);
		set(7, 2, 6);
		set(8, 7, 7);
		set(9, 2, 8);
		set(10, 9, 9);

		const base = GROUND - this.yOff - Math.max(Q[17], Q[21]);

		for (let i = 0; i < 11; i++) {
			const p = b.j[i], nx = this.x + Q[i * 2] * this.face, ny = base + Q[i * 2 + 1];

			if (init) {
				p.px = nx;
				p.py = ny;
			} else {
				p.px = p.x;
				p.py = p.y;
			}
			p.x = nx;
			p.y = ny;
		}
		b.flip = this.face;
	}

	weaponSeg() {
		const j = this.body.j;

		if (this.armed()) {
			const e = j[5], h = j[6], L = this.stats().reach;
			const an = Math.atan2(h.y - e.y, h.x - e.x) + this.body.wOff * this.face;
			const c = Math.cos(an), s = Math.sin(an);

			return [h.x + c * L * 0.18, h.y + s * L * 0.18, h.x + c * L, h.y + s * L];
		}

		const [e, h] = this.body.owned[5] ? [j[5], j[6]] : [j[3], j[4]];
		const dx = h.x - e.x, dy = h.y - e.y;

		return [e.x + dx * 0.5, e.y + dy * 0.5, h.x + dx * 0.35, h.y + dy * 0.35];
	}

	// Sweep the blade between ticks and cut through any bone it crosses
	hitCheck() {
		const a = this.atk;

		if (a.t < 0.45 || a.t > 0.7) {
			this.prevSeg = null;

			return;
		}

		const s = this.weaponSeg(), p = this.prevSeg || s;

		this.prevSeg = s;

		const T = [
			s,
			p,
			[p[2], p[3], s[2], s[3]],
			[(p[0] + p[2]) / 2, (p[1] + p[3]) / 2, (s[0] + s[2]) / 2, (s[1] + s[3]) / 2],
		];
		const st = this.stats();

		for (const body of this.w.bodies) {
			if (body === this.body) continue;

			const o = body.owner;

			if (o && !o.dead && o.team === this.team) continue;
			if (Math.abs(body.anchor().x - this.x) > 150) continue;

			let n = a.bodies.get(body.id) || 0;

			if (n >= 2) continue;
			for (let b = 0; b < 10 && n < 2; b++) {
				if (!body.owned[b]) continue;

				const key = body.id * 16 + b;

				if (a.bones.has(key)) continue;

				const A = body.j[BONES[b][0]], B = body.j[BONES[b][1]];
				let hit = false;

				for (const t of T) {
					if (segInter(t[0], t[1], t[2], t[3], A.x, A.y, B.x, B.y) >= 0) {
						hit = true;
						break;
					}
				}
				if (!hit && b === 1) {
					const r = body.tpl.headR * body.s;

					hit = segDist(B.x, B.y, s[0], s[1], s[2], s[3]).d < r || segDist(B.x, B.y, p[0], p[1], p[2], p[3]).d < r;
				}
				if (!hit) continue;
				a.bones.add(key);
				a.bodies.set(body.id, ++n);

				const hx = (A.x + B.x) / 2, hy = (A.y + B.y) / 2;

				if (o && !o.dead) o.takeHit(b, st, this.face, hx, hy);
				else this.w.corpseHit(body, b, st, this.face, hx, hy);
				if (this.armed()) this.body.weapon.blood = Math.min(1, this.body.weapon.blood + 0.12);
			}
		}
	}

	takeHit(b, st, dir, hx, hy) {
		const w = this.w, kind = BONE_KIND[b];
		const dmg = st.dmg * { head: 1.9, torso: 1, arm: 0.5, leg: 0.6 }[kind] * rand(0.8, 1.25);

		this.hp -= dmg;
		this.bleed = Math.min(25, this.bleed + st.bleed * 0.6);
		w.spray(hx, hy, 6 + dmg * 0.5 + st.bleed * 3, dir, -0.35, 0.35, 160 + dmg * 3);
		w.sound('hit');
		this.kb += dir * (40 + st.knock * 70);
		this.stag = 0.25;
		if (this.atk && Math.random() < 0.5) this.atk = null;

		let cutP = (st.cut * dmg) / 22;

		if (kind === 'torso') cutP = dmg > 40 && Math.random() < st.cut * 0.3 ? 1 : 0;
		if (kind === 'head') cutP *= 0.7;
		if (Math.random() < cutP) this.sever(b, dir * (1 + st.knock));
		if (!this.dead && this.hp <= 0) this.die(dir * (2 + st.knock * 2), 1.5);
	}

	sever(b, ix) {
		if (!this.body.owned[b]) return;
		this.w.cut(this.body, b, ix);
		if (b === 1) {
			this.w.stats.heads++;
			this.w.slowmo(0.35);
			this.die(ix * 0.5, 0);
		} else if (b === 0) {
			this.w.slowmo(0.35);
			this.die(ix * 0.5, 0);
		} else if (b >= 6 && !this.dead && !this.incap) this.goIncap();
		if (!this.hasArm()) this.atk = null;
	}

	goIncap() {
		this.incap = true;
		this.atk = null;
		this.bleed = Math.max(this.bleed, 8);
		this.body.kin = false;
		this.body.dropWeapon();
		for (const p of this.body.j) p.px += this.face * 1.2;
	}

	die(ix, iy) {
		if (this.dead) return;
		this.dead = true;
		this.incap = false;
		this.atk = null;

		const b = this.body;

		b.kin = false;
		b.wake();
		b.dropWeapon();
		for (const p of b.j) {
			const vx = clamp(p.x - p.px, -8, 8), vy = clamp(p.y - p.py, -8, 8);

			p.px = p.x - vx - ix;
			p.py = p.y - vy + iy;
		}
		this.w.stats.kills[1 - this.team]++;
	}
}

// ---------------------------------------------------------------- props & projectiles

let PROP_ID = 1;

class Prop {
	// ref: { k: kind, a: whose art, i: which }; fill: stone, hurt, wood, steel or ammo
	constructor(w, ref, x, y, sx, sy, fill, ox = 0, lw = 1.6) {
		Object.assign(this, { w, ref, x, y, sx, sy, fill, ox, lw });
		this.id = PROP_ID++;
		this.vx = 0;
		this.vy = 0;
		this.a = 0;
		this.va = 0;
		this.still = 0;
		this.round = false;
		this.blood = 0;
		this.r = Math.max(Math.abs(sx), Math.abs(sy)) * 0.5;

		const h = w.itemOf(ref).shape.hull, step = Math.max(1, Math.ceil(h.length / 14));

		this.samp = h.filter((_, i) => i % step === 0);
		if (!this.samp.length) this.samp = [{ x: 0, y: 0 }];
	}

	update(dt) {
		if (this.still > 0.6) return;

		const w = this.w;

		this.vy += GRAV * dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.a += this.va * dt;

		const wl = w.wallAt(this.x);

		if (wl && this.y > w.groundAt(this.x) + 4) {
			this.x = this.x - wl.x0 < wl.x1 - this.x ? wl.x0 - 1 : wl.x1 + 1;
			this.vx *= -0.3;
		}

		const c = Math.cos(this.a), s = Math.sin(this.a);
		let pen = 0, cx = this.x;

		for (const q of this.samp) {
			const lx = (q.x - this.ox) * this.sx, ly = q.y * this.sy;
			const wx = this.x + lx * c - ly * s, wy = this.y + lx * s + ly * c;
			const d = wy - w.groundAt(wx);

			if (d > pen) {
				pen = d;
				cx = wx;
			}
		}
		if (pen > 0) {
			this.y -= pen;
			if (this.vy > 0) this.vy = -this.vy * 0.25;
			if (Math.abs(this.vy) < 25) this.vy = 0;
			this.vx *= 0.86;
			if (this.round) this.va = this.vx / this.r;
			else {
				this.va += -(cx - this.x) * 0.05;
				this.va *= 0.82;
			}

			const resting = Math.abs(this.vx) < 4 && Math.abs(this.vy) < 4 && Math.abs(this.va) < 0.08;

			this.still = resting ? this.still + dt : 0;
		}
	}

	kick(vx, vy) {
		this.vx = vx;
		this.vy = vy;
		this.va += rand(-5, 5);
		this.still = 0;
	}

	snapshot() {
		return {
			id: this.id,
			r: [this.ref.k, this.ref.a, this.ref.i],
			x: Math.round(this.x),
			y: Math.round(this.y),
			a: Math.round(this.a * 100) / 100,
			sx: Math.round(this.sx * 10) / 10,
			sy: Math.round(this.sy * 10) / 10,
			...(this.ox && { ox: this.ox }),
			c: this.fill,
			...(this.blood && { b: Math.round(this.blood * 100) / 100 }),
		};
	}
}

class Proj extends Prop {
	constructor(w, ref, x, y, vx, vy, team) {
		const item = w.itemOf(ref);

		super(w, ref, x, y, item.radius * 2, item.radius * 2, 'ammo', 0, 2);
		Object.assign(this, { team, vx, vy });
		this.va = rand(-9, 9);
		this.rad = item.radius;
		this.spiky = item.spiky;
		this.mass = (item.radius / 12) ** 2 * (1 + item.spiky * 0.3);
		this.hitSet = new Set();
		this.life = 0;
		this.spent = false;
	}

	step(dt) {
		const w = this.w, N = 3, h = dt / N;

		this.life += dt;
		for (let k = 0; k < N; k++) {
			this.vy += GRAV * h;

			const ox = this.x, oy = this.y;

			this.x += this.vx * h;
			this.y += this.vy * h;
			this.a += this.va * h;

			const sp = Math.hypot(this.vx, this.vy);

			for (const wl of w.walls) if (wl.team !== this.team && this.hitWall(wl, ox, oy, sp)) break;
			for (const c of w.cats) {
				if (c.dead || c.team === this.team || this.hitSet.has(c) || sp < 120) continue;
				if (Math.abs(this.x - c.x) < 52 && this.y > GROUND - 75) {
					this.hitSet.add(c);
					c.damage(sp * this.mass * 0.07);
					this.vx *= -0.3;
					this.vy *= 0.4;
					w.sound('crash');
					w.shake(4);
				}
			}
			if (this.y + this.rad > GROUND) {
				this.y = GROUND - this.rad;
				if (this.vy > 80) {
					w.dust(this.x, GROUND, 6);
					w.sound('thud');
					w.shake(Math.min(6, this.vy / 150));
				}
				this.vy = -this.vy * 0.3;
				this.vx *= 0.72;
				this.va = this.vx / this.rad;
			}
			if (sp > 130) this.hitBodies(sp);
		}

		const sp = Math.hypot(this.vx, this.vy);

		if ((sp < 30 && this.y >= GROUND - this.rad - 1) || this.life > 12 || this.x < -100 || this.x > W + 100) {
			this.spent = true;
			this.round = true;
			if (this.x > -50 && this.x < W + 50) w.props.push(this);
		}
	}

	hitWall(wl, ox, oy, sp) {
		const w = this.w;

		if (this.x + this.rad * 0.6 < wl.x0 || this.x - this.rad * 0.6 >= wl.x1) return false;

		const c = clamp(((this.x - wl.x0) / WALL.cw) | 0, 0, WALL.cols - 1);
		const col = wl.cols[c];

		if (!col.length) return false;

		const top = GROUND - col.length * WALL.ch;

		if (this.y + this.rad * 0.6 < top) return false;

		const r = clamp(((GROUND - this.y) / WALL.ch) | 0, 0, col.length - 1);
		const e = sp * this.mass, before = col.length;

		if (e > 60) w.wallImpact(wl, c, r, e, this.vx, this.vy);

		const broke = col.length < before;
		const fromSide = oy + this.rad * 0.6 >= top;

		this.x = ox;
		this.y = oy;
		if (broke && e > 300) {
			this.vx *= 0.5;
			this.vy *= 0.5;
		} else if (fromSide) {
			this.vx = -this.vx * 0.25;
			this.vy *= 0.6;
		} else {
			this.vy = -Math.abs(this.vy) * 0.3;
			this.vx *= 0.6;
		}
		if (e > 60) {
			w.sound('crash');
			w.shake(Math.min(8, e / 150));
		}

		return true;
	}

	hitBodies(sp) {
		const w = this.w, r = this.rad;

		for (const s of w.stickmen) {
			if (s.dead || this.hitSet.has(s) || Math.abs(s.x - this.x) > 60) continue;

			const j = s.body.j;
			let bd = Infinity;

			for (let b = 0; b < 10; b++) {
				if (!s.body.owned[b]) continue;

				const A = j[BONES[b][0]], B = j[BONES[b][1]];
				const d = segDist(this.x, this.y, A.x, A.y, B.x, B.y).d - (b === 1 ? s.body.tpl.headR * s.body.s : 0);

				if (d < bd) bd = d;
			}
			if (bd < r * 0.85 && sp > 200) {
				this.hitSet.add(s);
				this.crush(s, sp);
			}
		}
		for (const b of w.bodies) {
			if (b.kin) continue;
			for (const p of b.j) {
				if (Math.hypot(p.x - this.x, p.y - this.y) < r + 4) {
					p.px = p.x - this.vx * DT * 0.6;
					p.py = p.y - this.vy * DT * 0.6;
					b.wake();
				}
			}
			if (sp > 320 && !this.hitSet.has(b) && Math.hypot(b.anchor().x - this.x, b.anchor().y - this.y) < r + 25) {
				this.hitSet.add(b);
				w.spray(this.x, this.y, 10, this.vx / sp, -0.5, 0.5, 220);

				const bones = b.owned.map((o, i) => (o ? i : -1)).filter(i => i > 0);

				if (bones.length && Math.random() < 0.4) w.cut(b, pick(bones), this.vx * DT * 0.3);
			}
		}
		for (const p of w.props) {
			if (p !== this && Math.hypot(p.x - this.x, p.y - this.y) < r + p.r) p.kick(this.vx * 0.5, -Math.abs(this.vy) * 0.3 - 100);
		}
	}

	crush(s, sp) {
		const w = this.w, e = sp * this.mass, dmg = e * 0.16;
		const fromAbove = this.vy > 150 && this.y < s.body.j[2].y;

		s.hp -= dmg;
		w.spray(this.x, this.y, 20 + dmg * 0.4, this.vx / sp, this.vy / sp - 0.6, 0.5, 200 + sp * 0.3);
		this.blood = Math.min(1, this.blood + 0.35);
		w.sound('squish');
		w.shake(3);

		const ix = this.vx * DT * 0.5, iy = this.vy * DT * 0.5;
		const p = clamp(e / 1000, 0.1, 0.8) * (1 + this.spiky) * 0.7;

		for (let k = 0; k < 10; k++) {
			if (!s.body.owned[k] || (k === 0 && e < 600)) continue;

			const A = s.body.j[BONES[k][0]], B = s.body.j[BONES[k][1]];

			if (segDist(this.x, this.y, A.x, A.y, B.x, B.y).d < this.rad * 2.4 && Math.random() < p) s.sever(k, ix);
		}
		if (fromAbove && e > 350) {
			s.body.squash = rand(0.25, 0.45);
			w.bigSplat(s.x);
			s.hp = 0;
		}
		if (!s.dead && s.hp <= 0) s.die(ix, -iy);
		else if (!s.dead) {
			s.kb += this.vx * 0.4;
			s.stag = 0.4;
		}
		if (s.dead) {
			for (const q of s.body.j) {
				q.px -= ix;
				q.py -= iy;
			}
		}
		this.vx *= 0.8;
		this.vy *= 0.8;
	}
}

// ---------------------------------------------------------------- catapults

class Catapult {
	constructor(w, team, x) {
		Object.assign(this, { w, team, x });
		this.dir = team === 0 ? 1 : -1;
		this.hp = 100;
		this.ammo = AMMO;
		this.cd = rand(0.5, 1.5);
		this.fireT = -1;
		this.pend = null;
		this.dead = false;
		this.shk = 0;
		this.arm = CAT_REST;
		this.beams = [0, 1, 2, 3].map(() => w.pickArt(team, 'beams'));
		this.wheels = [w.pickArt(team, 'stones'), w.pickArt(team, 'stones')];
		this.load = w.pickArt(team, 'ammo');
	}

	geometry() {
		return catGeometry(this.x, this.dir, this.arm);
	}

	ready() {
		return !this.dead && this.cd <= 0 && this.ammo > 0 && this.fireT < 0;
	}

	fire(vx, vy) {
		if (!this.ready()) return false;
		this.fireT = 0;
		this.pend = holdFling(vx, vy);
		this.ammo--;
		this.w.sound('launch');

		return true;
	}

	update(dt) {
		if (this.dead) return;
		this.cd -= dt;
		this.shk = Math.max(0, this.shk - dt);
		if (this.fireT >= 0) {
			this.fireT += dt;
			this.arm = lerp(CAT_REST, CAT_FIRE, easeIn(clamp(this.fireT / 0.16, 0, 1)));
			if (this.pend && this.fireT >= 0.13) {
				const [lx, ly] = this.geometry().launch;

				this.w.projs.push(new Proj(this.w, this.load, lx, ly, this.pend[0], this.pend[1], this.team));
				this.load = this.w.pickArt(this.team, 'ammo');
				this.pend = null;
				this.cd = RELOAD;
			}
			if (this.fireT > 0.4) this.fireT = -1;
		} else this.arm += (CAT_REST - this.arm) * Math.min(1, dt * 2.2);
	}

	damage(d) {
		if (this.dead) return;
		this.hp -= d;
		this.shk = 0.25;
		this.w.dust(this.x, GROUND - 40, 5, 'wood');
		if (this.hp <= 0) this.wreck();
	}

	wreck() {
		this.dead = true;

		const w = this.w, g = this.geometry();

		g.segs.forEach(([a, b], i) => {
			const ref = this.beams[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
			const pr = new Prop(w, ref, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, len, beamScale(w.itemOf(ref), len), 'wood');

			pr.a = Math.atan2(b[1] - a[1], b[0] - a[0]);
			pr.kick(rand(-160, 160), rand(-380, -160));
			w.props.push(pr);
		});
		g.wheels.forEach(([x, y], i) => {
			const pr = new Prop(w, this.wheels[i], x, y, 26, 26, 'stone');

			pr.round = true;
			pr.kick(rand(-200, 200), rand(-300, -100));
			w.props.push(pr);
		});
		w.dust(this.x, GROUND - 40, 20, 'wood');
		w.shake(8);
		w.sound('crash');
	}

	snapshot() {
		return {
			x: this.x,
			d: this.dir,
			t: this.team,
			hp: Math.round(this.hp),
			n: this.ammo,
			cd: Math.round(Math.max(0, this.cd) * 10) / 10,
			arm: Math.round(this.arm * 100) / 100,
			dead: this.dead,
			shk: this.shk > 0,
			b: this.beams.map(ref => [ref.a, ref.i]),
			wh: this.wheels.map(ref => [ref.a, ref.i]),
			l: [this.load.a, this.load.i],
			// Something sits in the bucket: loaded and nearly ready, or just about to fly
			ld: this.ammo > 0 && this.cd < 0.4 && (this.fireT < 0 || Boolean(this.pend)),
		};
	}
}

// ---------------------------------------------------------------- the world

export class World {
	/**
	 * @param {object} options - Options
	 * @param {Array<object>} options.arts - Each side's art: { stickmen: [...], stones: [...], ... }, by team
	 * @param {Array<number>} [options.artOf] - Whose art each side fights with (default each its own)
	 * @param {Array<boolean>} [options.auto] - Which sides the computer plays
	 */
	constructor({ arts, artOf = [0, 1], auto = [false, true] }) {
		this.arts = arts;
		this.artOf = artOf;
		this.auto = auto;
		this.stickmen = [];
		this.bodies = [];
		this.props = [];
		this.projs = [];
		this.walls = [this.makeWall(0, WALL_X[0]), this.makeWall(1, WALL_X[1])];
		this.cats = CAT_X.flatMap((xs, team) => xs.map(x => new Catapult(this, team, x)));
		this.reserve = [ARMY, ARMY];
		this.spawnX = [this.walls[0].x1 + 30, this.walls[1].x0 - 30];
		this.stats = { kills: [0, 0], limbs: 0, heads: 0, blood: 0 };
		this.hold = [false, false];
		this.time = 0;
		this.slow = 0;
		this.over = null;
		this.overT = 0;
		this.events = [];
		this.shaking = 0;
		this.ai = [{ deploy: 1.5 }, { deploy: 2.5 }];
	}

	/** One of a side's drawings of a kind, at random, as a reference to it */
	pickArt(team, kind) {
		const a = this.artOf[team], items = this.arts[a][kind];

		return { k: kind, a, i: (Math.random() * items.length) | 0 };
	}

	itemOf(ref) {
		return this.arts[ref.a][ref.k][ref.i];
	}

	makeWall(team, x0) {
		const cols = [];

		for (let c = 0; c < WALL.cols; c++) {
			const col = [];

			for (let r = 0; r < WALL.rows; r++) {
				col.push({
					hp: 4,
					max: 4,
					st: this.pickArt(team, 'stones'),
					rot: rand(-0.15, 0.15),
					sx: rand(1.08, 1.22),
					sy: rand(1.15, 1.3),
					dy: 0,
					vy: 0,
					cr: [rand(0, TAU), rand(0, TAU)],
				});
			}
			cols.push(col);
		}

		return { team, x0, x1: x0 + WALL.cols * WALL.cw, cols };
	}

	wallAt(x) {
		for (const wl of this.walls) if (x >= wl.x0 && x < wl.x1) return wl;

		return null;
	}

	groundAt(x) {
		return groundAt(this.walls, x);
	}

	collideJoint(p) {
		const g = this.groundAt(p.x);

		if (p.y <= g) return;
		if (g < GROUND && p.py > g + 2) {
			const wl = this.wallAt(p.x), c = ((p.x - wl.x0) / WALL.cw) | 0;
			const cl = wl.x0 + c * WALL.cw, cr = cl + WALL.cw;

			if (p.px < cl) p.x = cl - 0.1;
			else if (p.px >= cr) p.x = cr + 0.1;
			else {
				p.y = g;
				p.py = g;
			}

			const g2 = this.groundAt(p.x);

			if (p.y > g2) p.y = g2;

			return;
		}

		const vy = p.y - p.py;

		p.y = g;
		p.py = g + vy * 0.3;
	}

	addBody(b) {
		this.bodies.push(b);
		if (this.bodies.length > 90) {
			const i = this.bodies.findIndex(x => !x.kin && (!x.owner || x.owner.dead));

			if (i >= 0) this.bodies.splice(i, 1);
		}
	}

	deploy(t) {
		if (this.reserve[t] <= 0 || this.over) return false;
		this.reserve[t]--;

		const wl = this.walls[t];
		const s = new Stickman(this, t, t === 0 ? wl.x0 + 10 : wl.x1 - 10);

		this.stickmen.push(s);
		this.addBody(s.body);
		this.sound('deploy');

		return true;
	}

	/** A side's catapult flung by a player: which of its two, and how hard which way */
	fling(team, which, vx, vy) {
		const cat = this.cats.filter(c => c.team === team)[which];

		return Boolean(cat?.fire(vx, vy));
	}

	// Cut bone b (and everything hanging off it) away from body. Returns the severed piece.
	cut(body, b, ix) {
		if (!body.owned[b]) return null;

		const g = body.split(subtreeMask(b));
		const pj = BONES[b][0], cj = BONES[b][1];
		const A = body.j[pj], B = body.j[cj];
		const dl = Math.hypot(B.x - A.x, B.y - A.y) || 1;
		const dx = (B.x - A.x) / dl, dy = (B.y - A.y) / dl;
		const pop = b === 1 ? rand(4, 7) : rand(1.5, 4);

		for (const p of g.j) {
			p.px += -ix * rand(0.8, 1.6);
			p.py += pop;
		}
		body.stumps.push({ j: pj, t: 3.5, ph: rand(0, TAU), dx, dy });
		g.stumps.push({ j: pj, t: 2, ph: rand(0, TAU), dx: -dx, dy: -dy });
		this.spray(A.x, A.y, 30, dx, dy, 0.4, 260);
		this.addBody(g);
		g.dropWeapon();
		body.wake();
		this.stats.limbs++;
		this.sound('sever');

		return g;
	}

	corpseHit(body, b, st, dir, hx, hy) {
		this.spray(hx, hy, 4 + st.bleed * 2, dir, -0.3, 0.4, 180);
		for (const k of BONES[b]) body.j[k].px -= dir * 1.5;
		body.wake();
		this.sound('hit');
		if (Math.random() < st.cut * 0.5) this.cut(body, b, dir * 1.5);
	}

	hurtBrick(wl, c, r, dmg) {
		const col = wl.cols[c];

		if (col && r >= 0 && r < col.length) col[r].hp -= dmg;
	}

	wallImpact(wl, c, r, e, vx, vy) {
		const d = e / 220;

		this.hurtBrick(wl, c, r, d);
		for (const [dc, dr] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		])
			this.hurtBrick(wl, c + dc, r + dr, d * 0.45);
		this.cleanWall(wl, vx, vy);
		this.dust(wl.x0 + (c + 0.5) * WALL.cw, GROUND - (r + 0.5) * WALL.ch, 10);
	}

	cleanWall(wl, vx, vy) {
		for (let c = 0; c < WALL.cols; c++) {
			const col = wl.cols[c];

			for (let r = col.length - 1; r >= 0; r--) if (col[r].hp <= 0) this.knockBrick(wl, c, r, vx, vy);
		}
	}

	knockBrick(wl, c, r, vx, vy) {
		const col = wl.cols[c], br = col[r];
		const x = wl.x0 + (c + 0.5) * WALL.cw, y = GROUND - (r + 0.5) * WALL.ch - br.dy;

		col.splice(r, 1);
		for (let k = r; k < col.length; k++) col[k].dy += WALL.ch;

		const pr = new Prop(this, br.st, x, y - 4, WALL.cw * br.sx, WALL.ch * br.sy, 'hurt');

		pr.a = br.rot;
		pr.kick(vx * 0.35 + rand(-80, 80), vy * 0.3 - rand(50, 200));
		this.props.push(pr);
		this.dust(x, y, 8);
	}

	// What a page plays and the server doesn't keep: blood flying, dust, sounds, a shake, a splat
	emit(event) {
		if (this.events.length < 400) this.events.push(event);
	}

	spray(x, y, n, dx, dy, spread, speed) {
		n = Math.min(n | 0, 90);
		if (n <= 0) return;
		this.stats.blood += n;
		this.emit({ e: 'blood', x: Math.round(x), y: Math.round(y), n, a: Math.round(Math.atan2(dy, dx) * 100) / 100, sp: spread, v: Math.round(speed) });
	}

	dust(x, y, n, color = 'stone') {
		this.emit({ e: 'dust', x: Math.round(x), y: Math.round(y), n, c: color });
	}

	bigSplat(x) {
		this.emit({ e: 'splat', x: Math.round(x) });
		this.spray(x, GROUND - 5, 60, 0, -1, 0.45, 380);
	}

	sound(name) {
		if (!this.events.some(event => event.e === 'sound' && event.n === name)) this.emit({ e: 'sound', n: name });
	}

	shake(amount) {
		this.shaking = Math.min(14, this.shaking + amount);
	}

	slowmo(d) {
		this.slow = Math.max(this.slow, d);
	}

	/** What happened since the last call, for the pages, and the slate wiped */
	takeEvents() {
		const events = this.events;

		if (this.shaking > 0.3) events.push({ e: 'shake', v: Math.round(this.shaking * 10) / 10 });
		this.events = [];
		this.shaking = 0;

		return events;
	}

	step(dt) {
		this.time += dt;
		for (const s of this.stickmen) s.update(dt);
		this.stickmen = this.stickmen.filter(s => !s.dead);
		this.separate(dt);
		for (const b of this.bodies) b.update(dt);
		this.bodies = this.bodies.filter(b => !b.empty());
		for (const c of this.cats) c.update(dt);
		for (const p of this.projs) p.step(dt);
		this.projs = this.projs.filter(p => !p.spent);
		for (const p of this.props) p.update(dt);
		if (this.props.length > 140) this.props.splice(0, this.props.length - 140);
		for (const wl of this.walls) {
			for (const col of wl.cols) {
				for (const br of col) {
					if (br.dy <= 0) continue;
					br.vy += 1400 * dt;
					br.dy -= br.vy * dt;
					if (br.dy <= 0) {
						br.dy = 0;
						br.vy = 0;
					}
				}
			}
		}
		this.runAI(dt);
		this.checkOver(dt);
	}

	separate(dt) {
		const s = this.stickmen;

		for (let i = 0; i < s.length; i++) {
			const a = s[i];

			if (!a.alive() || a.atk) continue;
			for (let k = i + 1; k < s.length; k++) {
				const b = s[k];

				if (b.team !== a.team || !b.alive() || b.atk) continue;

				const d = b.x - a.x;

				if (Math.abs(d) < 11) {
					const push = (d >= 0 ? 1 : -1) * 25 * dt;

					a.x -= push;
					b.x += push;
				}
			}
		}
	}

	runAI(dt) {
		for (let t = 0; t < 2; t++) {
			if (!this.auto[t] || this.over) continue;

			const ai = this.ai[t];

			ai.deploy -= dt;

			const mine = this.stickmen.filter(s => s.team === t && s.alive()).length;
			const theirs = this.stickmen.filter(s => s.team !== t && s.alive()).length;

			if (ai.deploy <= 0 && this.reserve[t] > 0) {
				this.deploy(t);
				ai.deploy = theirs > mine ? rand(0.6, 1.4) : rand(1.4, 3);
			}
			for (const c of this.cats) {
				if (c.team !== t || !c.ready() || Math.random() > dt * 0.3) continue;

				const tgt = this.aiTarget(t);

				if (!tgt) continue;

				const v = this.solve(c, tgt.x, tgt.y);

				if (v) c.fire(v[0] * rand(0.85, 1.15), v[1] * rand(0.9, 1.1));
			}
		}
	}

	aiTarget(t) {
		const foes = this.stickmen.filter(s => s.team !== t && s.alive());

		if (foes.length) {
			const wx = t === 0 ? this.walls[0].x1 : this.walls[1].x0;
			let best = null, bd = Infinity;

			for (const f of foes) {
				const d = Math.abs(f.x - wx);

				if (d < bd) {
					bd = d;
					best = f;
				}
			}

			const x = best.x + (best.moving ? best.face * best.speed * 1.3 : 0);

			if (this.stickmen.some(s => s.team === t && s.alive() && Math.abs(s.x - x) < 70)) return null;

			return { x, y: GROUND - 30 };
		}
		if (Math.random() < 0.25) {
			const ec = this.cats.filter(k => k.team !== t && !k.dead);

			if (ec.length) return { x: pick(ec).x, y: GROUND - 40 };
		}

		return null;
	}

	solve(c, tx, ty) {
		const [lx, ly] = c.geometry().launch;
		const dx = Math.abs(tx - lx), dy = ty - ly, sgn = Math.sign(tx - lx) || 1;

		for (const th of [0.95, 0.8, 1.1, 0.65, 1.25]) {
			const cs = Math.cos(th), den = 2 * cs * cs * (dy + dx * Math.tan(th));

			if (den <= 0) continue;

			const v = Math.sqrt((GRAV * dx * dx) / den);

			if (v < 1300) return [v * cs * sgn, -v * Math.sin(th)];
		}

		return null;
	}

	fighting(t) {
		return this.stickmen.filter(s => s.team === t && s.alive()).length;
	}

	aliveCount(t) {
		return this.fighting(t) + this.reserve[t];
	}

	checkOver(dt) {
		if (this.over) {
			this.overT += dt;

			return;
		}

		const a = this.aliveCount(0), b = this.aliveCount(1);

		if (a === 0 || b === 0) {
			this.over = { winner: a === 0 && b === 0 ? -1 : a === 0 ? 1 : 0 };
			this.slowmo(1.2);
		}
	}

	/** The battle as every page draws it, small enough to send many times a second */
	snapshot() {
		return {
			time: Math.round(this.time * 100) / 100,
			bodies: this.bodies.map(b => b.snapshot()),
			props: this.props.map(p => p.snapshot()),
			projs: this.projs.map(p => p.snapshot()),
			cats: this.cats.map(c => c.snapshot()),
			walls: this.walls.map(wl => ({
				x0: wl.x0,
				x1: wl.x1,
				team: wl.team,
				cols: wl.cols.map(col =>
					col.map(br => [br.st.a, br.st.i, Math.round((br.hp / br.max) * 100) / 100, br.rot, br.sx, br.sy, Math.round(br.dy), ...br.cr].map(v => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v))),
				),
			})),
			fighting: [this.fighting(0), this.fighting(1)],
			reserve: [...this.reserve],
			kills: [...this.stats.kills],
		};
	}
}
