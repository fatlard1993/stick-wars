import { Component, styled } from '@vanilla-bean/components';
import { act, createInput } from '@fatlard1993/web-game-framework/client';
import { Stage } from '@fatlard1993/web-game-framework/ui';

import { TAU, clamp, lerp, pick, rand, segDist } from '../art.js';
import {
	DEPTH,
	GRAV,
	GROUND,
	H,
	MOST_CREW,
	SKEW_X,
	SKEW_Y,
	W,
	WALL,
	beamScale,
	catGeometry,
	depthScale,
	flingAngle,
	flingFor,
	flingPath,
	project,
	rockThrow,
} from '../field.js';
import { TEAMS, TICK_MS } from '../rules.js';
import AimPad from './AimPad.js';
import { shelf } from './armoryPicks.js';
import RockPad from './RockPad.js';
import { drawIcon, icon } from './icons.js';
import {
	ARENA_ROWS,
	ARENA_STANDS,
	ARENA_WALL,
	FILLS,
	GORE,
	INK,
	WOOD_INK,
	arenaBackground,
	drawBlade,
	drawBody,
	mixColor,
	paperBackground,
	placeShape,
	teamInk,
} from './paint.js';
import { HAND, PENCIL, RED_PENCIL } from './theme.js';
import { count, doodle } from './ui.js';

const DUST = { stone: '#9b9488', wood: '#b98a55', sand: '#d2b77c' };
// A full-strength fling is a drag this long on the screen, in CSS pixels, whatever the screen's size
const FULL_PULL = 130;
// How far a press may wander and still be a tap, in screen pixels
const TAP = 8;
// The wall's thickness is drawn as this many layers of its stones, back to front
const WALL_LAYERS = 6;
// The height map's step, in world units
const BUCKET = 4;
// How much of the world the camera always shows, from the sky over the arcs down to the bottom of the page
const VIEW_TOP = GROUND - 330;
// The smallest a stick man is let be drawn before the camera zooms in: about this many screen pixels per world unit
const READABLE = 0.62;
// How much of the field's length an upright phone's main view spans: a base and its wall, and some field
const UPRIGHT_SPAN = 360;
// Where an upright phone's view starts along the field (mirrored for green): over the army at home, its wall beside it
const UPRIGHT_HOME = 330;
// How far a pinch or the wheel zooms in, past the readable view
const MOST_ZOOM = 2.4;
// How much of the field a gladiators' fight shows across, on a wide screen and on an upright phone: the two of them, close
const ARENA_SPAN = 640, ARENA_SPAN_UPRIGHT = 290;
// Armor's ink
const STEEL = '#59656e';

const Screen = styled(
	Component,
	() => `
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		color: ${PENCIL};
	`,
);

const Controls = styled(
	Component,
	({ space }) => `
		display: flex;
		justify-content: center;
		align-items: center;
		flex-wrap: wrap;
		gap: ${space.md};
		padding: ${space.sm};

		& .picked { display: inline-flex; align-items: center; gap: 4px; font-size: 1.4em; min-width: 3em; }
		& .gap { width: ${space.lg}; }

		/* On a phone: all of them in one row, small enough for thumbs and the field both */
		@media (max-width: 767px), (max-height: 500px) {
			gap: 4px;
			padding: 4px;
			flex-wrap: nowrap;
			& button { padding: 3px 6px; }
			& button svg { width: 1.5em !important; height: 1.5em !important; }
			& .picked { font-size: 1.1em; min-width: 2em; }
			& .gap { width: 2px; }
		}
		&.shouts { gap: ${space.lg}; padding: ${space.sm}; }
		&.shouts button { padding: 8px 22px !important; }
		&.shouts button svg { width: 2.4em !important; height: 2.4em !important; }
	`,
);

const Card = styled(
	Component,
	({ space }) => `
		position: absolute;
		left: 50%;
		top: 40%;
		transform: translate(-50%, -50%) rotate(-1deg);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: ${space.md};
		padding: ${space.lg} ${space.xl};
		background: #fffdf6;
		border: 3px solid ${PENCIL};
		border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
		box-shadow: 4px 6px 0 ${PENCIL};
		font-size: 1.4em;
		text-align: center;

		&:empty { display: none; }
		& .row { display: flex; gap: ${space.lg}; flex-wrap: wrap; justify-content: center; align-items: center; }
	`,
);

// Each snapshot drawn a tick late, eased from the one before, so twenty pictures a second move like sixty
const ease = (prev, cur, t, key = 'id') => {
	if (!prev) return cur;

	const before = new Map(prev.map(item => [item[key], item]));

	return cur.map(item => {
		const was = before.get(item[key]);

		if (!was) return item;
		if (item.j) return { ...item, z: lerp(was.z ?? item.z, item.z, t), j: item.j.map((v, i) => lerp(was.j[i] ?? v, v, t)) };

		return { ...item, x: lerp(was.x, item.x, t), y: lerp(was.y, item.y, t), a: lerp(was.a, item.a, t) };
	});
};

// Stones as the snapshot sends them, eased the same way: [id, team, side, index, x, y, angle, health, sx, sy, z, cracks]
const easeBricks = (prev, cur, t) => {
	if (!prev) return cur;

	const before = new Map(prev.map(brick => [brick[0], brick]));

	return cur.map(brick => {
		const was = before.get(brick[0]);

		if (!was) return brick;

		const out = brick.slice();

		out[4] = lerp(was[4], brick[4], t);
		out[5] = lerp(was[5], brick[5], t);
		out[6] = lerp(was[6], brick[6], t);

		return out;
	});
};

// A thing standing at depth z drawn by fn in its own world coordinates: slid back up the field, shrunk with distance
// about its ground point at x
const atDepth = (g, x, z, fn) => {
	const [px, py] = project(x, GROUND, z);
	const k = depthScale(z);

	g.save();
	g.translate(px, py);
	g.scale(k, k);
	g.translate(-x, -GROUND);
	fn();
	g.restore();
};

// The battle as every page sees it, and for the two who play it, their army to command: pick men out by tapping them
// or dragging a box, then send them to fight, hold the wall, go home, crew a catapult or repair one (or the wall); drag
// from a catapult to fling
export default class BattleScreen extends Screen {
	build() {
		super.build();
		this.parts = [];
		this.shake = 0;
		this.battles = -1;
		this.prev = null;
		this.cur = null;
		this.curAt = 0;
		this.aim = null;
		this.box = null;
		this.press = null;
		this.flash = null;
		this.mode = null;
		this.selected = new Set();
		// Our catapult picked out (as which of ours, 0): the aiming pad shows while it is
		this.catsPicked = new Set();
		this.padAim = null;
		this.tops = new Float32Array(Math.ceil(W / BUCKET) + 1).fill(GROUND);

		this.stage = new Stage({ appendTo: this });
		// The camera: where along the field it looks (null until placed over our side), and how far zoomed in
		this.cam = { x: null, zoom: 1 };
		this.lookAround();
		this.card = new Card({ appendTo: this });
		this.decal = document.createElement('canvas');
		this.decal.width = W;
		this.decal.height = H;

		let last = performance.now();
		const run = now => {
			const dt = Math.min(0.1, (now - last) / 1000);

			last = now;
			this.paint(dt);
			this.frame = requestAnimationFrame(run);
		};

		this.frame = requestAnimationFrame(run);
		this.addCleanup('frame', () => cancelAnimationFrame(this.frame));
	}

	// The controls, once it's known whether this page plays a side
	arm(team) {
		if (this.armed !== undefined) return;
		this.armed = team;
		if (team < 0) return;
		if (this.arena) return this.armShouts();

		const controls = new Controls({ appendTo: this });

		this.pad = new AimPad({
			appendTo: this,
			onAim: v => (this.padAim = v),
			onFire: v => this.setAim(v),
			onHold: () => act('aim', { hold: true }, { quiet: true }),
			onClose: () => this.dropCats(),
		});
		this.rockPad = new RockPad({ appendTo: this, onOpen: () => this.dropCats() });
		// The rock pad sits in the field's corner, over the controls
		this.controlsSizer = new ResizeObserver(() => this.elem.style.setProperty('--controls', `${controls.elem.offsetHeight}px`));
		this.controlsSizer.observe(controls.elem);
		this.addCleanup('controlsSizer', () => this.controlsSizer.disconnect());

		this.picked = document.createElement('span');
		this.picked.className = 'picked';
		this.crewButton = doodle('catapult', { title: 'Crew a catapult: then tap it', size: '2em', onPress: () => this.choose('crew') });
		this.repairButton = doodle('hammer', { title: 'Repair: then tap a catapult or the wall', size: '2em', onPress: () => this.choose('repair') });
		controls.elem.append(this.picked);
		controls.append(
			doodle('all', { title: 'Pick out everyone (A)', size: '2em', onPress: () => this.selectAll() }),
			new Component({ addClass: 'gap' }),
			doodle('charge', { title: 'Charge (Space)', size: '2em', onPress: () => this.order('charge') }),
			doodle('hold', { title: 'Hold the wall (H)', size: '2em', onPress: () => this.order('hold') }),
			doodle('base', { title: 'Go home (B)', size: '2em', onPress: () => this.order('idle') }),
			this.crewButton,
			this.repairButton,
		);
		this.input = createInput({
			keys: {
				charge: [' '],
				hold: ['h', 'H'],
				idle: ['b', 'B'],
				all: ['a', 'A'],
				crew: ['c', 'C'],
				repair: ['r', 'R'],
				none: ['Escape'],
				rock: ['d', 'D'],
				keep: ['Enter'],
				aim: ['t', 'T'],
			},
			onPress: name => {
				if (name === 'aim') this.pickCat(0);
				else if (name === 'rock') this.rockPad.toggle();
				else if (name === 'keep') this.rockPad.keep();
				else if (name === 'all') this.selectAll();
				else if (name === 'none') this.letGo();
				else if (name === 'crew' || name === 'repair') this.choose(name);
				else this.order(name);
			},
		});
		this.input.pointer(this.stage.elem, {
			onDown: point => this.down(point),
			onMove: point => this.move(point),
			onUp: point => this.up(point),
		});
		this.addCleanup('input', () => this.input.destroy());
		this.showPicked();
	}

	// A gladiator's player cheers him on: charge, back off, or shield up, each for a few seconds
	armShouts() {
		// Three buttons, the player's whole game: full size, even on a phone
		const controls = new Controls({ appendTo: this, addClass: 'shouts' });
		const shout = stance => act('shout', { stance }, { quiet: true });

		this.shoutButtons = {
			c: doodle('charge', { title: 'Charge! (Space)', size: '2.4em', onPress: () => shout('charge') }),
			b: doodle('back', { title: 'Back off (B)', size: '2.4em', onPress: () => shout('back') }),
			g: doodle('hold', { title: 'Shield up (H)', size: '2.4em', onPress: () => shout('guard') }),
		};
		controls.append(...Object.values(this.shoutButtons));
		this.input = createInput({
			keys: { charge: [' '], back: ['b', 'B'], guard: ['h', 'H'] },
			onPress: name => shout(name),
		});
		this.addCleanup('input', () => this.input.destroy());
	}

	// Who an order is for: the men picked out, or with nobody picked, everyone not busy at a catapult or the wall
	orderedIds() {
		if (this.selected.size) return [...this.selected];

		return this.myUnits()
			.filter(body => body.u !== 'w' && body.u !== 'r')
			.map(body => body.id);
	}

	order(order, which) {
		const ids = this.orderedIds();

		this.mode = null;
		this.showPicked();
		if (!ids.length) return this.say('empty', this.team === 0 ? 300 : W - 300, GROUND - 220, RED_PENCIL);
		act('order', { ids, order, which }, { quiet: true }).then(said => {
			if (said.ok) return;

			const cat = typeof which === 'number' ? this.myCats()[which]?.cat : null;

			this.say('empty', cat ? cat.x : W / 2, GROUND - 220, RED_PENCIL);
		});
		if (order !== 'hold' && order !== 'idle') this.selected.clear();
		this.showPicked();
	}

	// Crewing or repairing waits for its target: the next tap on a catapult (or, for repairs, the wall)
	choose(mode) {
		this.mode = this.mode === mode ? null : mode;
		this.showPicked();
	}

	letGo() {
		this.selected.clear();
		this.mode = null;
		this.dropCats();
		this.showPicked();
	}

	// A catapult picked out, or put back down if it was
	pickCat(which) {
		if (this.catsPicked.has(which)) this.catsPicked.delete(which);
		else this.catsPicked.add(which);
		if (this.catsPicked.size) this.rockPad?.toggle(false);
		this.showPad();
	}

	dropCats() {
		this.catsPicked.clear();
		this.padAim = null;
		this.showPad();
	}

	// The aiming pad while our catapult is picked and still stands, saying whether it's aimed
	showPad() {
		if (!this.pad) return;

		const cats = this.myCats().filter(({ which, cat }) => this.catsPicked.has(which) && !cat.dead);

		for (const which of [...this.catsPicked]) if (!cats.some(entry => entry.which === which)) this.catsPicked.delete(which);
		this.pad.show(cats.length, Boolean(cats[0]?.cat.aim), teamInk(this.team), this.team);
	}

	// Our catapult aimed the way the pad (or a drag from it) was pulled: from now on it fires that way by itself whenever
	// it can. What would stop it is said over it: no ammo, or nobody crewing it.
	setAim([vx, vy]) {
		const cat = this.myCats()[0]?.cat;

		act('aim', { vx, vy }, { quiet: true }).then(said => {
			if (!said.ok || !cat) return;
			if (cat.n <= 0) this.say(cat.dr > 0 ? 'rock' : 'empty', cat.x, GROUND - 210, RED_PENCIL);
			else if (!cat.cr) this.say('person', cat.x, GROUND - 210, RED_PENCIL);
			else this.say('target', cat.x, GROUND - 210, teamInk(this.team));
		});
	}

	showPicked() {
		if (!this.picked) return;
		this.picked.replaceChildren(icon('person', { size: '1.2em' }), this.selected.size ? String(this.selected.size) : 'all');
		this.crewButton.elem.setAttribute('aria-pressed', String(this.mode === 'crew'));
		this.repairButton.elem.setAttribute('aria-pressed', String(this.mode === 'repair'));
	}

	myUnits() {
		return (this.cur?.bodies ?? []).filter(body => body.t === this.team && body.u);
	}

	selectAll() {
		this.selected = new Set(this.myUnits().map(body => body.id));
		this.showPicked();
	}

	/**
	 * What the server says now
	 * @param {object} view - The game's view
	 * @param {object} me - { team, sound, art }
	 */
	update(view, { team, sound, art }) {
		this.team = team;
		this.sound = sound;
		this.art = art;
		this.view = view;
		// A gladiators' fight: only watched, nothing to order; the stands filled with the stick men players have drawn
		this.arena = view.state.style === 'gladiator';
		if (this.arena && !this.crowdAsked) {
			this.crowdAsked = true;
			shelf('crowd', 'loved', 40).then(list => this.seatCrowd(list)).catch(() => {});
		}
		this.arm(team);

		const { state, battle } = view;

		if (state.battles !== this.battles) {
			this.battles = state.battles;
			this.decal.getContext('2d').clearRect(0, 0, W, H);
			this.parts = [];
			this.prev = null;
			this.cur = null;
			this.letGo();
		}
		if (battle) {
			// A view sent after an action carries the same picture: it isn't a new tick
			if (!this.cur || battle.time !== this.cur.time) {
				this.prev = this.cur;
				this.curAt = performance.now();
			}
			this.cur = battle;
			this.measure(battle.bricks);

			// The dead can't be picked
			const alive = new Set(this.myUnits().map(body => body.id));
			const before = this.selected.size;

			for (const id of this.selected) if (!alive.has(id)) this.selected.delete(id);
			if (this.selected.size !== before) this.showPicked();
			if (this.catsPicked.size) this.showPad();
			// The shout our gladiator is acting on, pressed in
			if (this.shoutButtons) {
				const mine = battle.bodies.find(body => body.t === this.team && body.hp !== undefined);

				for (const [code, button] of Object.entries(this.shoutButtons)) button.elem.setAttribute('aria-pressed', String(mine?.cs === code));
			}

			const mine = this.myCats()[0]?.cat;

			if (this.rockPad && mine) {
				this.rockPad.sound = sound;
				this.rockPad.show(mine.dr ?? 0, !mine.n, this.team);
			}
		}
		for (const event of view.events ?? []) this.play(event);
		this.showCard(view);
	}

	// Where the top of the stones is, along the field: for blood to land on, and a fling's path to stop at
	measure(bricks) {
		this.tops.fill(GROUND);
		for (const brick of bricks ?? []) {
			const x = brick[4], top = brick[5] - WALL.ch / 2;
			const from = clamp(Math.floor((x - WALL.cw / 2) / BUCKET), 0, this.tops.length - 1);
			const to = clamp(Math.ceil((x + WALL.cw / 2) / BUCKET), 0, this.tops.length - 1);

			for (let i = from; i <= to; i++) if (top < this.tops[i]) this.tops[i] = top;
		}
	}

	groundAt(x) {
		return this.tops[clamp(Math.round(x / BUCKET), 0, this.tops.length - 1)];
	}

	play(event) {
		const z = event.z ?? 0;

		if (event.e === 'blood') {
			for (let i = 0; i < event.n; i++) {
				const a = event.a + rand(-event.sp, event.sp) * Math.PI, v = event.v * rand(0.3, 1.2);

				this.parts.push({ x: event.x, y: event.y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: rand(1.5, 3.6), blood: true, life: 3 });
			}
		} else if (event.e === 'dust') {
			for (let i = 0; i < event.n; i++) {
				const a = rand(0, TAU), v = rand(20, 140);

				this.parts.push({ x: event.x, y: event.y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, s: rand(2, 5), life: rand(0.4, 0.9), c: DUST[event.c] ?? DUST.stone });
			}
		} else if (event.e === 'splat') {
			for (let i = 0; i < 30; i++) this.splat(event.x + rand(-40, 40), clamp(z + rand(-12, 12), 0, DEPTH), rand(2, 6));
		} else if (event.e === 'sound') this.sound?.play(event.n);
		else if (event.e === 'crowd') {
			// The stands react: up on their feet for a roar or a gasp, arms down and swaying for a boo; everyday reactions
			// under the fight, a limb flying off as loud as it gets
			this.cheer = { kind: event.n, at: performance.now() };
			this.sound?.play(event.n, { volume: event.n === 'erupt' ? 1 : event.n === 'ooh' || event.n === 'boo' ? 0.45 : 0.6 });
		}
		else if (event.e === 'shake') this.shake = Math.min(14, this.shake + event.v);
		if (this.parts.length > 3000) this.parts.splice(0, this.parts.length - 3000);
	}

	// A pool of blood on the field, where it landed
	splat(x, z, s) {
		const g = this.decal.getContext('2d');
		const [px, py] = project(x, GROUND, z);

		g.fillStyle = `rgba(${(110 + Math.random() * 60) | 0},0,0,0.85)`;
		g.beginPath();
		g.ellipse(px, py - rand(0, 1.5), s * rand(1.2, 3), s * rand(0.4, 0.9), 0, 0, TAU);
		g.fill();
	}

	// Over the field: who a paused battle waits for, or how a finished one went and what next
	showCard(view) {
		const { state } = view;
		const key = `${state.phase}|${view.away.join()}|${state.battles}`;

		if (key === this.shown) return;
		this.shown = key;
		this.card.elem.replaceChildren();

		const row = (...items) => {
			const div = document.createElement('div');

			div.className = 'row';
			div.append(...items.map(item => item?.elem ?? item));

			return div;
		};

		if (state.phase === 'battle' && view.away.length) {
			this.card.elem.append(
				icon('pause', { size: '3em' }),
				// Who it's waiting for: their flag, and an hourglass
				row(...view.away.map(t => icon('flag', { size: '1.6em', color: TEAMS[t].ink })), icon('hourglass', { size: '1.6em' })),
			);

			return;
		}
		if (state.phase !== 'over' || !state.result) return;

		const { winner, stats, spared } = state.result;
		const mine = this.team >= 0;
		const won = winner === this.team;
		let big;

		if (winner < 0) big = icon('skull', { size: '4em' });
		else if (mine && !won) big = icon('skull', { size: '4em', color: RED_PENCIL });
		else big = icon('trophy', { size: '4em', color: TEAMS[winner].ink });

		let words = `${TEAMS[winner]?.name} wins`;

		if (winner < 0) words = 'Nobody is left standing';
		else if (mine) words = won ? 'Victory!' : 'Defeat';
		if (mine) this.sound?.play(won ? 'win' : 'lose');
		this.card.elem.append(
			big,
			Object.assign(document.createElement('div'), { textContent: words }),
			// A gladiator who's won enough: its name
			...(view.fame?.[winner]?.name ? [Object.assign(document.createElement('div'), { textContent: view.fame[winner].name, style: `color: ${TEAMS[winner].ink}` })] : []),
			// A duel's loser: spared by the crowd, or not
			...(spared === undefined ? [] : [icon(spared ? 'thumbUp' : 'thumbDown', { size: '2.6em', color: spared ? '#2f7a3a' : RED_PENCIL })]),
			row(count('sword', stats.kills[0], TEAMS[0].ink), count('sword', stats.kills[1], TEAMS[1].ink)),
			row(count('bone', stats.limbs), count('skull', stats.heads), count('blood', `${(stats.blood * 0.004).toFixed(1)} L`, GORE)),
		);
		if (mine)
			this.card.elem.append(
				row(
					doodle('again', { title: 'Again, same armies', size: '2em', onPress: () => act('again') }),
					doodle('redraw', { title: 'Draw new armies', size: '2em', onPress: () => act('redraw') }),
				),
			);
	}

	// How the world sits on the stage. A big screen shows all of it; a small one (a phone) is zoomed in so the men stay
	// readable, showing the field and the sky the catapults' arcs need, and the camera pans along the field. The bottom of
	// the page sits at the stage's bottom.
	fitting() {
		const { width, height } = this.stage;

		if (!width || !height) return null;

		// A phone held upright: the whole field in a strip across the top, and under it a main view filling the rest,
		// all of the world's height (the sky the arcs need) in it
		const upright = height > width * 1.15 && width < 900;
		const overview = upright && !this.arena ? { scale: width / W, top: VIEW_TOP + 40, h: Math.round(((H - VIEW_TOP - 40) * width) / W) } : null;
		const mainTop = overview ? overview.h : 0;
		const mainHeight = height - mainTop;
		const fit = Math.min(width / W, mainHeight / H);
		// Upright, the main view crops the sky like the side-on view does, zoomed in as far as still shows a base and its
		// wall across (UPRIGHT_SPAN of the field); what's left over above is sky for the arcs
		// A gladiators' fight is seen close up, zoomed out only as far as keeps both of them in sight
		const fighters = this.arena ? (this.cur?.bodies ?? []).filter(body => body.hp !== undefined) : [];
		const apart = fighters.length > 1 ? Math.abs(fighters[0].j[4] - fighters[1].j[4]) + 140 : 0;

		this.arenaSpan = lerp(this.arenaSpan ?? apart, Math.max(upright ? ARENA_SPAN_UPRIGHT : ARENA_SPAN, apart), 0.08);

		const base = this.arena
			? Math.min(mainHeight / (H - VIEW_TOP), width / this.arenaSpan)
			: upright
				? Math.min(mainHeight / (H - VIEW_TOP), width / UPRIGHT_SPAN)
				: Math.max(fit, Math.min(READABLE, height / (H - VIEW_TOP)));
		// Zoomed out no further than the whole field fits
		const scale = Math.max(fit, base * this.cam.zoom);
		const seen = width / scale;

		// In the arena it follows the fight: between the two gladiators, easing along as they move
		if (fighters.length) {
			const mid = fighters.reduce((sum, body) => sum + body.j[4], 0) / fighters.length;

			this.cam.x = this.cam.x === null ? mid : lerp(this.cam.x, mid, 0.06);
		}
		// It starts over our own side, once it's known which that is: upright, on the army at home by its wall
		if (this.cam.x === null && this.team !== undefined) {
			if (this.team < 0) this.cam.x = W / 2;
			else if (upright) this.cam.x = this.team === 0 ? UPRIGHT_HOME : W - UPRIGHT_HOME;
			else this.cam.x = this.team === 1 ? W - seen / 2 : seen / 2;
		}
		if (this.cam.x !== null) this.cam.x = seen >= W ? W / 2 : clamp(this.cam.x, seen / 2, W - seen / 2);

		const left = width / 2 - (this.cam.x ?? W / 2) * scale;
		const top = mainTop + (H * scale > mainHeight ? mainHeight - H * scale : (mainHeight - H * scale) / 2);

		return { scale, left, top, overview, mainTop };
	}

	// Looking around the field: two fingers pan along it and pinch to zoom; the wheel zooms, and the arrow keys pan
	lookAround() {
		const touches = new Map();
		let gesture = null;
		const spread = () => {
			const [a, b] = [...touches.values()];

			return { mid: (a.x + b.x) / 2, gap: Math.hypot(a.x - b.x, a.y - b.y) };
		};
		const el = this.stage.elem;

		const listen = (target, type, handler, options) => {
			target.addEventListener(type, handler, options);
			this.addCleanup(`look-${type}`, () => target.removeEventListener(type, handler, options));
		};

		listen(el, 'pointerdown', event => {
			if (event.pointerType !== 'touch') return;
			touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (touches.size === 2) {
				// A second finger: whatever the first was doing is let go, and the two move the camera
				this.press = null;
				this.box = null;
				this.aim = null;

				const { mid, gap } = spread();

				gesture = { mid, gap, zoom: this.cam.zoom, x: this.cam.x, scale: this.fitting()?.scale ?? 1 };
			}
		});
		listen(window, 'pointermove', event => {
			if (!touches.has(event.pointerId)) return;
			touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (!gesture || touches.size < 2) return;

			const { mid, gap } = spread();

			this.cam.zoom = clamp((gesture.zoom * gap) / Math.max(20, gesture.gap), 0.4, MOST_ZOOM);
			this.cam.x = gesture.x - (mid - gesture.mid) / gesture.scale;
		});

		const lift = event => {
			touches.delete(event.pointerId);
			if (touches.size < 2) gesture = null;
		};

		listen(window, 'pointerup', lift);
		listen(window, 'pointercancel', lift);
		listen(
			el,
			'wheel',
			event => {
				event.preventDefault();
				this.cam.zoom = clamp(this.cam.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), 0.4, MOST_ZOOM);
			},
			{ passive: false },
		);
		listen(window, 'keydown', event => {
			if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

			const f = this.fitting();

			if (f) this.cam.x += ((event.key === 'ArrowLeft' ? -1 : 1) * this.stage.width * 0.25) / f.scale;
		});
	}

	// A point on the stage as a point on the drawn page of the world (before depth: what's drawn there)
	toPage({ x, y }) {
		const f = this.fitting();

		return f ? { x: (x - f.left) / f.scale, y: (y - f.top) / f.scale } : { x: 0, y: 0 };
	}

	myCats() {
		return (this.cur?.cats ?? []).filter(c => c.t === this.team).map((cat, which) => ({ cat, which }));
	}

	// Our catapult under a point of the page (a smashed one too: it can be repaired): anywhere on it, its pile of rocks in front, or the marks over it, and never
	// less than a thumb's width across however far out the view is
	catAt({ x, y }) {
		const thumb = 30 / (this.fitting()?.scale ?? 1);

		return (
			this.myCats().find(({ cat }) => {
				const [cx, cy] = project(cat.x + cat.d * 20, GROUND - 80, cat.z);

				return Math.abs(cx - x) < Math.max(90, thumb) && y > cy - Math.max(110, thumb) && y < cy + Math.max(90, thumb);
			}) ?? null
		);
	}

	// Our wall under a point of the page: anywhere on its stones' band, front to back
	wallAt({ x, y }) {
		const wall = this.cur?.walls[this.team];

		if (!wall) return false;

		const back = GROUND - DEPTH * SKEW_Y;

		return x > wall.x0 - 10 && x < wall.x1 + DEPTH * SKEW_X + 10 && y > back - 170 && y < GROUND + 10;
	}

	// One of our men under a point of the page: near his body or his head, as drawn at his depth
	unitAt({ x, y }) {
		let best = null, bd = 18;

		for (const body of this.myUnits()) {
			const j = body.j;
			const [hx, hy] = project(j[0], j[1], body.z, j[4]);
			const [nx, ny] = project(j[2], j[3], body.z, j[4]);
			const [px, py] = project(j[4], j[5], body.z, j[4]);
			const d = Math.min(segDist(x, y, nx, ny, px, py).d, Math.hypot(x - hx, y - hy));

			if (d < bd) {
				bd = d;
				best = body;
			}
		}

		return best;
	}

	down(point) {
		const f = this.fitting();

		if (f?.overview && point.y < f.overview.h) {
			this.scrub = true;
			this.cam.x = point.x / f.overview.scale;

			return;
		}
		if (this.view?.state.phase !== 'battle' || this.view.away.length) return;
		// The aiming pad has its own hands
		if (point.event?.target?.closest?.('.aim-pad')) return;

		const at = this.toPage(point);
		// A man under the press is picked, unless he's one crewing the catapult there: that's the catapult being tapped
		const cat = this.catAt(at), man = this.unitAt(at);
		const unit = man && !(cat && man.u === 'w') ? man : null;

		this.press = { from: point, at, moved: false, unit, cat: unit ? null : cat };
	}

	move(point) {
		if (this.scrub) {
			const f = this.fitting();

			if (f?.overview) this.cam.x = point.x / f.overview.scale;

			return;
		}

		const press = this.press;

		if (!press) return;
		if (!press.moved && Math.hypot(point.x - press.from.x, point.y - press.from.y) > TAP) press.moved = true;
		if (!press.moved) return;

		const now = this.toPage(point);

		// A drag from one of our standing catapults pulls it back (any way: it flings the other); anywhere else it draws a
		// box to pick men out with
		if (press.cat && !press.cat.cat.dead) this.aim = { which: press.cat.which, from: press.from, to: point };
		else this.box = { x0: press.at.x, y0: press.at.y, x1: now.x, y1: now.y };
	}

	up() {
		this.scrub = false;

		const press = this.press;

		this.press = null;
		if (!press) return;
		if (this.aim) return this.release();
		if (this.box) {
			const { x0, y0, x1, y1 } = this.box;
			const [left, right, top, bottom] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];

			this.box = null;
			this.selected = new Set(
				this.myUnits()
					.filter(({ j, z }) => {
						const [px, py] = project(j[4], j[5], z, j[4]);

						return px >= left && px <= right && py >= top - 30 && py <= bottom + 30;
					})
					.map(body => body.id),
			);
			this.showPicked();

			return;
		}

		// A tap: on a catapult (crew it, or repair it when repairing is chosen), on our wall (repair it), on a man (pick
		// him out, or let him go), or past our wall with men picked (send them charging)
		// A catapult tapped: repaired or crewed by the men picked (or as chosen), else picked out itself to aim
		if (press.cat) {
			const { cat, which } = press.cat;

			if (this.mode === 'repair' || (cat.dead && this.selected.size)) return this.order('repair', which);
			if (this.mode === 'crew' || this.selected.size) return this.order('crew', which);
			if (!cat.dead) this.pickCat(which);

			return;
		}
		if (this.wallAt(press.at) && !press.unit && (this.mode === 'repair' || this.selected.size)) return this.order('repair', 'wall');
		if (press.unit) {
			const only = this.selected.size === 1 && this.selected.has(press.unit.id);

			this.selected = only ? new Set() : new Set([press.unit.id]);
			this.showPicked();

			return;
		}

		const wall = this.cur?.walls[this.team];
		const beyond = wall && (this.team === 0 ? press.at.x > wall.x1 + DEPTH * SKEW_X : press.at.x < wall.x0);

		if (this.selected.size && beyond) return this.order('charge');
		this.letGo();
	}

	// How far a drag is pulled, 0 to 1: as far as the catapult reaches at FULL_PULL pixels
	pullPart() {
		return clamp(Math.hypot(this.aim.from.x - this.aim.to.x, this.aim.from.y - this.aim.to.y) / FULL_PULL, 0, 1);
	}

	// Which way and how far a drag flings: straight back from where it's pulled, held to the catapult's angles
	pull() {
		const angle = flingAngle(this.team, this.aim.from.x - this.aim.to.x, this.aim.from.y - this.aim.to.y);

		return flingFor(this.team, angle, this.pullPart());
	}

	release() {
		const aim = this.aim;
		const [vx, vy] = this.pull();

		this.aim = null;
		if (Math.hypot(vx, vy) < 90 || !aim) return;
		this.setAim([vx, vy]);
	}

	say(name, x, y, color = PENCIL) {
		this.flash = { name, x, y, color, until: performance.now() + 900 };
	}

	item(ref, kind) {
		return this.art?.art?.[ref[0]]?.[kind]?.[ref[1]];
	}

	paint(dt) {
		const g = this.stage.context, f = this.fitting();

		if (!g || !f) return;
		g.setTransform(this.stage.ratio, 0, 0, this.stage.ratio, 0, 0);
		g.clearRect(0, 0, this.stage.width, this.stage.height);
		if (!this.cur || !this.art) return;
		// Past the world's edges, more paper
		g.fillStyle = '#f7f2e4';
		g.fillRect(0, 0, this.stage.width, this.stage.height);

		const t = this.prev ? clamp((performance.now() - this.curAt) / TICK_MS, 0, 1) : 1;
		const scene = this.scene(g, t);
		const shaking = this.shake > 0.3 ? this.shake : 0;

		this.shake *= Math.pow(0.02, dt);
		this.stepParts(dt);

		// The main view: the world where the camera looks, and what's being done in it
		g.save();
		g.beginPath();
		g.rect(0, f.mainTop, this.stage.width, this.stage.height - f.mainTop);
		g.clip();
		// A stick man's line is never thinner on the screen than this, however far out the view is
		this.ink = Math.max(2.6, 2 / f.scale);
		g.translate(f.left + rand(-shaking, shaking) * f.scale, f.top + rand(-shaking, shaking) * f.scale);
		g.scale(f.scale, f.scale);
		this.drawWorld(g, scene);
		if (this.mode) this.drawTargets(g);
		this.drawArcs(g, 1);
		if (this.aim) this.drawAim(g);
		if (this.box) this.drawBox(g);
		if (this.flash && performance.now() < this.flash.until) drawIcon(g, this.flash.name, this.flash.x, this.flash.y, 46, this.flash.color);
		g.restore();
		if (f.overview) this.drawOverview(g, f, scene);
	}

	// Everything on the field as things to draw, back to front: the same list draws in the main view and the overview
	scene(g, t) {
		const cur = this.cur, prev = this.prev;
		const bricks = easeBricks(prev?.bricks, cur.bricks ?? [], t);
		const scene = [];

		cur.cats.forEach((cat, at) => {
			const arm = prev?.cats[at] ? lerp(prev.cats[at].arm, cat.arm, t) : cat.arm;

			scene.push({ z: cat.z, draw: () => atDepth(g, cat.x, cat.z, () => this.drawCat(g, cat, arm)) });
		});
		// The dead and the wreckage fade away after a while (the server says how far): drawn see-through as they go
		const fading = (alpha, draw) => () => {
			g.globalAlpha = alpha ?? 1;
			draw();
			g.globalAlpha = 1;
		};

		for (const body of ease(prev?.bodies, cur.bodies, t)) {
			scene.push({ z: body.z, draw: fading(body.fa, () => atDepth(g, body.j[4], body.z, () => this.drawBody(g, body))) });
		}
		for (const thing of [...ease(prev?.props, cur.props, t), ...ease(prev?.projs, cur.projs, t)]) {
			scene.push({ z: thing.z, draw: fading(thing.f, () => atDepth(g, thing.x, thing.z, () => this.drawProp(g, thing))) });
		}
		// A wall's stones drawn as its thickness, layer on layer; a stone fallen loose lies where it lies
		for (let layer = 0; layer < WALL_LAYERS; layer++) {
			const z = DEPTH - 8 - (layer * (DEPTH - 16)) / (WALL_LAYERS - 1);

			scene.push({ z, draw: () => bricks.forEach(brick => brick[10] < 0 && atDepth(g, brick[4], z, () => this.drawBrick(g, brick, layer === WALL_LAYERS - 1))) });
		}
		for (const brick of bricks) {
			if (brick[10] >= 0) scene.push({ z: brick[10], draw: fading(brick[13], () => atDepth(g, brick[4], brick[10], () => this.drawBrick(g, brick, true))) });
		}
		if (!cur.arena) for (const wall of cur.walls) scene.push({ z: 4, draw: () => this.drawFlag(g, wall) });
		// The arena's medics, come to slap a yielded gladiator back together
		for (const medic of cur.mercy?.medics ?? []) scene.push({ z: medic[1], draw: () => atDepth(g, medic[0], medic[1], () => this.drawMedic(g, medic)) });

		return scene.sort((a, b) => b.z - a.z);
	}

	// The paper (or the arena, its crowd and all), the blood on it, the field's things and what's flying, in whatever
	// transform the context has
	drawWorld(g, scene) {
		g.save();
		g.beginPath();
		g.rect(0, 0, W, H);
		g.clip();
		g.drawImage(this.arena ? arenaBackground() : paperBackground(), 0, 0);
		if (this.arena) this.drawCrowd(g);
		g.drawImage(this.decal, 0, 0);
		g.lineCap = g.lineJoin = 'round';
		for (const thing of scene) thing.draw();
		this.drawParts(g);
		if (this.arena) this.drawMercy(g);
		g.restore();
	}

	// The stick men players have drawn, seated in the stands: each drawn once, small, from its own skeleton, standing and
	// with its arms thrown up, in an ink of its own. The better loved, the more seats they fill.
	seatCrowd(list) {
		const ratio = window.devicePixelRatio || 1, inks = [PENCIL, PENCIL, '#1f3f9e', '#1c6e35', '#8a3b2a', '#6b5a8e', '#a0702a'];
		const sprite = (rig, cheer, ink) => {
			const canvas = document.createElement('canvas'), g = canvas.getContext('2d');
			const J = rig.joints.map(p => ({ ...p }));

			if (cheer) {
				// Hands up over the shoulders, elbows half way
				const n = J[1];

				J[4] = { x: n.x - 0.22, y: n.y - 0.3 };
				J[6] = { x: n.x + 0.22, y: n.y - 0.3 };
				J[3] = { x: n.x - 0.16, y: n.y - 0.1 };
				J[5] = { x: n.x + 0.16, y: n.y - 0.1 };
			}

			const top = Math.min(J[0].y - rig.headR, ...J.map(p => p.y)), bottom = Math.max(...J.map(p => p.y));
			const k = 46 / Math.max(0.2, bottom - top);

			canvas.width = 40 * ratio;
			canvas.height = 56 * ratio;
			g.scale(ratio, ratio);
			g.lineCap = g.lineJoin = 'round';
			drawBody(g, rig, { j: J.flatMap(p => [20 + p.x * k, 5 + (p.y - top) * k]), o: 1023, f: 1, q: 1 }, ink, 2.2);

			return canvas;
		};

		this.crowdSprites = list
			.filter(member => member.rig)
			.slice(0, 40)
			.map(({ rig }) => {
				const ink = pick(inks);

				return { rest: sprite(rig, false, ink), cheer: sprite(rig, true, ink) };
			});
		this.fans = null;
	}

	// The arena's crowd in its stands: little stick people in rows, bobbing; on their feet with their arms up when the crowd
	// roars or gasps, arms down and swaying when it boos, settling again over a couple of seconds
	drawCrowd(g) {
		const k = depthScale(DEPTH), backY = GROUND - DEPTH * SKEW_Y, wallTop = backY - ARENA_WALL * k;
		const t = performance.now() / 1000, since = this.cheer ? t - this.cheer.at / 1000 : 9;
		// The verdict on a yielded gladiator, given: every hand up with its thumb, up or down
		const verdict = this.cur?.mercy?.up;
		// An eruption runs hotter and longer than any other cheer
		const erupting = this.cheer?.kind === 'erupt';
		const heat = clamp((1 - since / (erupting ? 3.5 : 2.5)) * (erupting ? 1.8 : 1), 0, 1.8), booing = this.cheer?.kind === 'boo' && heat > 0;
		// Over at the end: everyone on their feet; while the crowd decides a yielded gladiator's fate, hushed and still
		const hushed = this.cur?.mercy?.ready && this.cur.mercy.up === undefined;
		const roused = this.cur?.over || this.view?.state.phase === 'over' ? 1 : booing || hushed ? 0 : heat;

		// Each row's people in order of their ink, so a row is drawn in a few strokes, not hundreds
		// Most seats are players' own stick men, when there are any (the loved first in line), the rest the crowd's regulars
		const drawn = this.crowdSprites ?? [];

		this.fans ??= Array.from({ length: ARENA_ROWS }, () =>
			Array.from({ length: Math.ceil(W / 22) + 4 }, (_, i) => ({
				x: i * 22 - 30 + rand(-6, 6),
				phase: rand(0, TAU),
				ink: Math.random() < 0.7 ? PENCIL : pick(['#1f3f9e', '#1c6e35', '#8a3b2a', '#6b5a8e', '#a0702a']),
				s: rand(0.85, 1.1),
				member: drawn.length && Math.random() < 0.7 ? drawn[Math.floor(Math.random() ** 2 * drawn.length)] : null,
			})).sort((a, b) => (a.ink < b.ink ? -1 : 1)),
		);
		g.save();
		g.lineWidth = 1.6;
		this.fans.forEach((row, r) => {
			const base = wallTop - 4 - r * ((ARENA_STANDS * k) / ARENA_ROWS), size = 11 * k * (1 - r * 0.04);
			let ink = null;

			for (const fan of row) {
				// One of the players' stick men: its picture, standing or cheering, hopping and swaying with the rest
				if (fan.member) {
					const hop = roused * Math.max(0, Math.sin(t * 13 + fan.phase)) * 6 + Math.sin(t * 2 + fan.phase) * 0.8;
					const sway = booing ? Math.sin(t * 6 + fan.phase) * 2.5 : 0;
					const tall = size * fan.s * 2.7, wide = (tall * 40) / 56;

					g.drawImage(roused > 0.15 || verdict !== undefined ? fan.member.cheer : fan.member.rest, fan.x + DEPTH * SKEW_X + sway - wide / 2, base - hop - tall, wide, tall);
					continue;
				}
				if (fan.ink !== ink) {
					if (ink) g.stroke();
					ink = fan.ink;
					g.strokeStyle = ink;
					g.beginPath();
				}
				const x = fan.x + DEPTH * SKEW_X, s = size * fan.s;
				const hop = roused * Math.max(0, Math.sin(t * 13 + fan.phase)) * 6 + Math.sin(t * 2 + fan.phase) * 0.8;
				const sway = booing ? Math.sin(t * 6 + fan.phase) * 2.5 : 0;
				const feet = base - hop, hip = feet - s * 0.8, neck = hip - s * 0.9, head = neck - s * 0.45;
				// Arms: up and waving when roused, hanging limp when booing, down at their sides otherwise
				const up = roused > 0.15 ? -1 : booing ? 1.2 : 0.9;

				g.moveTo(x + sway + s * 0.42, head);
				g.arc(x + sway, head, s * 0.42, 0, TAU);
				g.moveTo(x + sway, neck);
				g.lineTo(x, hip);
				g.lineTo(x - s * 0.35, feet);
				g.moveTo(x, hip);
				g.lineTo(x + s * 0.35, feet);
				g.moveTo(x + sway, neck + s * 0.15);
				g.lineTo(x + sway - s * 0.6, neck + s * 0.6 * up + Math.sin(t * 15 + fan.phase) * roused * 2);
				g.moveTo(x + sway, neck + s * 0.15);
				if (verdict === undefined) g.lineTo(x + sway + s * 0.6, neck + s * 0.6 * up + Math.cos(t * 15 + fan.phase) * roused * 2);
				else {
					// An arm thrust up, its thumb pointing the crowd's way
					const hx = x + sway + s * 0.35, hy = neck - s * 0.75;

					g.lineTo(hx, hy);
					g.moveTo(hx, hy);
					g.lineTo(hx + s * 0.12, hy + (verdict ? -s * 0.35 : s * 0.35));
				}
			}
			if (ink) g.stroke();
		});
		g.restore();
	}

	// On a phone held upright: the whole battlefield in a strip across the top, the main view's reach boxed on it
	drawOverview(g, f, scene) {
		const ov = f.overview;

		g.save();
		g.beginPath();
		g.rect(0, 0, this.stage.width, ov.h);
		g.clip();
		g.fillStyle = '#f7f2e4';
		g.fillRect(0, 0, this.stage.width, ov.h);
		this.ink = 2.6 / ov.scale / 2;
		g.scale(ov.scale, ov.scale);
		g.translate(0, -ov.top);
		this.drawWorld(g, scene);
		// Drawn bigger, to read at the strip's size
		this.drawArcs(g, 0.8 / ov.scale);

		const seen = this.stage.width / f.scale;

		g.strokeStyle = teamInk(Math.max(0, this.team));
		g.lineWidth = 3 / ov.scale;
		g.setLineDash([10 / ov.scale, 7 / ov.scale]);
		g.strokeRect(-f.left / f.scale, ov.top + 4, seen, H - ov.top - 8);
		g.restore();
		g.strokeStyle = PENCIL;
		g.lineWidth = 2;
		g.beginPath();
		g.moveTo(0, ov.h);
		g.lineTo(this.stage.width, ov.h);
		g.stroke();
	}

	drawBrick(g, brick, front) {
		const [, , a, i, x, y, angle, hp, sx, sy, , cr0, cr1] = brick;
		const stone = this.art.art[a]?.stones?.[i];

		if (!stone) return;

		const hurt = 1 - clamp(hp, 0, 1);

		placeShape(g, stone.shape, { x, y, a: angle, sx, sy }, mixColor(FILLS.stone, FILLS.hurt, hurt), INK, 1.5);
		if (!front || hurt < 0.2) return;
		g.save();
		g.translate(x, y);
		g.rotate(angle);
		g.scale(sx, sy);
		g.beginPath();
		for (const k of [cr0, cr1]) {
			g.moveTo(0, 0);
			g.lineTo(Math.cos(k) * 0.2, Math.sin(k) * 0.2);
			g.lineTo(Math.cos(k + 0.4) * 0.42 * hurt, Math.sin(k + 0.4) * 0.42 * hurt);
		}
		g.lineWidth = 1.2 / ((sx + sy) / 2);
		g.strokeStyle = INK;
		g.stroke();
		g.restore();
	}

	// A man picked out: a pencil ring at his feet and a mark over his head
	drawPicked(g, body) {
		const j = body.j, ink = teamInk(body.t);
		const top = Math.min(j[1], j[3]) - 22;

		g.strokeStyle = ink;
		g.lineWidth = 2.5;
		g.beginPath();
		g.ellipse(j[4], GROUND - 1, 16, 5, 0, 0, TAU);
		g.stroke();
		g.fillStyle = ink;
		g.beginPath();
		g.moveTo(j[0] - 6, top);
		g.lineTo(j[0] + 6, top);
		g.lineTo(j[0], top + 8);
		g.closePath();
		g.fill();
	}

	drawBox(g) {
		const { x0, y0, x1, y1 } = this.box;

		g.save();
		g.strokeStyle = teamInk(this.team);
		g.lineWidth = 2;
		g.setLineDash([8, 6]);
		g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
		g.restore();
	}

	// Crewing or repairing chosen: what can be tapped for it, ringed
	drawTargets(g) {
		const ink = teamInk(this.team), pulse = 3 + Math.sin(performance.now() / 150) * 1.5;

		g.save();
		g.strokeStyle = ink;
		g.lineWidth = pulse;
		g.setLineDash([10, 8]);
		for (const { cat } of this.myCats()) {
			if (cat.dead && this.mode === 'crew') continue;

			const [cx, cy] = project(cat.x, GROUND - 40, cat.z);

			g.beginPath();
			g.ellipse(cx, cy, 70, 55, 0, 0, TAU);
			g.stroke();
		}
		if (this.mode === 'repair') {
			const wall = this.cur.walls[this.team];
			const back = GROUND - DEPTH * SKEW_Y;

			g.strokeRect(wall.x0 - 10, back - 170, wall.x1 - wall.x0 + DEPTH * SKEW_X + 20, GROUND - back + 180);
		}
		g.restore();
	}

	drawBody(g, body) {
		const rig = this.item(body.r, 'stickmen')?.rig;

		if (!rig) return;
		if (this.selected.has(body.id)) this.drawPicked(g, body);
		drawBody(g, rig, body, teamInk(body.t), this.ink);

		// A gladiator's armor, moving with the bones it was drawn on (and gone with any cut away)
		const armor = body.ar && this.item(body.ar, 'armor');

		if (armor) drawBody(g, { strokes: armor.binds }, body, STEEL, this.ink * 1.5);
		this.drawShield(g, body);
		this.drawHealth(g, body);
		// One of ours holding the wall carries a little shield over his head, a repairer a hammer
		const mark = { h: 'hold', r: 'hammer' }[body.u];

		if (mark && body.t === this.team) drawIcon(g, mark, body.j[0], Math.min(body.j[1], body.j[3]) - 26, 16, teamInk(body.t));
		if (body.w) {
			const item = this.item(body.w, 'swords');

			if (item) {
				const j = body.j, L = item.stats.reach, f = body.f;
				const ang = Math.atan2(j[13] - j[11], j[12] - j[10]) + (body.wo ?? 0) * f;
				const hy = body.q < 1 ? GROUND - (GROUND - j[13]) * body.q : j[13];

				g.save();
				g.translate(j[12], hy);
				g.rotate(ang);
				g.scale(L, L * f);
				drawBlade(g, item.shape, body.w[2], 1.7 / L);
				g.restore();
			}
		}
		if (body.st) {
			g.fillStyle = GORE;
			for (const at of body.st) {
				const y = body.j[at * 2 + 1];

				g.beginPath();
				g.arc(body.j[at * 2], body.q < 1 ? GROUND - (GROUND - y) * body.q : y, 2.8, 0, TAU);
				g.fill();
			}
		}
	}

	// A gladiator's shield on his left hand, as big beside him as it was drawn beside him, darkening as it's battered
	drawShield(g, body) {
		const shield = body.sh && this.item(body.sh, 'shield');

		if (!shield) return;

		const size = shield.stats.rel * body.s, j = body.j;
		const y = body.q < 1 ? GROUND - (GROUND - j[9]) * body.q : j[9];

		// A little see-through, so the man behind a big one still shows
		g.globalAlpha *= 0.82;
		placeShape(g, shield.shape, { x: j[8], y, sx: size * body.f, sy: size }, mixColor(FILLS.wood, '#4a3826', 1 - body.sh[2]), WOOD_INK, 1.8);
		g.globalAlpha /= 0.82;
	}

	// A stick medic, a red cross on his chest and his cap: running, down on one knee slapping, or standing by
	drawMedic(g, [x, , what, face]) {
		const t = performance.now() / 1000 + x * 0.01;
		const kneel = what === 's', run = what === 'r';
		const feet = GROUND, hip = feet - (kneel ? 20 : 32), neck = hip - 26, head = neck - 8;
		const stride = run ? Math.sin(t * 14) * 12 : 0;

		g.save();
		g.lineCap = g.lineJoin = 'round';
		g.strokeStyle = PENCIL;
		g.lineWidth = 2.2;
		g.beginPath();
		g.arc(x, head, 7, 0, TAU);
		g.moveTo(x, neck);
		g.lineTo(x + (run ? face * 4 : 0), hip);
		if (kneel) {
			// One knee down, the other foot planted
			g.lineTo(x - face * 12, feet - 2);
			g.lineTo(x - face * 22, feet);
			g.moveTo(x, hip);
			g.lineTo(x + face * 12, hip + 4);
			g.lineTo(x + face * 12, feet);
		} else {
			g.lineTo(x + stride, feet);
			g.moveTo(x + (run ? face * 4 : 0), hip);
			g.lineTo(x - stride, feet);
		}
		// Arms: one swinging slaps down at him, or pumping as he runs, or folded while he waits
		const swing = kneel ? Math.sin(t * 9) : 0;

		g.moveTo(x, neck + 4);
		g.lineTo(x + face * (14 + swing * 6), neck + 4 + (kneel ? 6 - swing * 14 : run ? -stride * 0.6 : 12));
		g.moveTo(x, neck + 4);
		g.lineTo(x - face * 10, neck + 4 + (run ? stride * 0.6 : 14));
		g.stroke();
		// The red cross, on his chest and his cap
		g.strokeStyle = RED_PENCIL;
		g.lineWidth = 2.6;
		g.beginPath();
		g.moveTo(x - 4, neck + 10);
		g.lineTo(x + 4, neck + 10);
		g.moveTo(x, neck + 6);
		g.lineTo(x, neck + 14);
		g.moveTo(x - 2.5, head - 9);
		g.lineTo(x + 2.5, head - 9);
		g.moveTo(x, head - 11.5);
		g.lineTo(x, head - 6.5);
		g.stroke();
		g.restore();
	}

	// A yielded gladiator waiting on the crowd: a thumb over him, tilting slowly from up through sideways to down and back
	// like an emperor making up his mind, growing as the wait goes on; then it slams down on the verdict, huge, and holds
	drawMercy(g) {
		const mercy = this.cur?.mercy;

		if (!mercy) {
			this.mercySeen = this.verdictSeen = null;

			return;
		}

		const now = performance.now() / 1000;

		// The thumb waits for the medics to finish
		if (!mercy.ready) return;
		this.mercySeen ??= now;
		if (mercy.up !== undefined) this.verdictSeen ??= now;

		const [x, y] = project(mercy.x, GROUND - 130, mercy.z);

		g.save();
		g.translate(x, y);
		if (!this.verdictSeen) {
			const waited = now - this.mercySeen;
			// Tilting ever wider, ever slower to make up its mind: past sideways now and then, never quite settling
			const tilt = Math.sin(waited * 1.7) * Math.min(1.9, 0.6 + waited * 0.45);

			g.rotate(tilt);
			drawIcon(g, 'thumbUp', 0, 0, 40 + Math.min(30, waited * 9), PENCIL);
		} else {
			const since = now - this.verdictSeen;
			// Slammed into place: big, overshooting and settling
			const punch = 1 + 0.45 * Math.exp(-since * 5) * Math.cos(since * 18);

			g.rotate(Math.exp(-since * 6) * Math.sin(since * 22) * 0.3);
			drawIcon(g, mercy.up ? 'thumbUp' : 'thumbDown', 0, 0, 92 * punch, mercy.up ? '#2f7a3a' : RED_PENCIL);
		}
		g.restore();
	}

	// How much a gladiator has left: a pencilled bar over his head
	drawHealth(g, body) {
		if (body.hp === undefined) return;

		const x = body.j[0], y = Math.min(body.j[1], body.j[3]) - body.s * 0.32;

		g.strokeStyle = INK;
		g.lineWidth = 1.5;
		g.strokeRect(x - 22, y - 3, 44, 6);
		g.fillStyle = body.hp > 0.35 ? teamInk(body.t) : RED_PENCIL;
		g.fillRect(x - 22, y - 3, 44 * body.hp, 6);
		// What he's been shouted at, over his bar while it holds
		const shout = { c: 'charge', b: 'back', g: 'hold' }[body.cs];

		// Its name, if it's earned one in the hall, over its bar; its shout over that
		const name = this.view?.fame?.[body.t]?.name;

		if (name) {
			g.font = `13px ${HAND}`;
			g.textAlign = 'center';
			g.textBaseline = 'alphabetic';
			g.fillStyle = teamInk(body.t);
			g.fillText(name, x, y - 7);
		}
		if (shout) drawIcon(g, shout, x, y - (name ? 32 : 18), 22, teamInk(body.t));
	}

	drawProp(g, prop) {
		const [kind, a, i] = prop.r;
		const item = this.art.art[a]?.[kind]?.[i];

		if (!item) return;

		const base = FILLS[prop.c] ?? FILLS.stone;
		const fill = prop.b ? mixColor(base, GORE, prop.b) : base;

		// A dropped weapon is still drawn as a weapon: its own lines, no fill
		if (kind === 'swords') return placeShape(g, item.shape, prop, null, INK, 1.7, prop.b ?? 0);
		placeShape(g, item.shape, prop, fill, prop.c === 'wood' ? WOOD_INK : INK, prop.c === 'ammo' ? 2 : 1.6);
	}

	// A catapult's rocks, piled on the ground in front of it (its crew stand behind), each as drawn: the bottom row
	// first, the next to throw on top
	drawPile(g, cat) {
		const rocks = (cat.p ?? []).map(ref => this.item(ref, 'ammo')).filter(Boolean).reverse();
		const at = cat.x + cat.d * 72;
		const widths = [3, 3, 2, 1, 1];
		let row = 0, inRow = 0;

		for (const rock of rocks) {
			const width = widths[row] ?? 1;
			const x = at + (inRow - (width - 1) / 2) * 20 + (row % 2) * 2, y = GROUND - 10 - row * 15;
			// Bigger rocks a little bigger on the pile, all small enough to stack
			const size = clamp(rock.radius * 1.1, 17, 25);

			placeShape(g, rock.shape, { x, y, a: (inRow * 1.7 + row) % TAU, sx: size, sy: size }, FILLS.ammo, INK, 1.6);
			if (++inRow >= width) {
				row++;
				inRow = 0;
			}
		}
	}

	drawCat(g, cat, arm) {
		const y = GROUND - 160, ink = teamInk(cat.t);

		this.drawPile(g, cat);

		g.font = `22px ${HAND}`;
		g.textAlign = 'left';
		g.textBaseline = 'middle';

		// Smashed: its wreck site, and how far its rebuilding has come
		if (cat.dead) {
			if (!cat.rp && !cat.rb) return;
			drawIcon(g, 'hammer', cat.x - 30, y, 22, ink);
			g.strokeStyle = INK;
			g.lineWidth = 1.5;
			g.strokeRect(cat.x - 14, y - 4, 60, 8);
			g.fillStyle = ink;
			g.fillRect(cat.x - 14, y - 4, 60 * clamp(cat.rb ?? 0, 0, 1), 8);

			return;
		}

		const geo = catGeometry(cat.x, cat.d, arm);

		g.save();
		if (cat.shk) g.translate(rand(-2, 2), rand(-1, 1));
		geo.wheels.forEach(([x, wy], at) => {
			const wheel = this.item(cat.wh[at], 'stones');

			if (wheel) placeShape(g, wheel.shape, { x, y: wy, sx: 26, sy: 26 }, FILLS.stone, INK, 1.6);
		});
		geo.segs.forEach(([p, q], at) => {
			const beam = this.item(cat.b[at], 'beams');

			if (!beam) return;

			const len = Math.hypot(q[0] - p[0], q[1] - p[1]), thick = beamScale(beam, len);

			placeShape(
				g,
				beam.shape,
				{ x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2, a: Math.atan2(q[1] - p[1], q[0] - p[0]), sx: len, sy: thick },
				FILLS.wood,
				WOOD_INK,
				beam.wr < 0.04 ? 4 : 1.8,
			);
		});

		const end = geo.segs[3][1];

		g.strokeStyle = WOOD_INK;
		g.lineWidth = 2.5;
		g.beginPath();
		g.arc(end[0], end[1], 9, arm + Math.PI * 0.5, arm + Math.PI * 1.5, cat.d < 0);
		g.stroke();

		const load = cat.l && this.item(cat.l, 'ammo');

		if (cat.ld && load) placeShape(g, load.shape, { x: end[0], y: end[1] - 3, sx: load.radius * 2, sy: load.radius * 2 }, FILLS.ammo, INK, 1.8);
		g.restore();

		// Its rocks on the pile (red when it has none: one to draw, or none left to), its crew (red with nobody at it),
		// anyone repairing it, its health, and its reload draining
		drawIcon(g, cat.n || cat.dr > 0 ? 'rock' : 'empty', cat.x - 34, y, 22, cat.n ? ink : RED_PENCIL);
		g.fillStyle = ink;
		g.fillText(String(cat.n), cat.x - 21, y + 1);
		drawIcon(g, 'person', cat.x + 8, y, 22, cat.cr ? ink : RED_PENCIL);
		g.fillStyle = cat.cr ? ink : RED_PENCIL;
		g.fillText(`${cat.cr}/${MOST_CREW}`, cat.x + 20, y + 1);
		if (cat.rp) drawIcon(g, 'hammer', cat.x + 62, y, 20, ink);
		// Ours: aimed (firing by itself whenever it can) in our ink, not yet in red
		if (cat.t === this.team) drawIcon(g, 'target', cat.x - 60, y, 22, cat.aim ? ink : RED_PENCIL);
		if (cat.hp < 100) {
			g.strokeStyle = INK;
			g.lineWidth = 1.5;
			g.strokeRect(cat.x - 25, y + 16, 50, 6);
			g.fillStyle = RED_PENCIL;
			g.fillRect(cat.x - 25, y + 16, 50 * clamp(cat.hp / 100, 0, 1), 6);
		}
		if (cat.cd > 0 && cat.n > 0) {
			g.strokeStyle = 'rgba(0,0,0,0.35)';
			g.lineWidth = 3;
			g.beginPath();
			g.arc(cat.x, y + 36, 7, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cat.cd / (cat.rl || 1)));
			g.stroke();
		}
	}

	// A flag over the front of each wall, and who plays that side above it (underlined for the one looking)
	drawFlag(g, wall) {
		const mid = (wall.x0 + wall.x1) / 2;
		const fy = this.groundAt(mid) - 4, fx = mid;
		const d = wall.team === 0 ? 1 : -1, ink = teamInk(wall.team);

		g.strokeStyle = INK;
		g.lineWidth = 2;
		g.beginPath();
		g.moveTo(fx, fy);
		g.lineTo(fx, fy - 40);
		g.stroke();
		g.fillStyle = ink;
		g.beginPath();
		g.moveTo(fx, fy - 40);
		g.lineTo(fx + d * (24 + Math.sin(performance.now() / 160) * 3), fy - 33);
		g.lineTo(fx, fy - 26);
		g.fill();
		if (wall.rp) drawIcon(g, 'hammer', fx + d * 30, fy - 10, 20, ink);

		const state = this.view?.state;
		let who = null;

		if (state?.seats[wall.team]) who = 'person';
		else if (state?.mode === 'cpu' && wall.team === 1) who = 'robot';
		if (!who) return;
		drawIcon(g, who, fx, fy - 62, 30, ink);
		if (wall.team !== this.team) return;
		g.strokeStyle = ink;
		g.lineWidth = 2.5;
		g.beginPath();
		g.moveTo(fx - 14, fy - 44);
		g.lineTo(fx + 14, fy - 44);
		g.stroke();
	}

	// Our catapult's aim as a dotted arc where its shots will go (bold while the pad's being pulled), and a ring round it
	// while it's picked. `k` is how much bigger to draw the dots and lines, for the small overview.
	drawArcs(g, k) {
		const ink = teamInk(this.team);

		for (const { which, cat } of this.myCats()) {
			if (cat.dead) continue;

			const picked = this.catsPicked.has(which);
			const aim = picked && this.padAim ? this.padAim : cat.aim;

			if (picked) {
				const [cx, cy] = project(cat.x, GROUND - 40, cat.z);

				g.save();
				g.strokeStyle = ink;
				g.lineWidth = 3 * k;
				g.setLineDash([10 * k, 7 * k]);
				g.beginPath();
				g.ellipse(cx, cy, 68, 52, 0, 0, TAU);
				g.stroke();
				g.restore();
			}
			if (!aim) continue;

			const from = catGeometry(cat.x, cat.d, cat.arm).launch;
			const live = picked && this.padAim;

			g.fillStyle = ink;
			// Where the next rock on its pile would land: a heavy one flies shorter
			const heft = this.throwOf(cat);

			flingPath(from, aim[0] * heft, aim[1] * heft, x => this.groundAt(x)).forEach(([x, y], at) => {
				if (at % 4) return;

				const [px, py] = project(x, y, cat.z, x);

				g.globalAlpha = (live ? 1 : 0.65) * (1 - at / 260);
				g.beginPath();
				g.arc(px, py, (live ? 3 : 2.5) * k, 0, TAU);
				g.fill();
			});
			g.globalAlpha = 1;
		}
	}

	// How much of its aimed speed a catapult's next rock leaves with: a heavy one, less
	throwOf(cat) {
		return rockThrow(cat.p?.[0] && this.item(cat.p[0], 'ammo')).speed;
	}

	drawAim(g) {
		const cat = this.myCats()[this.aim.which]?.cat;

		if (!cat) return;

		const [vx, vy] = this.pull();
		const from = catGeometry(cat.x, cat.d, cat.arm).launch;
		const ink = teamInk(this.team);
		const [lx, ly] = project(from[0], from[1], cat.z);
		const f = this.fitting();
		const strength = this.pullPart(), m = Math.hypot(vx, vy) || 1;

		// The pull: a pencil line back from the catapult, as long as the drag (on the page's scale)
		g.strokeStyle = ink;
		g.globalAlpha = 0.6;
		g.lineWidth = 2;
		g.setLineDash([6, 6]);
		g.beginPath();
		g.moveTo(lx, ly);
		g.lineTo(lx - (vx / m) * strength * (FULL_PULL / f.scale), ly - (vy / m) * strength * (FULL_PULL / f.scale));
		g.stroke();
		g.setLineDash([]);
		g.fillStyle = ink;
		flingPath(from, vx * this.throwOf(cat), vy * this.throwOf(cat), x => this.groundAt(x)).forEach(([x, y], at) => {
			if (at % 4) return;

			const [px, py] = project(x, y, cat.z, x);

			g.globalAlpha = 1 - at / 200;
			g.beginPath();
			g.arc(px, py, 3, 0, TAU);
			g.fill();
		});
		g.globalAlpha = 1;
		g.font = `22px ${HAND}`;
		g.textAlign = 'center';
		g.fillText(`${Math.round(strength * 100)}%`, lx, ly - 30);
		if (cat.n <= 0) drawIcon(g, cat.dr > 0 ? 'rock' : 'empty', lx, ly - 60, 40, RED_PENCIL);
		else if (!cat.cr) drawIcon(g, 'person', lx, ly - 60, 40, RED_PENCIL);
		else if (cat.cd > 0) drawIcon(g, 'reload', lx, ly - 60, 40, ink);
	}

	// Blood and dust fly on this page alone; blood that reaches the ground stays there as a pool
	stepParts(dt) {
		const P = this.parts;

		for (let i = P.length - 1; i >= 0; i--) {
			const p = P[i];

			p.vy += GRAV * dt * (p.blood ? 1 : 0.25);
			if (!p.blood) p.vx *= 0.96;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.life -= dt;

			const ground = this.groundAt(p.x);
			let gone = p.life <= 0 || p.x < 0 || p.x > W;

			if (p.y >= ground) {
				if (p.blood && ground === GROUND) this.splat(p.x, p.z, p.s);
				gone = true;
			}
			if (gone) {
				P[i] = P[P.length - 1];
				P.pop();
			}
		}
	}

	drawParts(g) {
		const P = this.parts;

		g.fillStyle = '#a10f0f';
		for (const p of P) {
			if (!p.blood) continue;

			const [px, py] = project(p.x, p.y, p.z, p.x);

			g.fillRect(px - p.s / 2, py - p.s / 2, p.s, p.s);
		}
		for (const p of P) {
			if (p.blood) continue;

			const [px, py] = project(p.x, p.y, p.z, p.x);

			g.globalAlpha = clamp(p.life * 1.5, 0, 0.7);
			g.fillStyle = p.c;
			g.fillRect(px - p.s / 2, py - p.s / 2, p.s, p.s);
		}
		g.globalAlpha = 1;
	}
}
