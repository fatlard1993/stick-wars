import { Component, styled } from '@vanilla-bean/components';
import { act, createInput } from '@fatlard1993/web-game-framework/client';
import { Stage } from '@fatlard1993/web-game-framework/ui';

import { TAU, clamp, lerp, rand, segDist } from '../art.js';
import { GRAV, GROUND, H, MOST_CREW, W, WALL, beamScale, catGeometry, flingPath, groundAt, holdFling } from '../battle.js';
import { TEAMS, TICK_MS } from '../rules.js';
import { drawIcon, icon } from './icons.js';
import { FILLS, GORE, INK, WOOD_INK, drawBody, drawShape, mixColor, paperBackground, placeShape, teamInk } from './paint.js';
import { HAND, PENCIL, RED_PENCIL } from './theme.js';
import { count, doodle } from './ui.js';

const DUST = { stone: '#9b9488', wood: '#b98a55' };
// How far back a drag flings: world units of drag to speed
const PULL = 3.6;
// How far a press may wander and still be a tap, in screen pixels
const TAP = 8;

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
		flex-wrap: wrap;
		gap: ${space.md};
		padding: ${space.sm};
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
		if (item.j) return { ...item, j: item.j.map((v, i) => lerp(was.j[i] ?? v, v, t)) };

		return { ...item, x: lerp(was.x, item.x, t), y: lerp(was.y, item.y, t), a: lerp(was.a, item.a, t) };
	});
};

// The battle as every page sees it, and for the two who play it, their army to command: pick men out by tapping them
// or dragging a box, then send them to fight, hold the wall, go home, or crew a catapult (tap it); drag back from a
// catapult to fling
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
		this.selected = new Set();

		this.stage = new Stage({ appendTo: this });
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

		const controls = new Controls({ appendTo: this });

		controls.append(
			doodle('charge', { title: 'Charge (Space)', size: '2em', onPress: () => this.order('charge') }),
			doodle('hold', { title: 'Hold the wall (H)', size: '2em', onPress: () => this.order('hold') }),
			doodle('base', { title: 'Go home (B)', size: '2em', onPress: () => this.order('idle') }),
			doodle('all', { title: 'Pick out everyone (A)', size: '2em', onPress: () => this.selectAll() }),
		);
		this.input = createInput({
			keys: { charge: [' '], hold: ['h', 'H'], idle: ['b', 'B'], all: ['a', 'A'], none: ['Escape'] },
			onPress: name => (name === 'all' ? this.selectAll() : name === 'none' ? this.selected.clear() : this.order(name)),
		});
		this.input.pointer(this.stage.elem, {
			onDown: point => this.down(point),
			onMove: point => this.move(point),
			onUp: () => this.up(),
		});
		this.addCleanup('input', () => this.input.destroy());
	}

	// The men picked out told what to do; with none picked, charging sends one man from home
	order(order, which) {
		const ids = [...this.selected];

		if (!ids.length) {
			if (order === 'charge')
				act('send', undefined, { quiet: true }).then(said => {
					if (!said.ok || !said.result?.sent) this.say('empty', this.team === 0 ? 300 : W - 300, GROUND - 200, RED_PENCIL);
				});

			return;
		}
		act('order', { ids, order, which }, { quiet: true }).then(said => {
			if (!said.ok && order === 'crew') this.say('person', this.myCats()[which]?.cat.x ?? W / 2, GROUND - 200, RED_PENCIL);
		});
		if (order === 'crew' || order === 'charge') this.selected.clear();
	}

	myUnits() {
		return (this.cur?.bodies ?? []).filter(body => body.t === this.team && body.u);
	}

	selectAll() {
		this.selected = new Set(this.myUnits().map(body => body.id));
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
		this.arm(team);

		const { state, battle } = view;

		if (state.battles !== this.battles) {
			this.battles = state.battles;
			this.decal.getContext('2d').clearRect(0, 0, W, H);
			this.parts = [];
			this.prev = null;
			this.cur = null;
			this.selected.clear();
		}
		if (battle) {
			// A view sent after an action carries the same picture: it isn't a new tick
			if (!this.cur || battle.time !== this.cur.time) {
				this.prev = this.cur;
				this.curAt = performance.now();
			}
			this.cur = battle;

			// The dead can't be picked
			const alive = new Set(this.myUnits().map(body => body.id));

			for (const id of this.selected) if (!alive.has(id)) this.selected.delete(id);
		}
		for (const event of view.events ?? []) this.play(event);
		this.showCard(view);
	}

	play(event) {
		if (event.e === 'blood') {
			for (let i = 0; i < event.n; i++) {
				const a = event.a + rand(-event.sp, event.sp) * Math.PI, v = event.v * rand(0.3, 1.2);

				this.parts.push({ x: event.x, y: event.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: rand(1.5, 3.6), blood: true, life: 3 });
			}
		} else if (event.e === 'dust') {
			for (let i = 0; i < event.n; i++) {
				const a = rand(0, TAU), v = rand(20, 140);

				this.parts.push({ x: event.x, y: event.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, s: rand(2, 5), life: rand(0.4, 0.9), c: DUST[event.c] ?? DUST.stone });
			}
		} else if (event.e === 'splat') {
			for (let i = 0; i < 30; i++) this.splat(event.x + rand(-40, 40), GROUND, rand(2, 6));
		} else if (event.e === 'sound') this.sound?.play(event.n);
		else if (event.e === 'shake') this.shake = Math.min(14, this.shake + event.v);
		if (this.parts.length > 3000) this.parts.splice(0, this.parts.length - 3000);
	}

	splat(x, y, s) {
		const g = this.decal.getContext('2d');

		g.fillStyle = `rgba(${(110 + Math.random() * 60) | 0},0,0,0.85)`;
		g.beginPath();
		g.ellipse(x, y - rand(0, 1.5), s * rand(1.2, 3), s * rand(0.4, 0.9), 0, 0, TAU);
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
				row(...view.away.map(t => icon('flag', { size: '1.6em', color: TEAMS[t].ink })), 'is away…'),
			);

			return;
		}
		if (state.phase !== 'over' || !state.result) return;

		const { winner, stats } = state.result;
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

	// How the world fits the stage: as big as it can, centered
	fitting() {
		const { width, height } = this.stage;

		if (!width || !height) return null;

		const scale = Math.min(width / W, height / H);

		return { scale, left: (width - W * scale) / 2, top: (height - H * scale) / 2 };
	}

	toWorld({ x, y }) {
		const f = this.fitting();

		return f ? { x: (x - f.left) / f.scale, y: (y - f.top) / f.scale } : { x: 0, y: 0 };
	}

	myCats() {
		return (this.cur?.cats ?? []).filter(c => c.t === this.team).map((cat, which) => ({ cat, which }));
	}

	// One of our catapults under a point, if there is one
	catAt({ x, y }) {
		return this.myCats().find(({ cat }) => !cat.dead && Math.abs(cat.x - x) < 60 && y > GROUND - 110 && y < GROUND + 10) ?? null;
	}

	// One of our men under a point, if there is one: near his body or his head
	unitAt({ x, y }) {
		let best = null, bd = 16;

		for (const body of this.myUnits()) {
			const j = body.j;
			const d = Math.min(segDist(x, y, j[2], j[3], j[4], j[5]).d, Math.hypot(x - j[0], y - j[1]));

			if (d < bd) {
				bd = d;
				best = body;
			}
		}

		return best;
	}

	down(point) {
		if (this.view?.state.phase !== 'battle' || this.view.away.length) return;

		const at = this.toWorld(point);

		// A man under the press is picked over the catapult he crews
		const unit = this.unitAt(at);

		this.press = { from: point, at, moved: false, unit, cat: unit ? null : this.catAt(at) };
	}

	move(point) {
		const press = this.press;

		if (!press) return;

		const now = this.toWorld(point);

		if (!press.moved && Math.hypot(point.x - press.from.x, point.y - press.from.y) > TAP) press.moved = true;
		if (!press.moved) return;
		// A drag from a catapult pulls it back; anywhere else it draws a box to pick men out with
		if (press.cat) this.aim = { which: press.cat.which, sx: press.at.x, sy: press.at.y, cx: now.x, cy: now.y };
		else this.box = { x0: press.at.x, y0: press.at.y, x1: now.x, y1: now.y };
	}

	up() {
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
					.filter(({ j }) => j[4] >= left && j[4] <= right && j[5] >= top - 20 && j[5] <= bottom + 20)
					.map(body => body.id),
			);

			return;
		}
		// A tap: a catapult crewed by the men picked out, a man picked out (or let go), or the men sent where it points
		if (press.cat && this.selected.size) return this.order('crew', press.cat.which);
		if (press.unit) {
			const only = this.selected.size === 1 && this.selected.has(press.unit.id);

			this.selected = only ? new Set() : new Set([press.unit.id]);

			return;
		}

		const wall = this.cur?.walls[this.team];
		const beyond = wall && (this.team === 0 ? press.at.x > wall.x1 : press.at.x < wall.x0);

		if (this.selected.size && beyond) return this.order('charge');
		this.selected.clear();
	}

	pull() {
		return holdFling((this.aim.sx - this.aim.cx) * PULL, (this.aim.sy - this.aim.cy) * PULL);
	}

	release() {
		const aim = this.aim;
		const [vx, vy] = this.pull();

		this.aim = null;
		if (Math.hypot(vx, vy) < 90) return;

		const cat = this.myCats()[aim.which]?.cat;

		act('fling', { which: aim.which, vx, vy }, { quiet: true }).then(said => {
			if (said.ok || !cat) return;
			if (cat.n <= 0) this.say('empty', cat.x, GROUND - 210, RED_PENCIL);
			else if (!cat.cr) this.say('person', cat.x, GROUND - 210, RED_PENCIL);
			else this.say('reload', cat.x, GROUND - 210);
		});
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

		const t = this.prev ? clamp((performance.now() - this.curAt) / TICK_MS, 0, 1) : 1;
		const shaking = this.shake > 0.3 ? this.shake : 0;

		this.shake *= Math.pow(0.02, dt);
		g.translate(f.left + rand(-shaking, shaking) * f.scale, f.top + rand(-shaking, shaking) * f.scale);
		g.scale(f.scale, f.scale);
		g.save();
		g.beginPath();
		g.rect(0, 0, W, H);
		g.clip();
		g.drawImage(paperBackground(), 0, 0);
		g.drawImage(this.decal, 0, 0);
		g.lineCap = g.lineJoin = 'round';

		const cur = this.cur, prev = this.prev;
		const bodies = ease(prev?.bodies, cur.bodies, t);

		cur.cats.forEach((cat, at) => this.drawCat(g, cat, prev?.cats[at] ? lerp(prev.cats[at].arm, cat.arm, t) : cat.arm));
		for (const body of bodies) if (this.selected.has(body.id)) this.drawPicked(g, body);
		for (const body of bodies) this.drawBody(g, body);
		for (const wall of cur.walls) this.drawWall(g, wall);
		for (const prop of ease(prev?.props, cur.props, t)) this.drawProp(g, prop);
		for (const proj of ease(prev?.projs, cur.projs, t)) this.drawProp(g, proj);
		this.stepParts(g, dt, cur.walls);
		if (this.aim) this.drawAim(g);
		if (this.box) this.drawBox(g);
		if (this.flash && performance.now() < this.flash.until) drawIcon(g, this.flash.name, this.flash.x, this.flash.y, 46, this.flash.color);
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

	drawBody(g, body) {
		const rig = this.item(body.r, 'stickmen')?.rig;

		if (!rig) return;
		drawBody(g, rig, body, teamInk(body.t));
		// One of ours told to hold the wall carries a little shield over his head
		if (body.u === 'h' && body.t === this.team) drawIcon(g, 'hold', body.j[0], Math.min(body.j[1], body.j[3]) - 26, 16, teamInk(body.t));
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
				drawShape(g, item.shape, mixColor(FILLS.steel, GORE, body.w[2]), INK, 1.7 / L);
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

	drawProp(g, prop) {
		const [kind, a, i] = prop.r;
		const item = this.art.art[a]?.[kind]?.[i];

		if (!item) return;

		const base = FILLS[prop.c] ?? FILLS.stone;
		const fill = prop.b ? mixColor(base, GORE, prop.b) : base;

		placeShape(g, item.shape, prop, fill, prop.c === 'wood' ? WOOD_INK : INK, prop.c === 'ammo' ? 2 : 1.6);
	}

	drawCat(g, cat, arm) {
		if (cat.dead) return;

		const geo = catGeometry(cat.x, cat.d, arm);

		g.save();
		if (cat.shk) g.translate(rand(-2, 2), rand(-1, 1));
		geo.wheels.forEach(([x, y], at) => {
			const wheel = this.item(cat.wh[at], 'stones');

			if (wheel) placeShape(g, wheel.shape, { x, y, sx: 26, sy: 26 }, FILLS.stone, INK, 1.6);
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

		const load = this.item(cat.l, 'ammo');

		if (cat.ld && load) placeShape(g, load.shape, { x: end[0], y: end[1] - 3, sx: load.radius * 2, sy: load.radius * 2 }, FILLS.ammo, INK, 1.8);
		g.restore();

		// Its ammo left, its crew (red with nobody at it), its health, and its reload draining
		const y = GROUND - 160, ink = teamInk(cat.t);

		g.font = `22px ${HAND}`;
		g.textAlign = 'left';
		g.textBaseline = 'middle';
		drawIcon(g, cat.n ? 'rock' : 'empty', cat.x - 34, y, 22, cat.n ? ink : RED_PENCIL);
		g.fillStyle = ink;
		g.fillText(String(cat.n), cat.x - 21, y + 1);
		drawIcon(g, 'person', cat.x + 8, y, 22, cat.cr ? ink : RED_PENCIL);
		g.fillStyle = cat.cr ? ink : RED_PENCIL;
		g.fillText(`${cat.cr}/${MOST_CREW}`, cat.x + 20, y + 1);
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

	drawWall(g, wall) {
		wall.cols.forEach((col, c) => {
			col.forEach((br, r) => {
				const [a, i, hp, rot, sx, sy, dy, cr0, cr1] = br;
				const stone = this.art.art[a]?.stones?.[i];

				if (!stone) return;

				const x = wall.x0 + (c + 0.5) * WALL.cw, y = GROUND - (r + 0.5) * WALL.ch - dy;
				const w = WALL.cw * sx, h = WALL.ch * sy, hurt = 1 - clamp(hp, 0, 1);

				placeShape(g, stone.shape, { x, y, a: rot, sx: w, sy: h }, mixColor(FILLS.stone, FILLS.hurt, hurt), INK, 1.5);
				if (hurt > 0.2) {
					g.save();
					g.translate(x, y);
					g.rotate(rot);
					g.scale(w, h);
					g.beginPath();
					for (const k of [cr0, cr1]) {
						g.moveTo(0, 0);
						g.lineTo(Math.cos(k) * 0.2, Math.sin(k) * 0.2);
						g.lineTo(Math.cos(k + 0.4) * 0.42 * hurt, Math.sin(k + 0.4) * 0.42 * hurt);
					}
					g.lineWidth = 1.2 / ((w + h) / 2);
					g.strokeStyle = INK;
					g.stroke();
					g.restore();
				}
			});
		});

		// A flag on the middle column, and who plays that side above it (underlined for the one looking)
		const mc = wall.cols[1], fx = wall.x0 + 1.5 * WALL.cw;
		const fy = GROUND - mc.length * WALL.ch - (mc.length ? mc[mc.length - 1][6] : 0);
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

	drawAim(g) {
		const cat = this.myCats()[this.aim.which]?.cat;

		if (!cat) return;

		const [vx, vy] = this.pull();
		const from = catGeometry(cat.x, cat.d, cat.arm).launch;
		const ink = teamInk(this.team);

		g.strokeStyle = ink;
		g.globalAlpha = 0.6;
		g.lineWidth = 2;
		g.setLineDash([6, 6]);
		g.beginPath();
		g.moveTo(this.aim.sx, this.aim.sy);
		g.lineTo(this.aim.cx, this.aim.cy);
		g.stroke();
		g.setLineDash([]);
		g.fillStyle = ink;
		flingPath(from, vx, vy, this.cur.walls).forEach(([x, y], at) => {
			if (at % 4) return;
			g.globalAlpha = 1 - at / 200;
			g.beginPath();
			g.arc(x, y, 3, 0, TAU);
			g.fill();
		});
		g.globalAlpha = 1;
		if (cat.n <= 0) drawIcon(g, 'empty', cat.x, GROUND - 210, 40, RED_PENCIL);
		else if (!cat.cr) drawIcon(g, 'person', cat.x, GROUND - 210, 40, RED_PENCIL);
		else if (cat.cd > 0) drawIcon(g, 'reload', cat.x, GROUND - 210, 40, ink);
	}

	// Blood and dust fly on this page alone; blood that reaches the ground stays there as a pool
	stepParts(g, dt, walls) {
		const P = this.parts;

		for (let i = P.length - 1; i >= 0; i--) {
			const p = P[i];

			p.vy += GRAV * dt * (p.blood ? 1 : 0.25);
			if (!p.blood) p.vx *= 0.96;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.life -= dt;

			const ground = groundAt(walls, p.x);
			let gone = p.life <= 0 || p.x < 0 || p.x > W;

			if (p.y >= ground) {
				if (p.blood && ground === GROUND) this.splat(p.x, ground, p.s);
				gone = true;
			}
			if (gone) {
				P[i] = P[P.length - 1];
				P.pop();
			}
		}
		g.fillStyle = '#a10f0f';
		for (const p of P) if (p.blood) g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
		for (const p of P) {
			if (p.blood) continue;
			g.globalAlpha = clamp(p.life * 1.5, 0, 0.7);
			g.fillStyle = p.c;
			g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
		}
		g.globalAlpha = 1;
	}
}
