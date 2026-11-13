// The battle, run on the server: stick men skinned onto skeletons (kinematic while alive, verlet ragdolls once dead,
// crippled or cut apart), walls of drawn stones, a catapult of drawn beams, flung rocks; or two gladiators in the arena.
// What can't be seen from a snapshot (blood, dust, sounds, a shake, the crowd) goes out as events for each page to play.
// The page draws the snapshots with the same geometry from field.js, and never imports this file: it would bundle the
// physics engine.

import {
	BONES,
	BONE_KIND,
	beefOf,
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

import { Masonry } from './masonry.js';
import {
	FADE,
	LINGER,
	faded,
	AMMO,
	rockThrow,
	ARENA_GATE,
	ARMY,
	CAT_FIRE,
	CAT_REST,
	CAT_ROLL,
	CAT_X,
	catRange,
	CAT_Z,
	DEPTH,
	DT,
	ENGAGE,
	GRAV,
	GROUND,
	LANE,
	MEND_PER_BLOW,
	MOST_CREW,
	MOST_FLING,
	ORDERS,
	ORDER_CODE,
	REBUILD_PER_BLOW,
	RELOAD,
	SEND_EVERY,
	SM_H,
	W,
	WALL,
	WALL_X,
	beamScale,
	catGeometry,
	holdFling,
	homeOf,
	subtreeMask,
} from './field.js';

// The field's geometry, for the server and tests that import the battle (never the page: it imports field.js itself)
export * from './field.js';

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
		// A gladiator's gear: armor drawn on him (bound to his bones), and a shield on his left forearm, { ref, hp }
		this.armor = null;
		this.shield = null;
		this.wOff = -1.1;
		this.owner = null;
		this.squash = 1;
		this.still = 0;
		// Where on the field's depth it lies
		this.z = 0;
	}

	split(mask) {
		const g = new Body(this.w, this.ref, this.team, this.flip, this.s);

		g.z = this.z;

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
		// The armor on whatever's cut away goes with it; the shield with the forearm holding it
		g.armor = this.armor;
		if (g.owned[3] && this.shield) {
			g.shield = this.shield;
			this.shield = null;
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

			if (Math.random() < Math.min(1, st.t * 0.6) * pulse * 0.5) w.spray(p.x, p.y, 4, st.dx, st.dy, 0.12, 90 + st.t * 70, this.z);
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

		pr.z = this.z;

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
			z: Math.round(this.z),
			s: Math.round(this.s * 10) / 10,
			f: this.flip,
			q: Math.round(this.squash * 100) / 100,
			o: mask,
			j: joints,
			...(wp && { w: [wp.ref.a, wp.ref.i, Math.round(wp.blood * 100) / 100], wo: Math.round(this.wOff * 100) / 100 }),
			...(this.armor && { ar: [this.armor.a, this.armor.i] }),
			// A gladiator's health, for the bar over him, and what he's been told, while it holds
			...(this.owner?.style && !this.owner.dead && { hp: Math.round(clamp(this.owner.hp / this.owner.maxHp, 0, 1) * 100) / 100 }),
			...(this.owner?.style && this.owner.alive() && this.owner.stance() && { cs: STANCE_CODE[this.owner.stance()] }),
			// The shield, and how much of it is left
			...(this.shield &&
				this.owned[3] && { sh: [this.shield.ref.a, this.shield.ref.i, Math.round((this.shield.hp / this.w.itemOf(this.shield.ref).stats.hp) * 100) / 100] }),
			...(this.stumps.length && { st: this.stumps.map(st => st.j) }),
			...(this.deadAt !== undefined && this.w.time - this.deadAt > LINGER.body && { fa: Math.round(faded(this.w.time - this.deadAt, LINGER.body) * 100) / 100 }),
			// A man still in the fight: can be picked out and told what to do
			...(this.owner?.alive() && this.kin && { u: ORDER_CODE[this.owner.order] }),
		};
	}
}

// ---------------------------------------------------------------- stick men

/** A gladiator beaten this badly yields, and the crowd decides his fate: as a part of his health */
export const YIELD_AT = 0.22;
/** How long the crowd keeps him waiting, then how long between each limb torn off if it's thumbs down, in seconds */
export const MERCY_WAIT = 3.6, QUARTER_EVERY = 0.35;
/** How fast the medics run; how long picking up a limb, slapping one on, and a slap to the face take */
export const MEDIC_RUN = 300, MEDIC_PICK = 0.35, MEDIC_ATTACH = 0.45, MEDIC_SLAP = 0.45;

/** The small chance the crowd spares him whatever else */
export const MERCY_LUCK = 0.05;

// The crowd's reactions, quietest to loudest
const CROWD_LOUDNESS = ['ooh', 'boo', 'roar', 'kill', 'erupt'];

/** What a gladiator's player can shout at him, and how long a shout holds, in seconds */
export const STANCES = ['charge', 'back', 'guard'], STANCE_FOR = 3;
// How each sits in a snapshot
const STANCE_CODE = { charge: 'c', back: 'b', guard: 'g' };

/** A gladiator's health: a soldier has 100 */
export const GLADIATOR_HP = 450;

const POSE = new Float64Array(10);
const FK = new Float64Array(22);

class Stickman {
	constructor(w, team, k) {
		this.w = w;
		this.team = team;
		this.face = team === 0 ? 1 : -1;
		this.body = new Body(w, w.pickArt(team, 'stickmen'), team, this.face, SM_H * rand(0.9, 1.1));
		this.body.owner = this;
		this.body.weapon = { ref: w.pickArt(team, 'swords'), blood: 0 };
		// In a war, about half the men carry one of their side's shields, if it drew any (a gladiator's is his own: gladiate)
		const shields = w.arts[w.artOf[team]].shield;

		if (!w.arena && shields?.length && Math.random() < SOLDIER_SHIELDS) {
			const ref = w.pickArt(team, 'shield');

			this.body.shield = { ref, hp: w.itemOf(ref).stats.hp };
		}
		// In the arena, each walks out of its own gate in the back wall
		const home = w.arena ? { x: W / 2 - this.face * ARENA_GATE, z: DEPTH - 12 } : homeOf(team, k, w.army[team]);

		this.home = home.x;
		this.homeZ = home.z;
		this.x = this.home + rand(-4, 4);
		this.z = clamp(this.homeZ + rand(-4, 4), 0, DEPTH);
		this.body.z = this.z;
		// What he's been told: stay home, crew a catapult (his post), hold by the wall, or charge
		this.order = 'idle';
		this.post = null;
		// Drawn beefy (outlined, muscled): arms hit harder and swing a touch slower, legs stand firmer and walk slower, and
		// either lasts a little longer; a gladiator's the same (gladiate)
		this.beef = beefOf(this.body.tpl);
		this.maxHp = Math.round(100 * (1 + 0.08 * (this.beef.arms + this.beef.legs)));
		this.hp = this.maxHp;
		this.bleed = 0;
		this.phase = rand(0, TAU);
		this.speed = rand(52, 68) * (1 - 0.08 * this.beef.legs) * (this.body.shield ? 0.9 : 1);
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
		if (w.arena) this.gladiate();
		this.pose(0, true);
	}

	// A gladiator: his gear on him, and how he moves and fights made of how he was drawn and what he carries
	// How much harder his arms hit for being drawn beefy
	might() {
		return 1 + 0.5 * (this.beef?.arms ?? 0);
	}

	gladiate() {
		const w = this.w, a = w.artOf[this.team], art = w.arts[a], L = this.body.tpl.lens;

		this.body.armor = art.armor?.length ? { k: 'armor', a, i: 0 } : null;
		this.body.shield = art.shield?.length ? { ref: { k: 'shield', a, i: 0 }, hp: art.shield[0].stats.hp } : null;

		const armor = this.body.armor && w.itemOf(this.body.armor);
		const shield = this.body.shield && art.shield[0].stats;
		const st = this.stats(), load = (armor?.weight ?? 0) + (shield?.weight ?? 0);
		const legs = (L[6] + L[7] + L[8] + L[9]) / 2, arms = (L[2] + L[3] + L[4] + L[5]) / 2;

		this.order = 'charge';
		// Long limbs reach and stride, but break: a spindly gladiator has less in him and loses limbs more easily, a stubby
		// one more, and holds on to them
		const spindly = clamp(legs / 0.42 - 1 + (arms / 0.28 - 1), -0.4, 0.6);

		// A gladiator is made to last: a duel is many blows, not one
		this.maxHp = Math.round(GLADIATOR_HP * clamp(1 - 0.65 * spindly, 0.68, 1.15) * (1 + 0.08 * (this.beef.arms + this.beef.legs)));
		this.hp = this.maxHp;
		this.limbFrailty = 0.45 * clamp(1 + 1.6 * spindly, 0.6, 1.9);
		// Long legs carry him faster; armor and a shield weigh him down
		this.speed = 60 * clamp(legs / 0.42, 0.75, 1.3) * clamp(1.1 - 0.15 * load, 0.5, 1) * (1 - 0.08 * this.beef.legs);
		// Long arms reach further
		this.armReach = clamp(arms / 0.28, 0.8, 1.25);
		// Each part of him as well covered as his armor covers it
		this.cover = armor?.cover ?? null;
		this.style = {
			// A long, light enough weapon is fought from the end of its reach
			keepAway: st.lr > 0.75 && st.weight < 1.6,
			// Light all over: in, strike, and out again
			dart: st.weight < 0.8 && load < 0.8,
			// Behind a shield: he stands his ground while he's swung at, and strikes back off a block
			guard: Boolean(shield),
			// Heavy armor: knocked about less
			steady: clamp((armor?.weight ?? 0) / 1.5 + 0.35 * this.beef.legs, 0, 0.8),
			// The less he carries, the likelier he is to slip a blow
			dodge: clamp(0.38 - 0.1 * load - 0.08 * st.weight, 0.05, 0.38),
		};
		this.retreat = 0;
	}

	// A swing at him slipped (a hop back out of it), or caught on his shield if he has one, it comes from in front, and
	// he's quick enough (less so while he's swinging himself). A shield takes the blow, and breaks once it's taken enough.
	fends(attacker) {
		if (!this.alive()) return false;
		// A soldier has no knack for slipping a blow, but a shield catches it as well in his hands as a gladiator's
		const stance = this.style ? this.stance() : null;
		// Charging, he's reckless; backing off or guarding, he's watching for it
		const wary = { charge: 0.3, back: 2, guard: 1.5 }[stance] ?? 1;

		// Guarding, a blow caught or slipped earns him a harder one back
		const earned = () => stance === 'guard' && (this.riposte = this.w.time + 1.2);

		if (this.style && !this.atk && Math.random() < this.style.dodge * wary) {
			earned();
			this.kb -= this.face * 120;
			this.retreat = Math.max(this.retreat, 0.2);
			this.w.sound('swing');
			this.w.dust(this.x, GROUND - 4, 6, 'sand', this.z);

			return true;
		}

		const sh = this.body.shield;

		if (!sh || !this.body.owned[3] || Math.sign(attacker.x - this.x) !== this.face) return false;

		const { block } = this.w.itemOf(sh.ref).stats;

		if (Math.random() > block * (this.atk ? 0.5 : 1) * ({ charge: 0.5, guard: 1.6 }[stance] ?? 1)) return false;

		const hit = attacker.stats(), h = this.body.j[4];

		earned();
		sh.hp -= hit.dmg * 0.5;
		this.kb += attacker.face * (25 + hit.knock * 35) * (1 - (this.style?.steady ?? 0.35 * (this.beef?.legs ?? 0)));
		this.cd = Math.min(this.cd, 0.2);
		this.w.dust(h.x, h.y, 5, 'wood', this.z);
		this.w.sound('thud');
		if (sh.hp <= 0) this.breakShield();
		else this.w.dust(this.x, GROUND - 4, 4, 'sand', this.z);

		return true;
	}

	// How much harder than his weapon alone he hits: charging, or striking back off a guarded blow
	fury() {
		return (this.stance() === 'charge' ? 1.2 : 1) * (this.riposte > this.w.time ? 1.35 : 1);
	}

	// What his player has shouted at him, while it holds
	stance() {
		return this.shout && this.w.time < this.shout.until ? this.shout.name : null;
	}

	breakShield() {
		const w = this.w, sh = this.body.shield, h = this.body.j[4];
		const size = w.itemOf(sh.ref).stats.rel * this.body.s;
		const pr = new Prop(w, sh.ref, h.x, h.y, size, size, 'wood', 0, 1.8);

		pr.z = this.z;
		pr.kick(rand(-90, 90), -rand(80, 170));
		pr.va = rand(-8, 8);
		w.props.push(pr);
		w.sound('crash');
		w.dust(h.x, h.y, 10, 'wood', this.z);
		w.crowd('ooh');
		this.body.shield = null;
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

	// How much his weapon slows his walk: nothing for a light one, a good deal for a great clunking one
	burden() {
		return this.armed() ? clamp(1.12 - 0.16 * this.stats().weight, 0.55, 1) : 1;
	}

	reach() {
		return (this.armed() ? this.stats().reach * 0.8 + 10 : 22) * (this.armReach ?? 1);
	}

	// Where a side holding by its wall stands, each man his own spot
	holdX() {
		const wl = this.w.walls[this.team];

		return this.team === 0 ? wl.x1 + 40 + this.slot * 90 : wl.x0 - 40 - this.slot * 90;
	}

	// And how far back he stands there: the side's line spread across the field's depth
	holdZ() {
		return 12 + ((this.homeZ * 7 + this.slot * DEPTH) % (DEPTH - 24));
	}

	// Where he stands crewing his catapult: behind it, beside whoever crews it already
	crewX() {
		const cat = this.post;
		const mates = this.w.stickmen.filter(s => s.post === cat && s.order === 'crew' && s.alive());

		return cat.x - cat.dir * (44 + Math.max(0, mates.indexOf(this)) * 13);
	}

	// Where he stands repairing: inside his own wall, or beside the catapult he's mending, apart from the others at it
	repairSpot() {
		const post = this.post;
		const mates = this.w.stickmen.filter(s => s.post === post && s.order === 'repair' && s.alive());
		const at = Math.max(0, mates.indexOf(this));

		if (post.isWall) {
			const inside = this.team === 0 ? post.x0 - 16 : post.x1 + 16;

			return { x: inside - (this.team === 0 ? 1 : -1) * (at % 2) * 14, z: clamp(20 + at * 37, 0, DEPTH) };
		}

		return { x: post.x + post.dir * 34, z: clamp(post.z + (at - 1) * 14, 0, DEPTH) };
	}

	// Where he's off to for his smashed catapult: a piece of it still lying out (his, claimed), or home with the one he
	// carries; null once all are home or claimed, to hammer it together. Picks a piece up, and sets it down, on arriving.
	fetchSpot() {
		const cat = this.post;

		if (this.carry) {
			if (Math.abs(this.x - cat.x) < 18 && Math.abs(this.z - cat.z) < 12) {
				cat.bringBack(this.carry);
				this.carry = null;

				return null;
			}

			return { x: cat.x, z: cat.z };
		}

		const out = cat.scraps.filter(p => !p.home && !p.carrier && (!p.claim || p.claim === this || !p.claim.alive() || p.claim.post !== cat));

		if (!out.length) return null;

		const scrap = out.includes(this.claimed) ? this.claimed : out.sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x))[0];

		scrap.claim = this;
		this.claimed = scrap;
		if (Math.abs(scrap.x - this.x) < 16 && Math.abs(scrap.z - this.z) < 12) {
			this.carry = scrap;
			scrap.carrier = this;
			this.w.sound('thud');

			return { x: cat.x, z: cat.z };
		}

		return { x: scrap.x, z: scrap.z };
	}

	// The piece he carries, let fall where he is
	dropCarry() {
		if (!this.carry) return;
		this.carry.carrier = null;
		this.carry.kick(this.face * 20, -60);
		this.carry = null;
	}

	// At his place by what he's repairing, close enough to work on it
	atRepair() {
		const spot = this.repairSpot();

		return Math.abs(this.x - spot.x) < 14 && Math.abs(this.z - spot.z) < 10;
	}

	// Crew stand beside their catapult's depth, a little apart
	crewZ() {
		const cat = this.post;
		const mates = this.w.stickmen.filter(s => s.post === cat && s.order === 'crew' && s.alive());

		return clamp(cat.z + (Math.max(0, mates.indexOf(this)) - 1) * 12, 0, DEPTH);
	}

	// How far away another is across the field, depth counting double: men cross the field slower than they march it
	far(other) {
		return Math.hypot(other.x - this.x, (other.z - this.z) * 2);
	}

	// Crewing his catapult now: told to, and standing at his place by it
	manning(cat) {
		return this.order === 'crew' && this.post === cat && this.alive() && Math.abs(this.x - this.crewX()) < 20;
	}

	pickTarget() {
		let best = null, bd = Infinity;

		for (const s of this.w.stickmen) {
			// In the arena, a foe down on the ground is still the one he stands over
			if (s.team === this.team || s.dead || (!s.alive() && !this.w.arena)) continue;

			const d = this.far(s);

			if (d < bd) {
				bd = d;
				best = s;
			}
		}
		// Only a man charging goes looking; the rest fight whoever comes close, a man holding the wall within reach of it
		if (this.order === 'hold' && best && Math.abs(best.x - this.holdX()) > 320 && bd > ENGAGE) best = null;
		else if (this.order !== 'charge' && this.order !== 'hold' && bd > ENGAGE) best = null;
		this.target = best;
	}

	enemyWall() {
		return this.w.walls[1 - this.team];
	}

	// The enemy's stones stop us unless what's ahead is at most about one stone above our footing; then it's hacked at
	wallBlock(dir) {
		const fx = this.x + dir * 7;
		const ahead = GROUND - this.w.masonry.groundOf(1 - this.team, fx);

		return ahead > this.yOff + WALL.ch * 1.1 ? { x: fx + dir * 6 } : null;
	}

	// How high he stands: on top of whatever enemy stones are under him
	footing() {
		return GROUND - this.w.masonry.groundOf(1 - this.team, this.x);
	}

	update(dt) {
		if (this.dead) return;

		const w = this.w;

		// A gladiator beaten down yields, to wait on the crowd: he doesn't bleed while he does
		if (this.style && !this.yielded && !w.mercy && !w.over && (this.incap || this.hp < this.maxHp * YIELD_AT)) w.yieldBy(this);
		// While a yielded gladiator waits on the crowd, neither bleeds: the winner can't die of his wounds meanwhile
		if (!this.yielded && !(w.arena && w.mercy)) this.hp -= (this.bleed + this.body.stumps.length * 5) * dt;
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
		// Carrying a piece of his smashed catapult home: dropped where he stands if he's sent elsewhere
		if (this.carry && !(this.order === 'repair' && this.post?.dead)) this.dropCarry();
		this.stag = Math.max(0, this.stag - dt);
		this.retreat = Math.max(0, (this.retreat ?? 0) - dt);
		// Backing off, he catches his breath: his bleeding slows, and a little of what he's lost comes back
		if (this.stance() === 'back') {
			this.bleed *= Math.pow(0.4, dt);
			this.hp = Math.min(this.maxHp, this.hp + 8 * dt);
		}

		let move = 0, want = null, goalZ = this.z;
		const R = this.reach(), tg = this.target;
		const forward = this.team === 0 ? 1 : -1;

		if (tg && (tg.alive() || (this.w.arena && !tg.dead))) {
			const dx = tg.x - this.x, adx = Math.abs(dx);
			const lined = Math.abs(tg.z - this.z) < LANE;

			// Gladiators meet out in the middle of the arena, not along its back wall
			goalZ = this.style ? lerp(tg.z, DEPTH / 2, 0.5) : tg.z;
			this.face = dx >= 0 ? 1 : -1;
			if (adx > R) move = this.face;
			else if (adx < 9) move = -this.face;
			if (adx <= R + 4 && lined) want = { type: 'sm' };
			// A yielded foe isn't struck: he stands over him, and the crowd decides
			if (tg.yielded) {
				want = null;
				move = adx > R ? this.face : 0;
			}

			// A gladiator fights his own way: out again after a strike, a long reach kept at its length, a shield held
			// steady while he's swung at
			const style = this.style;

			const stance = this.stance();

			// What his player shouts comes first: in at him, back off out of reach, or stand and guard
			if (stance === 'charge') {
				if (adx > R * 0.7) move = this.face;
			} else if (stance === 'back') {
				move = adx < R + 60 ? -this.face : 0;
				want = null;
			} else if (stance === 'guard') {
				if (move === this.face && adx < R + 40) move = 0;
				// Only striking back off a block
				if (this.cd > 0.05) want = null;
			} else if (style && this.retreat > 0) {
				move = -this.face;
				want = null;
			} else if (style?.keepAway && adx < R * 0.6) move = -this.face;
			else if (style?.guard && tg.atk && adx < tg.reach() + 15 && move === this.face) move = 0;
		} else if (this.order !== 'charge') {
			if (this.order === 'crew' && (!this.post || this.post.dead)) this.order = 'idle';

			const crew = this.order === 'crew', hold = this.order === 'hold', repair = this.order === 'repair';
			// A smashed catapult is rebuilt from its own pieces: each fetched from where it fell, then hammered together
			const fetch = repair && !this.post.isWall && this.post.dead ? this.fetchSpot() : null;
			const fix = fetch ?? (repair && this.repairSpot());
			let spot = this.home;

			if (hold) spot = this.holdX();
			else if (crew) spot = this.crewX();
			else if (repair) spot = fix.x;

			const dx = spot - this.x;

			goalZ = hold ? this.holdZ() : crew ? this.crewZ() : repair ? fix.z : this.homeZ;
			if (Math.abs(dx) > 6) move = Math.sign(dx);
			this.face = move || forward;
			// At his place, a repairer hammers away at it, facing it
			if (repair && !fetch && !move && this.atRepair()) {
				const post = this.post;

				this.face = (post.isWall ? (post.x0 + post.x1) / 2 : post.x) >= this.x ? 1 : -1;
				if (this.w.needsRepair(post)) want = { type: 'fix', post };
			}
		} else {
			let cat = null, cd = Infinity;

			for (const c of w.cats) {
				if (c.team === this.team || c.dead) continue;

				const d = this.far(c);

				if (d < cd) {
					cd = d;
					cat = c;
				}
			}
			if (cat) {
				const dx = cat.x - this.x;

				goalZ = cat.z;
				this.face = Math.sign(dx) || 1;
				if (Math.abs(dx) > R + 28) move = this.face;
				else if (Math.abs(cat.z - this.z) < LANE * 2) want = { type: 'cat', cat };
			} else {
				const gx = w.spawnX[1 - this.team] - forward * (30 + this.slot * 60);
				const dx = gx - this.x;

				goalZ = this.holdZ();
				if (Math.abs(dx) > 8) move = Math.sign(dx);
				this.face = move || forward;
			}
		}
		if (move) {
			const bl = this.wallBlock(move);

			if (bl) {
				move = 0;
				if (!want) want = { type: 'wall', x: bl.x };
			}
		}

		if (want && !this.atk && this.cd <= 0 && this.stag <= 0 && this.hasArm()) this.startAttack(want);

		// A heavy weapon slows the man carrying it, as well as his swing
		// Badly hurt, he slows (a gladiator, made to last, when he's as hurt as a soldier would be)
		const pace = this.speed * dt * (this.hp < (this.maxHp ?? 100) * 0.35 ? 0.7 : 1) * this.burden();
		const dz = clamp(goalZ, 0, DEPTH) - this.z;

		if (this.atk) {
			move = 0;
			this.stepAttack(dt);
		} else if (Math.abs(dz) > 2) this.z += clamp(dz, -pace * 0.7, pace * 0.7);

		this.moving = move !== 0 || (!this.atk && Math.abs(dz) > 2);
		if (move) this.x += move * pace;
		if (this.moving) this.phase += dt * this.speed * 0.11;
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
		// A long arm is a long lever: a gladiator's longer reach swings slower
		const lever = Math.pow(this.armReach ?? 1, 1.4) * (1 + 0.05 * (this.beef?.arms ?? 0));

		this.atk = { t: 0, dur: st.swing * rand(0.9, 1.1) * lever, kind, want, bones: new Set(), bodies: new Map(), done: false };
		this.prevSeg = null;
	}

	stepAttack(dt) {
		const a = this.atk, before = a.t, w = this.w;

		a.t += dt / a.dur;
		if (before < 0.45 && a.t >= 0.45) w.sound('swing');
		if (a.kind === 'stab' && a.t > 0.45 && a.t < 0.65 && !this.wallBlock(this.face)) this.x += this.face * 70 * dt;
		if (!a.done && a.t >= 0.58 && a.want.type !== 'sm') {
			a.done = true;

			const dmg = this.stats().dmg * this.might();

			if (a.want.type === 'wall') {
				// At chest height, or lower down if there's nothing there
				const enemy = 1 - this.team, chest = GROUND - this.yOff - SM_H * 0.5;

				if (w.masonry.hack(enemy, a.want.x, chest, dmg * 0.035) || w.masonry.hack(enemy, a.want.x, GROUND - this.yOff - 10, dmg * 0.035)) {
					w.dust(a.want.x, chest, 4, 'stone', this.z);
					w.sound('thud');
				}
			} else if (a.want.type === 'cat' && !a.want.cat.dead) {
				a.want.cat.damage(dmg * 0.35);
				w.sound('thud');
			} else if (a.want.type === 'fix') {
				w.repair(a.want.post, this);
			}
		}
		if (a.t >= 1) {
			this.atk = null;
			// Told to charge, he swings again sooner
			this.cd = rand(0.1, 0.45) * (this.stance() === 'charge' ? 0.5 : 1);
			this.prevSeg = null;
			// A light gladiator darts out after a strike, and in again sooner
			if (this.style?.dart && a.want.type === 'sm') {
				this.retreat = rand(0.3, 0.55);
				this.cd = rand(0.05, 0.2);
			}
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
		b.z = this.z;
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
		// A gladiator charging hits harder, and harder still striking back off a guarded blow
		// Beefy arms hit harder and knock further; a gladiator charging harder still
		const base = this.stats(), might = this.might();
		const st = { ...base, dmg: base.dmg * might * (this.style ? this.fury() : 1), knock: base.knock * might };

		for (const body of this.w.bodies) {
			if (body === this.body) continue;

			const o = body.owner;

			if (o && !o.dead && o.team === this.team) continue;
			if (Math.abs(body.anchor().x - this.x) > 150 || Math.abs(body.z - this.z) > LANE * 1.3) continue;

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
				// One chance a swing to slip it or catch it on a shield
				if (o && !o.dead && !(a.blockTried ??= new Set()).has(body.id)) {
					a.blockTried.add(body.id);
					if (o.fends(this)) {
						a.bodies.set(body.id, 2);
						break;
					}
				}
				a.bones.add(key);
				a.bodies.set(body.id, ++n);

				const hx = (A.x + B.x) / 2, hy = (A.y + B.y) / 2;

				// The last blade to wound a man is the one credited if he dies of it
				if (o && !o.dead && this.armed()) o.lastHit = this.body.weapon.ref;
				if (o && !o.dead) o.takeHit(b, st, this.face, hx, hy);
				else this.w.corpseHit(body, b, st, this.face, hx, hy);
				if (this.armed()) this.body.weapon.blood = Math.min(1, this.body.weapon.blood + 0.12);
			}
		}
	}

	takeHit(b, st, dir, hx, hy) {
		// Yielded, he's left alone: his life is the crowd's now
		if (this.yielded) return;

		const w = this.w, kind = BONE_KIND[b];
		// Armor over where he's hit takes some of it, the more of that part it covers
		const prot = (this.cover?.[kind] ?? 0) * 0.6, steady = this.style?.steady ?? 0.35 * (this.beef?.legs ?? 0);
		const dmg = st.dmg * { head: 1.9, torso: 1, arm: 0.5, leg: 0.6 }[kind] * rand(0.8, 1.25) * (1 - prot);

		this.hp -= dmg;
		// No blow kills a gladiator outright: beaten, he yields, and his life is the crowd's to give or take
		if (this.style && !this.yielded) this.hp = Math.max(this.hp, 1);
		this.bleed = Math.min(25, this.bleed + st.bleed * 0.6 * (1 - prot));
		w.spray(hx, hy, (6 + dmg * 0.5 + st.bleed * 3) * (1 - prot), dir, -0.35, 0.35, 160 + dmg * 3, this.z);
		if (prot > 0.2) w.dust(hx, hy, 4, 'stone', this.z);
		w.sound(prot > 0.3 ? 'thud' : 'hit');
		// The arena's crowd gasps at a big blow, and he skids in the sand
		if (w.arena) {
			if (dmg > 45) w.crowd('ooh');
			w.dust(this.x, GROUND - 4, 5, 'sand', this.z);
		}
		this.kb += dir * (40 + st.knock * 70) * (1 - steady);
		this.stag = 0.25 * (1 - steady);
		if (this.atk && Math.random() < 0.5) this.atk = null;

		let cutP = (st.cut * dmg) / 22;

		if (kind === 'torso') cutP = dmg > 40 && Math.random() < st.cut * 0.3 ? 1 : 0;
		if (kind === 'head') cutP *= 0.7;
		cutP *= Math.max(0, 1 - prot * 1.3) * (this.limbFrailty ?? 1);
		// A gladiator never loses his head in the fight (that's for the crowd to say), and a limb to no more than a lucky blow
		if (this.style) cutP = kind === 'head' || kind === 'torso' ? 0 : Math.min(cutP, 0.3);
		if (Math.random() < cutP) this.sever(b, dir * (1 + st.knock));
		if (!this.dead && this.hp <= 0) this.die(dir * (2 + st.knock * 2), 1.5);
	}

	sever(b, ix) {
		if (!this.body.owned[b]) return;
		this.w.cut(this.body, b, ix);
		// A limb flying off: the stands erupt
		this.w.crowd('erupt');
		if (b === 1) {
			this.w.stats.heads++;
			this.w.slowmo(0.35);
			this.die(ix * 0.5, 0);
		} else if (b === 0) {
			this.w.slowmo(0.35);
			this.die(ix * 0.5, 0);
		} else if (b >= 6 && !this.dead && !this.incap) this.goIncap();
		// With no arms left to fight with, he only bleeds now, until he's gone
		if (!this.hasArm()) {
			this.atk = null;
			this.bleed = Math.max(this.bleed, 6);
		}
	}

	goIncap() {
		this.incap = true;
		this.atk = null;
		// Down, he bleeds; a gladiator yields on his next step, and the bleeding stops while the crowd decides
		this.bleed = Math.max(this.bleed, 8);
		this.body.kin = false;
		this.body.dropWeapon();
		for (const p of this.body.j) p.px += this.face * 1.2;
	}

	die(ix, iy) {
		if (this.dead) return;
		this.dropCarry();
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
		b.deadAt = this.w.time;
		this.w.stats.kills[1 - this.team]++;
		// Each weapon's kills, by its drawing: for the armory's records (in the arena, the duel's win is the kill)
		if (this.lastHit && !this.w.arena) this.w.creditKill(this.lastHit);
		this.w.crowd('roar');
		if (this.w.arena) this.w.dust(this.x, GROUND - 4, 14, 'sand', this.z);
	}
}

// ---------------------------------------------------------------- props & projectiles

let PROP_ID = 1;

class Prop {
	// ref: { k: kind, a: whose art, i: which }; fill: stone, hurt, wood, steel or ammo
	constructor(w, ref, x, y, sx, sy, fill, ox = 0, lw = 1.6) {
		Object.assign(this, { w, ref, x, y, sx, sy, fill, ox, lw });
		this.id = PROP_ID++;
		this.born = w.time;
		this.vx = 0;
		this.vy = 0;
		this.a = 0;
		this.va = 0;
		this.still = 0;
		this.round = false;
		this.blood = 0;
		this.z = 0;
		this.r = Math.max(Math.abs(sx), Math.abs(sy)) * 0.5;

		const h = w.itemOf(ref).shape.hull, step = Math.max(1, Math.ceil(h.length / 14));

		this.samp = h.filter((_, i) => i % step === 0);
		if (!this.samp.length) this.samp = [{ x: 0, y: 0 }];
	}

	update(dt) {
		// Carried home: in his hands, at his side
		if (this.carrier) {
			const man = this.carrier;

			if (man.carry !== this || !man.alive()) this.carrier = null;
			else {
				Object.assign(this, { x: man.x + man.face * 10, y: man.body.j[4].y - 6, z: man.z, vx: 0, vy: 0, va: 0, still: 0 });

				return;
			}
		}
		if (this.still > 0.6) return;

		const w = this.w;

		this.vy += GRAV * dt;
		this.x += this.vx * dt;
		this.y += this.vy * dt;
		this.a += this.va * dt;
		// A smashed catapult's piece stays on the field, where someone can walk to fetch it: off its edge, it bounces back
		if (this.scrap && (this.x < SCRAP_EDGE || this.x > W - SCRAP_EDGE)) {
			this.x = clamp(this.x, SCRAP_EDGE, W - SCRAP_EDGE);
			this.vx = -this.vx * 0.3;
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
			z: Math.round(this.z),
			x: Math.round(this.x),
			y: Math.round(this.y),
			a: Math.round(this.a * 100) / 100,
			sx: Math.round(this.sx * 10) / 10,
			sy: Math.round(this.sy * 10) / 10,
			...(this.ox && { ox: this.ox }),
			c: this.fill,
			...(this.blood && { b: Math.round(this.blood * 100) / 100 }),
			...(!this.scrap && this.w.time - this.born > LINGER.prop && { f: Math.round(faded(this.w.time - this.born, LINGER.prop) * 100) / 100 }),
		};
	}
}

class Proj extends Prop {
	constructor(w, ref, x, y, vx, vy, team, z = 0) {
		const item = w.itemOf(ref);

		super(w, ref, x, y, item.radius * 2, item.radius * 2, 'ammo', 0, 2);
		Object.assign(this, { team, vx, vy, z });
		this.va = rand(-9, 9);
		this.rad = item.radius;
		this.spiky = item.spiky;
		this.mass = (item.radius / 12) ** 2 * (1 + item.spiky * 0.3);
		this.hitSet = new Set();
		this.life = 0;
		this.spent = false;
	}

	// It flies as a heavy round body among the stones (masonry.js), which knocks them about and is knocked back; here
	// it's read back each step to hit catapults and men
	step(dt) {
		const w = this.w;

		this.body ??= w.masonry.addBoulder(this.x, this.y, this.vx, this.vy, this.rad, this.mass);
		Object.assign(this, w.masonry.read(this.body));
		this.life += dt;

		// Over the top of the enemy's wall and down its far side, it drops dead there: nothing behind a wall is in reach
		const wall = w.walls[1 - this.team];

		if (this.team === 0 ? this.x > wall.x1 : this.x < wall.x0) this.dropped = true;
		if (this.dropped) {
			this.vx = 0;
			w.masonry.setSpeed(this.body, 0, Math.max(0, this.vy));
		}

		const sp = this.dropped ? 0 : Math.hypot(this.vx, this.vy), was = [this.vx, this.vy];

		for (const c of w.cats) {
			if (c.dead || c.team === this.team || this.hitSet.has(c) || sp < 120 || Math.abs(c.z - this.z) > LANE * 3) continue;
			if (Math.abs(this.x - c.x) < 52 && this.y > GROUND - 75) {
				this.hitSet.add(c);
				c.damage(sp * this.mass * 0.07);
				this.vx *= -0.3;
				this.vy *= 0.4;
				w.sound('crash');
				w.shake(4);
			}
		}
		if (sp > 130) this.hitBodies(sp);
		// What it hit took some of its speed
		if (this.vx !== was[0] || this.vy !== was[1]) w.masonry.setSpeed(this.body, this.vx, this.vy);
		if ((sp < 30 && this.y >= w.groundAt(this.x) - this.rad - 2) || this.life > 12 || this.x < -100 || this.x > W + 100) {
			this.spent = true;
			this.born = w.time;
			this.round = true;
			w.masonry.remove(this.body);
			this.body = null;
			this.va = this.vx / this.rad;
			if (this.x > -50 && this.x < W + 50) w.props.push(this);
		}
	}

	hitBodies(sp) {
		const w = this.w, r = this.rad;

		for (const s of w.stickmen) {
			// A boulder comes down a few lanes wide: it tumbles and splashes
			if (s.dead || this.hitSet.has(s) || Math.abs(s.x - this.x) > 60 || Math.abs(s.z - this.z) > LANE * 2.5) continue;

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
			if (b.kin || Math.abs(b.z - this.z) > LANE * 2.5) continue;
			for (const p of b.j) {
				if (Math.hypot(p.x - this.x, p.y - this.y) < r + 4) {
					p.px = p.x - this.vx * DT * 0.6;
					p.py = p.y - this.vy * DT * 0.6;
					b.wake();
				}
			}
			if (sp > 320 && !this.hitSet.has(b) && Math.hypot(b.anchor().x - this.x, b.anchor().y - this.y) < r + 25) {
				this.hitSet.add(b);
				w.spray(this.x, this.y, 10, this.vx / sp, -0.5, 0.5, 220, b.z);

				const bones = b.owned.map((o, i) => (o ? i : -1)).filter(i => i > 0);

				if (bones.length && Math.random() < 0.4) w.cut(b, pick(bones), this.vx * DT * 0.3);
			}
		}
		for (const p of w.props) {
			if (p !== this && Math.abs(p.z - this.z) < LANE * 2.5 && Math.hypot(p.x - this.x, p.y - this.y) < r + p.r)
				p.kick(this.vx * 0.5, -Math.abs(this.vy) * 0.3 - 100);
		}
	}

	crush(s, sp) {
		const w = this.w, e = sp * this.mass, sh = s.body.shield;
		// A shield held toward it catches a rock now and then, taking most of it (and maybe breaking)
		const caught = sh && s.body.owned[3] && Math.sign(this.vx) === -s.face && Math.random() < w.itemOf(sh.ref).stats.block;
		const dmg = e * 0.16 * (caught ? 0.3 : 1);

		if (caught) {
			sh.hp -= e * 0.16 * 0.7;
			w.sound('thud');
			w.dust(this.x, this.y, 6, 'wood', s.z);
			if (sh.hp <= 0) s.breakShield();
		}
		const fromAbove = this.vy > 150 && this.y < s.body.j[2].y;

		s.hp -= dmg;
		w.spray(this.x, this.y, 20 + dmg * 0.4, this.vx / sp, this.vy / sp - 0.6, 0.5, 200 + sp * 0.3, s.z);
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
			w.bigSplat(s.x, s.z);
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

/** How near the field's edge a smashed catapult's piece may lie: where a man can still reach it */
const SCRAP_EDGE = 40;

/** How likely each soldier is to carry a shield, when his side drew any */
const SOLDIER_SHIELDS = 0.5;

// ---------------------------------------------------------------- catapults

class Catapult {
	constructor(w, team, x, z) {
		Object.assign(this, { w, team, x, z });
		this.dir = team === 0 ? 1 : -1;
		// Where it's been told to roll to: its crew push it there
		this.goal = x;
		this.hp = 100;
		// Its pile of rocks, each one its side drew (before the battle, then during it), thrown in the order they were drawn
		this.rocks = [];
		this.cd = rand(0.5, 1.5);
		this.fireT = -1;
		this.pend = null;
		this.dead = false;
		// How far its rebuilding has come since it was smashed, 0 to 1
		this.rebuilt = 0;
		this.shk = 0;
		this.arm = CAT_REST;
		// Built from its side's beams, each in its own place, in the order they were drawn
		const a = w.artOf[team];

		this.beams = [0, 1, 2, 3].map(i => ({ k: 'beams', a, i }));
		// On its side's two drawn wheels it rolls; short of them, it sits on two of its wall's stones and stays put
		this.rolls = (w.arts[a].wheels?.length ?? 0) >= 2;
		this.wheels = [0, 1].map(i => (this.rolls ? { k: 'wheels', a, i } : w.pickArt(team, 'stones')));
		// The rock that's flying off it, between letting go and leaving the bucket
		this.flying = null;
		// The way a player has set it to fling, [vx, vy]: it fires that way by itself whenever it's ready
		this.aim = null;
	}

	// How long loading the next takes after a rock: quicker with more crew, slower for a heavy rock
	reload(rock) {
		return (RELOAD * rockThrow(rock && this.w.itemOf(rock)).reload) / (1 + 0.5 * (Math.min(Math.max(this.crew(), 1), MOST_CREW) - 1));
	}

	get ammo() {
		return this.rocks.length;
	}

	// More rocks to come: its side can still draw some
	waiting() {
		return this.w.drawnRocks[this.team] < AMMO;
	}

	geometry() {
		return catGeometry(this.x, this.dir, this.arm);
	}

	// Who's at their place crewing it now
	crew() {
		return this.w.stickmen.filter(s => s.manning(this)).length;
	}

	// Who's been told to crew it, there yet or not
	crewing() {
		return this.w.stickmen.filter(s => s.order === 'crew' && s.post === this && s.alive());
	}

	ready() {
		return !this.dead && this.cd <= 0 && this.ammo > 0 && this.fireT < 0 && this.crew() > 0;
	}

	fire(vx, vy) {
		if (!this.ready()) return false;
		this.fireT = 0;
		// A heavy rock flies shorter than it was aimed, held to what the catapult can do with it
		const k = rockThrow(this.w.itemOf(this.rocks[0])).speed;

		this.pend = holdFling(this.team, vx, vy).map(v => v * k);
		this.flying = this.rocks.shift();
		this.w.sound('launch');

		return true;
	}

	update(dt) {
		if (this.dead) return;
		// Out of rocks with none left to draw, its crew have nothing to do here: they go home, to be sent where they're wanted
		if (this.ammo <= 0 && !this.waiting() && this.fireT < 0) for (const s of this.crewing()) Object.assign(s, { order: 'idle', post: null });
		this.cd -= dt;
		this.shk = Math.max(0, this.shk - dt);
		// Rolling where it's sent, pushed by its crew (each more a little faster), never while it throws
		const crew = this.crew();

		if (this.goal !== this.x && crew > 0 && this.fireT < 0) {
			const step = CAT_ROLL * (1 + 0.4 * (crew - 1)) * dt;

			this.x = Math.abs(this.goal - this.x) <= step ? this.goal : this.x + Math.sign(this.goal - this.x) * step;
			this.rolled = (this.rolled ?? 0) + step;
		}
		// Aimed, it fires as often as it can: crewed, loaded and reloaded
		if (this.aim && this.ready()) this.fire(...this.aim);
		if (this.fireT >= 0) {
			this.fireT += dt;
			this.arm = lerp(CAT_REST, CAT_FIRE, easeIn(clamp(this.fireT / 0.16, 0, 1)));
			if (this.pend && this.fireT >= 0.13) {
				const [lx, ly] = this.geometry().launch;

				this.w.projs.push(new Proj(this.w, this.flying, lx, ly, this.pend[0], this.pend[1], this.team, this.z));
				this.pend = null;
				// One loads it, each more of its crew (up to its most) loads it faster; a heavy rock loads slower
				this.cd = this.reload(this.flying);
				this.flying = null;
			}
			if (this.fireT > 0.4) this.fireT = -1;
		} else this.arm += (CAT_REST - this.arm) * Math.min(1, dt * 2.2);
	}

	damage(d) {
		if (this.dead) return;
		this.hp -= d;
		this.shk = 0.25;
		this.w.dust(this.x, GROUND - 40, 5, 'wood', this.z);
		if (this.hp <= 0) this.wreck();
	}

	wreck() {
		this.dead = true;
		// Its pieces, flung about: to be fetched home before it's rebuilt
		this.scraps = [];
		this.returned = 0;

		const w = this.w, g = this.geometry();

		g.segs.forEach(([a, b], i) => {
			const ref = this.beams[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
			const pr = new Prop(w, ref, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, len, beamScale(w.itemOf(ref), len), 'wood');

			pr.a = Math.atan2(b[1] - a[1], b[0] - a[0]);
			pr.z = this.z;
			pr.kick(rand(-160, 160), rand(-380, -160));
			pr.scrap = this;
			w.props.push(pr);
			this.scraps.push(pr);
		});
		g.wheels.forEach(([x, y], i) => {
			const pr = new Prop(w, this.wheels[i], x, y, 26, 26, this.rolls ? 'wood' : 'stone');

			pr.round = true;
			pr.z = this.z;
			pr.kick(rand(-200, 200), rand(-300, -100));
			pr.scrap = this;
			w.props.push(pr);
			this.scraps.push(pr);
		});
		w.dust(this.x, GROUND - 40, 20, 'wood', this.z);
		w.shake(8);
		w.sound('crash');
	}

	// How far its rebuilding has come, 0 to 1: pieces home, then the hammering
	progress() {
		const total = this.scraps?.length || 1;

		return this.home() ? 0.7 + 0.3 * this.rebuilt : (0.7 * (this.returned ?? 0)) / total;
	}

	// Whether every piece of it is home, so hammering can put it together
	home() {
		return (this.returned ?? 0) >= (this.scraps?.length ?? 0);
	}

	// A piece of it carried home, set down
	bringBack(piece) {
		piece.home = true;
		piece.carrier = null;
		this.returned++;
		this.w.dust(this.x, GROUND - 8, 4, 'wood', this.z);
		this.w.sound('thud');
	}

	snapshot() {
		return {
			x: Math.round(this.x * 10) / 10,
			z: this.z,
			d: this.dir,
			t: this.team,
			// Where it's rolling to, while it's on its way, and how far it's rolled (its wheels turn with it)
			...(this.goal !== this.x && { g: Math.round(this.goal) }),
			...(this.rolled && { rd: Math.round(this.rolled) }),
			hp: Math.round(this.hp),
			n: this.ammo,
			cd: Math.round(Math.max(0, this.cd) * 10) / 10,
			rl: Math.round(this.reload(this.rocks[0] ?? this.flying) * 10) / 10,
			cr: this.crew(),
			cw: this.crewing().length,
			...(this.aim && { aim: this.aim.map(v => Math.round(v)) }),
			rp: this.w.stickmen.filter(s => s.order === 'repair' && s.post === this && s.alive()).length,
			// Rebuilding: its pieces fetched home (most of the way), then hammered together
			...(this.dead && { rb: Math.round(this.progress() * 100) / 100 }),
			arm: Math.round(this.arm * 100) / 100,
			dead: this.dead,
			shk: this.shk > 0,
			b: this.beams.map(ref => [ref.a, ref.i]),
			wh: this.wheels.map(ref => [ref.a, ref.i]),
			// On wheels (it rolls), or on stones (it doesn't)
			...(this.rolls && { rw: true }),
			...((this.flying ?? this.rocks[0]) && { l: [(this.flying ?? this.rocks[0]).a, (this.flying ?? this.rocks[0]).i] }),
			// How many rocks its side can still draw
			dr: AMMO - this.w.drawnRocks[this.team],
			// Its pile: each rock on it, the next to throw first
			p: this.rocks.map(ref => [ref.a, ref.i]),
			// Something sits in the bucket: loaded and nearly ready, or just about to fly
			ld: this.ammo > 0 && this.cd < 0.4 && (this.fireT < 0 || Boolean(this.pend)),
		};
	}
}

// ---------------------------------------------------------------- the computer's plans

/**
 * How the computer can play a battle, one picked for each. send: seconds between men sent out one at a time (behind:
 * when it has fewer); wave: seconds between groups of waveOf sent together; hold: men kept up on the wall; crew: at the
 * catapult; repairAt: stones missing before the wall's mended, by up to repairers; fire: how keen it is to shoot, a
 * second; target: 'wall' to batter the wall before men; allInAt / allInWhen ('weak', 'breach'): when everyone goes;
 * opening: men charging together the moment the battle starts.
 */
export const PLANS = {
	// Even-handed: a steady trickle of men, one at the catapult, the wall mended when it's badly hurt
	balanced: { send: [1.4, 3], behind: [0.6, 1.4], crew: 1, repairAt: 4, repairers: 2, fire: 0.3 },
	// At them, fast: men pour out, and soon everyone goes
	rush: { opening: 9, send: [0.5, 1.2], behind: [0.3, 0.7], crew: 2, repairAt: 10, repairers: 1, fire: 0.5, allInAt: 30 },
	// Behind the wall: men up on it, the catapult fully crewed, every crack mended; out once the other side's thinned
	turtle: { crew: 3, hold: 4, repairAt: 2, repairers: 3, fire: 0.45, allInWhen: 'weak', allInAt: 100 },
	// The wall first: the catapult fully crewed and battering it, everyone out together once it's breached
	siege: { crew: 3, repairAt: 4, repairers: 2, fire: 0.5, target: 'wall', allInWhen: 'breach', allInAt: 75 },
	// Gathered at home and sent in groups
	waves: { wave: [16, 24], waveOf: 4, crew: 2, repairAt: 4, repairers: 2, fire: 0.3 },
};

// ---------------------------------------------------------------- the world

export class World {
	/**
	 * @param {object} options - Options
	 * @param {Array<object>} options.arts - Each side's art: { stickmen: [...], stones: [...], ... }, by team
	 * @param {Array<number>} [options.artOf] - Whose art each side fights with (default each its own)
	 * @param {Array<boolean>} [options.auto] - Which sides the computer plays
	 * @param {Array<number>} [options.armies] - How many men each side has
	 * @param {Array<object>} [options.walls] - How big each side's wall is, { cols, rows }
	 * @param {Array<string>} [options.plans] - How the computer plays each side it plays (a key of PLANS), else picked
	 * @param {boolean} [options.arena] - A gladiators' fight: one man a side, his gear on him, in the open
	 * @param {Array<object>} [options.records] - Each gladiator's { wins, losses } in the hall, if it's one of them
	 */
	constructor({ arts, artOf = [0, 1], auto = [false, true], armies = [ARMY, ARMY], walls = [WALL, WALL], plans, arena = false, records = [] }) {
		this.arts = arts;
		// Each gladiator's record in the hall, if it's one of them: the crowd remembers
		this.records = records;
		// Two gladiators in the open, no walls, no catapults, or a war
		this.arena = arena;
		this.army = arena ? [1, 1] : armies;
		// How many rocks each side has drawn for its catapult so far
		this.drawnRocks = [0, 0];
		this.artOf = artOf;
		this.auto = auto;
		this.stickmen = [];
		this.bodies = [];
		this.props = [];
		this.projs = [];
		// Each wall's face toward home stays put; a thicker one reaches further out into the field
		this.walls = (arena ? [{ cols: 0, rows: 0 }, { cols: 0, rows: 0 }] : walls).map(({ cols, rows }, team) => {
			const home = team === 0 ? WALL_X[0] : WALL_X[1] + WALL.cols * WALL.cw, x0 = team === 0 ? home : home - cols * WALL.cw;

			return { team, x0, x1: x0 + cols * WALL.cw, cols, rows, isWall: true };
		});
		this.masonry = new Masonry({
			walls: this.walls,
			pickArt: (team, kind) => this.pickArt(team, kind),
			itemOf: ref => this.itemOf(ref),
			onBreak: (brick, at) => this.rubble(brick, at),
			onKnock: (x, y, impulse) => this.knocked(x, y, impulse),
		});
		this.knocks = 0;
		// Each side's catapult, if it was built: short of its four beams, a side has none
		this.cats = arena ? [] : CAT_X.flatMap((xs, team) => ((this.arts[artOf[team]].beams?.length ?? 0) >= 4 ? xs.map((x, at) => new Catapult(this, team, x, CAT_Z[at])) : []));
		this.spawnX = [this.walls[0].x1 + 30, this.walls[1].x0 - 30];
		this.stats = { kills: [0, 0], limbs: 0, heads: 0, blood: 0, weaponKills: {} };
		this.time = 0;
		this.slow = 0;
		this.over = null;
		this.overT = 0;
		this.events = [];
		this.shaking = 0;
		// How the computer plays each side it plays: a plan picked for the battle (or given), and its timers
		this.ai = [0, 1].map(t => {
			const plan = plans?.[t] ?? pick(Object.keys(PLANS));

			return { plan, deploy: PLANS[plan].wave ? rand(8, 14) : rand(2, 3), rock: 2, allIn: false };
		});
		this.sentAt = [-Infinity, -Infinity];
		// Every side's whole army out from the start, standing at home, one man crewing each catapult
		for (let team = 0; team < 2; team++) {
			for (let k = 0; k < this.army[team]; k++) {
				const man = new Stickman(this, team, k);

				this.stickmen.push(man);
				this.addBody(man.body);
			}

			const [first] = this.stickmen.filter(s => s.team === team);
			const [cat] = this.cats.filter(c => c.team === team);

			if (!cat) continue;
			Object.assign(first, { order: 'crew', post: cat });
			// The rocks drawn before the battle start on the catapult's pile
			(this.arts[this.artOf[team]].ammo ?? []).forEach((_, i) => this.addRock(team, i));
		}
	}

	/** One of a side's drawings of a kind, at random, as a reference to it */
	pickArt(team, kind) {
		const a = this.artOf[team], items = this.arts[a][kind];

		return { k: kind, a, i: (Math.random() * items.length) | 0 };
	}

	itemOf(ref) {
		return this.arts[ref.a][ref.k][ref.i];
	}

	// The top of whatever's at x: the ground, or stones piled there
	groundAt(x) {
		return this.masonry.groundAt(x);
	}

	// A ragdoll's joint kept out of the ground and the stones: landing on top if it came down onto them, stopped if it
	// came at them from the side
	collideJoint(p) {
		const g = this.groundAt(p.x);

		if (p.y <= g) return;
		if (p.py <= this.groundAt(p.px) + 2) {
			const vy = p.y - p.py;

			p.y = g;
			p.py = g + vy * 0.3;

			return;
		}
		p.x = p.px;
		p.y = Math.min(p.y, this.groundAt(p.x));
	}

	addBody(b) {
		this.bodies.push(b);
		if (this.bodies.length > 90) {
			const i = this.bodies.findIndex(x => !x.kin && (!x.owner || x.owner.dead));

			if (i >= 0) this.bodies.splice(i, 1);
		}
	}

	/**
	 * Some of a side's men told what to do: their body ids, the order, and for crewing or repairing, which catapult (0,
	 * its only one) or 'wall'. Only that side's own living men take it; a catapult takes no more crew than its most.
	 * @returns {number} How many took the order
	 */
	command(team, ids, order, which) {
		if (!ORDERS.includes(order) || this.over) return 0;

		const wanted = new Set(ids);
		let men = this.stickmen.filter(s => s.team === team && s.alive() && wanted.has(s.body.id));

		if (order === 'repair') {
			const post = which === 'wall' ? this.walls[team] : this.cats.filter(c => c.team === team)[which];

			if (!post) return 0;
			for (const s of men) Object.assign(s, { order, post });
			if (men.length) this.sound('thud');

			return men.length;
		}
		if (order === 'crew') {
			const cat = this.cats.filter(c => c.team === team)[which];

			if (!cat || cat.dead) return 0;

			const room = MOST_CREW - cat.crewing().filter(s => !wanted.has(s.body.id)).length;

			men = men.sort((a, b) => Math.abs(a.x - cat.x) - Math.abs(b.x - cat.x)).slice(0, Math.max(0, room));
			for (const s of men) Object.assign(s, { order, post: cat });
		} else for (const s of men) Object.assign(s, { order, post: null });
		if (men.length && (order === 'charge' || order === 'hold')) this.sound('deploy');

		return men.length;
	}

	/** Whether a wall or catapult has anything for a repairer to do */
	needsRepair(post) {
		if (post.isWall) return this.masonry.needsRepair(post.team);

		// A smashed catapult wants hammering once its pieces are home
		return post.dead ? post.home() : post.hp < 100;
	}

	/**
	 * One hammer blow at a wall or catapult: a cracked stone patched, or a new one (of the side's drawings) stacked onto
	 * the lowest broken column; a damaged catapult mended, or a smashed one rebuilt a little more, until it stands again
	 * @param {object} post - The wall or catapult
	 * @param {object} man - Who's hammering
	 */
	repair(post, man) {
		if (post.isWall) {
			const at = this.masonry.repair(post.team);

			if (at) this.dust(at.x, at.y, 3, 'stone', man.z);
		} else if (post.dead) {
			if (!post.home()) return;
			post.rebuilt += REBUILD_PER_BLOW * 2;
			if (post.rebuilt >= 1) Object.assign(post, { dead: false, rebuilt: 0, hp: 50, arm: CAT_REST, cd: RELOAD, fireT: -1, scraps: [], returned: 0 });
			this.dust(post.x, GROUND - 30, 3, 'wood', post.z);
		} else {
			post.hp = Math.min(100, post.hp + MEND_PER_BLOW);
			this.dust(post.x, GROUND - 30, 3, 'wood', post.z);
		}
		this.sound('thud');
	}

	// One man from home to the fight: the nearest the wall of those not crewing, a little apart from the last one sent
	send(team) {
		if (this.over || this.time - this.sentAt[team] < SEND_EVERY) return false;

		const wall = this.walls[team];
		const home = this.stickmen
			.filter(s => s.team === team && s.alive() && s.order === 'idle')
			.sort((a, b) => Math.abs(a.x - wall.x0) - Math.abs(b.x - wall.x0));

		if (!home.length) return false;
		this.sentAt[team] = this.time;

		return this.command(team, [home[0].body.id], 'charge') > 0;
	}

	/** A gladiator told what to do by his side, for a few seconds: charge, back off or guard */
	shout(team, name) {
		const man = this.arena && this.stickmen.find(s => s.team === team && s.alive());

		if (!man || !STANCES.includes(name)) return false;
		// The crowd has no time for one backing off
		if (name === 'back' && man.stance() !== 'back') this.crowd('boo');
		man.shout = { name, until: this.time + STANCE_FOR };

		return true;
	}

	/** A side's catapult sent rolling to x (held to where it may stand: from home to halfway): its crew push it there */
	rollCat(team, x) {
		const cat = this.cats.find(c => c.team === team);

		if (!cat || cat.dead || !cat.rolls || !Number.isFinite(x)) return false;

		const [home, far] = catRange(team);

		cat.goal = clamp(x, Math.min(home, far), Math.max(home, far));

		return true;
	}

	/** A side's catapult set to fling one way from now on (held to what it can do), or with null, to hold its fire */
	setAim(team, aim) {
		const cat = this.cats.find(c => c.team === team);

		if (!cat) return false;
		cat.aim = aim ? holdFling(team, aim[0], aim[1]) : null;

		return true;
	}

	/** A rock its side just drew (which of its ammo drawings) put on its catapult's pile, while it may draw more */
	addRock(team, i) {
		const cat = this.cats.find(c => c.team === team);

		if (!cat || this.drawnRocks[team] >= AMMO) return false;
		this.drawnRocks[team]++;
		cat.rocks.push({ k: 'ammo', a: this.artOf[team], i });

		return true;
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
		this.spray(A.x, A.y, 30, dx, dy, 0.4, 260, body.z);
		// A part cut off is dead from the moment it's cut, and remembers whose it was (for the arena's medics)
		g.deadAt = this.time;
		g.from = body;
		this.addBody(g);
		g.dropWeapon();
		body.wake();
		this.stats.limbs++;
		this.sound('sever');

		return g;
	}

	corpseHit(body, b, st, dir, hx, hy) {
		this.spray(hx, hy, 4 + st.bleed * 2, dir, -0.3, 0.4, 180, body.z);
		for (const k of BONES[b]) body.j[k].px -= dir * 1.5;
		body.wake();
		this.sound('hit');
		if (Math.random() < st.cut * 0.5) this.cut(body, b, dir * 1.5);
	}

	// A stone cracked apart: two lumps of it fly off as rubble, with dust and a crash
	rubble(brick, { x, y, a, vx, vy }) {
		for (const side of [-1, 1]) {
			const pr = new Prop(this, brick.ref, x + side * 6, y, brick.sx * 0.55, brick.sy * 0.55, 'hurt');

			pr.a = a + side * 0.5;
			pr.z = brick.loose ? brick.z : rand(0, DEPTH);
			pr.kick(vx * 0.5 + side * rand(40, 140), vy * 0.4 - rand(60, 200));
			this.props.push(pr);
		}
		this.dust(x, y, 10, 'stone', brick.loose ? brick.z : DEPTH / 2);
		this.sound('crash');
	}

	// Something knocked hard against the stones: dust, a sound, a shake (a few a step at most)
	knocked(x, y, impulse) {
		if (this.knocks++ > 3) return;
		this.dust(x, y, Math.min(10, impulse / 4), 'stone', DEPTH / 2);
		this.sound(impulse > 30 ? 'crash' : 'thud');
		this.shake(Math.min(8, impulse / 15));
	}

	// What a page plays and the server doesn't keep: blood flying, dust, sounds, a shake, a splat
	emit(event) {
		if (this.events.length < 400) this.events.push(event);
	}

	spray(x, y, n, dx, dy, spread, speed, z = 0) {
		n = Math.min(n | 0, 90);
		if (n <= 0) return;
		this.stats.blood += n;
		this.emit({ e: 'blood', x: Math.round(x), y: Math.round(y), z: Math.round(z), n, a: Math.round(Math.atan2(dy, dx) * 100) / 100, sp: spread, v: Math.round(speed) });
	}

	dust(x, y, n, color = 'stone', z = DEPTH / 2) {
		this.emit({ e: 'dust', x: Math.round(x), y: Math.round(y), z: Math.round(z), n, c: color });
	}

	bigSplat(x, z = 0) {
		this.emit({ e: 'splat', x: Math.round(x), z: Math.round(z) });
		this.spray(x, GROUND - 5, 60, 0, -1, 0.45, 380, z);
	}

	/** A gladiator beaten down: on his knees, the fight stopped, the crowd to give its thumbs up or down soon */
	yieldBy(man) {
		const winner = this.stickmen.find(s => s.team !== man.team);
		const record = this.records?.[man.team];
		// The crowd's mercy is mostly for the fight it just watched: how hard he made the winner work, and how long he
		// lasted. His record in the hall only nudges it, as does luck (MERCY_LUCK).
		const fought = winner ? 1 - clamp(winner.hp / winner.maxHp, 0, 1) : 0;
		const lasted = clamp(this.time / 30, 0, 1);
		const earned = record ? clamp((record.wins - record.losses) * 0.04, -0.12, 0.12) : 0;

		man.yielded = true;
		if (!man.incap) man.goIncap();
		man.bleed = 0;
		man.atk = null;
		// The medics run out of his gate to put him back together before he's judged: one slapping his face, the other
		// fetching every limb he lost and slapping it back on. The crowd decides once they're done and it's had its hush.
		const gate = W / 2 - (man.team === 0 ? 1 : -1) * ARENA_GATE;
		const plans = this.medicPlans(man, gate);
		const done = Math.max(...plans.map(plan => plan.at(-1).t1));

		this.mercy = {
			loser: man,
			winner,
			at: this.time,
			chance: clamp(0.05 + fought * 0.8 + lasted * 0.12 + earned, 0.03, 0.95),
			decided: false,
			torn: 0,
			gate,
			plans,
			done,
			mended: false,
			judgeAt: this.time + done + MERCY_WAIT,
		};
		this.crowd('ooh');
		this.slowmo(0.6);
	}

	/**
	 * The two medics' routes, as legs from the moment he yields: each { from, to, t0, t1, what } ('r' running, 'p' picking
	 * a limb up, 'a' slapping it on, 's' slapping his face), with the limb carried, picked up or put on (`carry`, `pick`,
	 * `attach`). The first fetches each limb he lost, nearest first, and slaps it on; the second slaps his face until the
	 * first is done.
	 */
	medicPlans(man, gate) {
		const start = { x: gate, z: DEPTH - 10 };
		const by = side => ({ x: man.x + side * 20, z: clamp(man.z + side * 6, 0, DEPTH) });
		const route = () => {
			const legs = [];
			let at = start, t = 0;
			const go = (to, what, extra = {}) => {
				const dur = what === 'r' ? Math.hypot(to.x - at.x, (to.z - at.z) * 1.5) / MEDIC_RUN : extra.dur;

				legs.push({ from: at, to, t0: t, t1: t + dur, what, ...extra });
				at = to;
				t += dur;
			};

			return { legs, go, now: () => t };
		};
		const lost = this.bodies.filter(piece => piece.from === man.body && piece.owned.some(Boolean));
		const fetcher = route(), slapper = route();

		lost.sort((a, b) => Math.abs(a.anchor().x - man.x) - Math.abs(b.anchor().x - man.x));
		for (const piece of lost) {
			fetcher.go({ x: piece.anchor().x, z: piece.z }, 'r');
			fetcher.go(fetcher.legs.at(-1).to, 'p', { dur: MEDIC_PICK, pick: piece });
			fetcher.go(by(-1), 'r', { carry: piece });
			fetcher.go(by(-1), 'a', { dur: MEDIC_ATTACH, attach: piece });
		}
		if (!lost.length) fetcher.go(by(-1), 'r');
		slapper.go(by(1), 'r');
		// Slapping his face until the other's done, two slaps at least
		while (slapper.now() < fetcher.now() || slapper.legs.filter(leg => leg.what === 's').length < 2) slapper.go(by(1), 's', { dur: MEDIC_SLAP });
		// And the one with nothing left to fetch kneels by him too, slapping, till the last slap
		while (fetcher.now() < slapper.now()) fetcher.go(by(-1), 's', { dur: Math.min(MEDIC_SLAP, slapper.now() - fetcher.now()) });

		return [fetcher.legs, slapper.legs];
	}

	// Where a medic is on his route at a moment after he set out: his leg, and how far along it
	medicLeg(plan, t) {
		const leg = plan.find(l => t < l.t1) ?? plan.at(-1);
		const k = leg.t1 > leg.t0 ? clamp((t - leg.t0) / (leg.t1 - leg.t0), 0, 1) : 1;

		return { leg, x: lerp(leg.from.x, leg.to.x, k), z: lerp(leg.from.z, leg.to.z, k) };
	}

	// The medics at work: a limb carried dangling from a hand, slapped back on when it's brought; every slap to the face a
	// jolt; and once they're done, anything still missing (a limb long gone) slapped back on too
	medicsWork() {
		const m = this.mercy, t = this.time - m.at, loser = m.loser;

		if (m.decided) return;
		m.plans.forEach(plan => {
			for (const leg of plan) {
				if (leg.fired || t < leg.t0 + (leg.what === 'p' ? 0 : 0.15)) continue;
				if (leg.what === 'a') {
					leg.fired = true;
					this.attach(loser.body, leg.attach);
					this.sound('slap');
				} else if (leg.what === 's') {
					leg.fired = true;
					this.sound('slap');
					for (const p of loser.body.j) p.px += rand(-3, 3);
					loser.body.wake();
				}
			}

			const { leg, x, z } = this.medicLeg(plan, t);

			// What he's carrying swings from his hand as he runs
			if (leg.carry && this.bodies.includes(leg.carry)) {
				const piece = leg.carry, a = piece.anchor(), hx = x + (leg.to.x >= leg.from.x ? 10 : -10), hy = GROUND - 46;

				for (const p of piece.j) {
					p.x += hx - a.x;
					p.y += hy - a.y;
					p.px = p.x;
					p.py = p.y;
				}
				piece.z = z;
			}
		});
		if (!m.mended && t >= m.done) {
			m.mended = true;
			this.mend(loser.body);
		}
	}

	// A limb slapped back on: its bones his again, laid in place from where they join him, the piece gone from the sand
	attach(body, piece) {
		if (!this.bodies.includes(piece)) return;
		for (let b = 0; b < 10; b++) if (piece.owned[b]) piece.owned[b] = false;
		this.mend(body);
	}

	// The crowd's verdict, when it's kept him waiting long enough: spared, or drawn and quartered, a limb at a time
	judgeYielded() {
		const m = this.mercy;

		if (!m || m.loser.dead) return;
		this.medicsWork();
		if (!m.decided && this.time >= m.judgeAt) {
			m.decided = true;
			m.up = Math.random() < m.chance || Math.random() < MERCY_LUCK;
			// A beat held on the verdict before anything else happens
			m.next = this.time + 1.8;
			this.emit({ e: 'verdict', up: m.up, x: Math.round(m.loser.x), z: Math.round(m.loser.z) });
			this.crowd(m.up ? 'roar' : 'kill');
			this.shake(8);
		}
		if (!m.decided || m.up || this.time < m.next) return;

		// Thumbs down: his arms and legs torn off, each flung its own way, and then he's done
		const body = m.loser.body, b = [2, 4, 6, 8][m.torn];
		const pulls = { 2: [-9, -6], 4: [9, -6], 6: [-8, 3], 8: [8, 3] };

		m.next = this.time + QUARTER_EVERY;
		if (b === undefined) {
			m.loser.die(0, 0);
			this.bigSplat(m.loser.x, m.loser.z);

			return;
		}
		m.torn++;

		const limb = this.cut(body, b, 0);

		if (limb) {
			for (const p of limb.j) {
				p.px -= pulls[b][0] * m.loser.face * rand(0.8, 1.2);
				p.py -= pulls[b][1] * rand(0.8, 1.2);
			}
			this.spray(body.j[BONES[b][0]].x, body.j[BONES[b][0]].y, 40, pulls[b][0] / 9, pulls[b][1] / 9, 0.5, 300, body.z);
			this.shake(5);
		}
		this.crowd('erupt');
	}

	/** A body put back together: every bone it lost back on it, taken off whatever piece was lying about, laid back
	 * where it belongs from its parent, its stumps closed */
	mend(body) {
		const R = body.tpl.joints, s = body.s;
		// Bones a limb still lying about (or on its way back) holds wait for it, unless the medics are done
		const held = b => !this.mercy?.mended && this.bodies.some(piece => piece !== body && piece.from === body && piece.owned[b]);

		for (let b = 0; b < 10; b++) {
			if (body.owned[b] || held(b)) continue;
			for (const piece of this.bodies) if (piece !== body && piece.from === body && piece.owned[b]) piece.owned[b] = false;
			body.owned[b] = true;

			const [pa, pb] = BONES[b];
			const x = body.j[pa].x + (R[pb].x - R[pa].x) * s * body.flip, y = body.j[pa].y + (R[pb].y - R[pa].y) * s;

			Object.assign(body.j[pb], { x, y, px: x, py: y });
		}
		this.bodies = this.bodies.filter(piece => piece === body || piece.owned.some(Boolean));
		body.stumps = [];
		this.dust(body.j[2].x, body.j[2].y, 10, 'sand', body.z);
	}

	/**
	 * Where the two medics are: running out of his gate to him, kneeling either side of him slapping, standing back while
	 * the crowd decides, and running back in once it has (fleeing, on a thumbs down). Each [x, z, what, facing]: what is
	 * 'r' running, 's' slapping, 'w' waiting.
	 */
	medics() {
		const m = this.mercy, t = this.time - m.at, loser = m.loser;

		return m.plans.map(plan => {
			const { leg, x, z } = this.medicLeg(plan, Math.min(t, m.done));
			let at = { x, z }, what = leg.what === 'a' || leg.what === 's' ? 's' : leg.what === 'p' ? 's' : 'r', face = (leg.what === 'r' ? leg.to.x >= leg.from.x : loser.x >= x) ? 1 : -1;

			// Done: a step back from him, standing by while the crowd decides
			if (!m.decided && t >= m.done) {
				what = 'w';
				at = { x: loser.x + Math.sign(x - loser.x || 1) * lerp(20, 44, clamp((t - m.done) / 0.35, 0, 1)), z };
			}
			if (m.decided) {
				// Back in through the gate, faster than they came on a thumbs down
				const out = { x: m.gate, z: DEPTH - 10 };
				const from = { x: loser.x + Math.sign(x - loser.x || 1) * 44, z };
				const away = Math.max(1, Math.hypot(out.x - from.x, (out.z - from.z) * 1.5));
				const k = clamp(((this.time - m.judgeAt) * (m.up ? 1 : 1.8) * MEDIC_RUN) / away, 0, 1);

				at = { x: lerp(from.x, out.x, k), z: lerp(from.z, out.z, k) };
				what = k < 1 ? 'r' : 'w';
				face = out.x >= x ? 1 : -1;
			}

			return [Math.round(at.x), Math.round(at.z), what, face];
		});
	}

	/**
	 * The arena's crowd gasping, booing, roaring, baying for blood or erupting (in a war there's nobody watching): heard,
	 * and seen in the stands. One reaction a moment, the biggest: a limb flying off drowns out a gasp at the blow.
	 */
	crowd(kind) {
		if (!this.arena) return;

		const was = this.events.find(event => event.e === 'crowd');

		if (!was) this.emit({ e: 'crowd', n: kind });
		else if (CROWD_LOUDNESS.indexOf(kind) > CROWD_LOUDNESS.indexOf(was.n)) was.n = kind;
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
	// A kill for a weapon, by its drawing (whose art, which)
	creditKill(ref) {
		const key = `${ref.a}:${ref.i}`;

		this.stats.weaponKills[key] = (this.stats.weaponKills[key] ?? 0) + 1;
	}

	takeEvents() {
		const events = this.events;

		if (this.shaking > 0.3) events.push({ e: 'shake', v: Math.round(this.shaking * 10) / 10 });
		this.events = [];
		this.shaking = 0;

		return events;
	}

	step(dt) {
		this.time += dt;
		this.knocks = 0;
		this.masonry.step(dt, this.time);
		for (const s of this.stickmen) s.update(dt);
		this.stickmen = this.stickmen.filter(s => !s.dead);
		this.separate(dt);
		for (const b of this.bodies) b.update(dt);
		// Empty bodies, and the dead once they've faded, are gone
		this.bodies = this.bodies.filter(b => !b.empty() && !(b.deadAt !== undefined && this.time - b.deadAt > LINGER.body + FADE));
		for (const c of this.cats) c.update(dt);
		for (const p of this.projs) p.step(dt);
		this.projs = this.projs.filter(p => !p.spent);
		for (const p of this.props) p.update(dt);
		// A smashed catapult's pieces lie until they're fetched home (or it's rebuilt); everything else fades and goes
		this.props = this.props.filter(p => (p.scrap ? p.scrap.dead && !p.home : this.time - p.born < LINGER.prop + FADE));
		if (this.props.length > 140) this.props.splice(0, this.props.length - 140);
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

				const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz * 1.5);

				// Too close: nudged apart, mostly across the field, so a crowd spreads out instead of stacking up
				if (d < 14) {
					const along = (dx >= 0 ? 1 : -1) * 12 * dt;
					const across = (dz >= 0 ? 1 : -1) * 30 * dt;

					a.x -= along;
					b.x += along;
					a.z = clamp(a.z - across, 0, DEPTH);
					b.z = clamp(b.z + across, 0, DEPTH);
				}
			}
		}
	}

	runAI(dt) {
		// The computer shouts at its own gladiator too: in when its foe's hurt worse, back or guard when it's the one hurting
		if (this.arena) {
			for (let t = 0; t < 2; t++) {
				const me = this.stickmen.find(s => s.team === t), foe = this.stickmen.find(s => s.team !== t);

				if (!this.auto[t] || this.over || !me?.alive() || !foe || me.stance() || Math.random() > dt * 0.5) continue;

				const ahead = me.hp - foe.hp;

				this.shout(t, ahead > 60 ? 'charge' : ahead < -60 ? pick(['back', 'guard']) : pick(STANCES));
			}

			return;
		}
		for (let t = 0; t < 2; t++) {
			if (!this.auto[t] || this.over) continue;

			const ai = this.ai[t], plan = PLANS[ai.plan];
			const alive = this.stickmen.filter(s => s.team === t && s.alive());
			const idle = () => this.stickmen.filter(s => s.team === t && s.alive() && s.order === 'idle');
			const theirs = this.aliveCount(1 - t);
			const ids = men => men.map(s => s.body.id);

			// The computer draws its rocks too, one every few seconds, from its own drawings
			ai.rock -= dt;
			if (ai.rock <= 0) {
				const drawn = this.arts[this.artOf[t]].ammo?.length ?? 0;

				if (drawn) this.addRock(t, (Math.random() * drawn) | 0);
				ai.rock = rand(3, 6);
			}

			if (plan.opening && !ai.opened && this.time > 1) {
				ai.opened = true;
				this.command(t, ids(idle().slice(0, plan.opening)), 'charge');
			}

			ai.deploy -= dt;
			// Men out: one at a time (faster when it's behind), or a group at a time
			if (ai.deploy <= 0 && (plan.send || ai.allIn)) {
				this.send(t);
				ai.deploy = ai.allIn ? rand(0.5, 1.2) : rand(...(theirs > alive.length ? plan.behind : plan.send));
			} else if (ai.deploy <= 0 && plan.wave) {
				this.command(t, ids(idle().slice(0, plan.waveOf)), 'charge');
				ai.deploy = rand(...plan.wave);
			}

			// Everyone out at last: when its time comes, the other side's thinned, or the wall it's been battering is down
			if (
				!ai.allIn &&
				((plan.allInAt && this.time > plan.allInAt) ||
					(plan.allInWhen === 'weak' && this.time > 20 && theirs <= alive.length * 0.6) ||
					(plan.allInWhen === 'breach' && this.masonry.missing(1 - t) >= 6))
			) {
				ai.allIn = true;
				this.command(t, ids(alive.filter(s => s.order === 'idle' || s.order === 'hold')), 'charge');
			}

			// Down to its last few with nobody fighting, everyone goes: a battle must end
			if (alive.length <= 3 && !alive.some(s => s.order === 'charge')) this.command(t, ids(alive), 'charge');

			// Men up on the wall, as many as it keeps there
			if (!ai.allIn && plan.hold && alive.filter(s => s.order === 'hold').length < plan.hold && idle().length > 2) this.command(t, ids(idle().slice(0, 1)), 'hold');

			// A wall knocked about, or a catapult smashed while it still had rocks, gets someone from home to fix it
			const repairing = alive.filter(s => s.order === 'repair').length;
			const cat = this.cats.find(c => c.team === t);
			const broken = this.masonry.missing(t) >= plan.repairAt ? 'wall' : cat?.dead && (cat.ammo > 0 || cat.waiting()) ? 0 : -1;

			if (broken !== -1 && repairing < plan.repairers && idle().length > 2) this.command(t, ids(idle().slice(0, 1)), 'repair', broken);

			// The catapult kept crewed, as fully as it likes, while it has rocks or more to come
			if (cat && !cat.dead && (cat.ammo > 0 || cat.waiting()) && cat.crewing().length < plan.crew && idle().length) {
				this.command(t, ids(idle().slice(0, 1)), 'crew', 0);
			}
			if (cat?.ready() && Math.random() < dt * plan.fire) {
				const tgt = plan.target === 'wall' ? (this.wallTarget(t) ?? this.aiTarget(t)) : (this.aiTarget(t) ?? this.wallTarget(t));
				const v = tgt && this.solve(cat, tgt.x, tgt.y);

				if (v) cat.fire(v[0] * rand(0.85, 1.15), v[1] * rand(0.9, 1.1));
			}
		}
	}

	// The face of the other side's wall, where it still stands: what a siege batters
	wallTarget(t) {
		if (!this.masonry.standing(1 - t).length) return null;

		const x = t === 0 ? this.walls[1].x0 + 15 : this.walls[0].x1 - 15;

		return { x, y: this.groundAt(x) + 15 };
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

		for (const th of [0.95, 0.8, 1.1, 0.65, 1.18]) {
			const cs = Math.cos(th), den = 2 * cs * cs * (dy + dx * Math.tan(th));

			if (den <= 0) continue;

			const v = Math.sqrt((GRAV * dx * dx) / den);

			if (v < MOST_FLING) return [v * cs * sgn, -v * Math.sin(th)];
		}

		return null;
	}

	fighting(t) {
		return this.stickmen.filter(s => s.team === t && s.alive() && (s.order === 'charge' || s.order === 'hold')).length;
	}

	aliveCount(t) {
		return this.stickmen.filter(s => s.team === t && s.alive()).length;
	}

	checkOver(dt) {
		if (this.over) {
			this.overT += dt;

			return;
		}

		// A duel with one yielded ends on the crowd's verdict: spared, or once he's been torn apart
		const m = this.mercy;

		if (this.arena && m) {
			this.judgeYielded();
			// Over once he's spared or torn apart (or, somehow, dead before the crowd had its say): either way, a kill for
			// the winner's weapon
			if ((m.decided && m.up) || m.loser.dead) {
				this.over = { winner: m.winner.team, spared: Boolean(m.decided && m.up) };
				if (m.winner.body.weapon?.ref) this.creditKill(m.winner.body.weapon.ref);
			}

			return;
		}

		// In the arena one down hasn't lost yet: he yields first, and the crowd decides
		const left = t => (this.arena ? this.stickmen.filter(s => s.team === t && !s.dead).length : this.aliveCount(t));
		const a = left(0), b = left(1);

		if (a === 0 || b === 0) {
			this.over = { winner: a === 0 && b === 0 ? -1 : a === 0 ? 1 : 0 };
			this.slowmo(1.2);
		}
	}

	/** The battle as every page draws it, small enough to send many times a second */
	snapshot() {
		return {
			time: Math.round(this.time * 100) / 100,
			...(this.arena && { arena: true }),
			// A yielded gladiator: where he kneels, and once it's given, the crowd's thumbs up or down
			...(this.mercy && {
				mercy: {
					x: Math.round(this.mercy.loser.x),
					z: Math.round(this.mercy.loser.z),
					// Done putting him back together, and the crowd's hush begun
					...(this.time >= this.mercy.at + this.mercy.done && { ready: true }),
					...(this.mercy.decided && { up: this.mercy.up }),
					medics: this.medics(),
				},
			}),
			bodies: this.bodies.map(b => b.snapshot()),
			props: this.props.map(p => p.snapshot()),
			projs: this.projs.map(p => p.snapshot()),
			cats: this.cats.map(c => c.snapshot()),
			walls: this.walls.map(wl => ({
				x0: wl.x0,
				x1: wl.x1,
				team: wl.team,
				rp: this.stickmen.filter(s => s.order === 'repair' && s.post === wl && s.alive()).length,
			})),
			// Every stone: [id, team, art side, art index, x, y, angle, health, x scale, y scale, depth if loose else -1, cracks]
			bricks: this.masonry.snapshot(),
			fighting: [this.fighting(0), this.fighting(1)],
			army: [this.aliveCount(0), this.aliveCount(1)],
			kills: [...this.stats.kills],
		};
	}
}
