import { Button, Component, styled } from '@vanilla-bean/components';
import { act, createInput } from '@fatlard1993/web-game-framework/client';
import { Stage } from '@fatlard1993/web-game-framework/ui';

import { TAU, clamp, lerp, rand } from '../art.js';
import { GRAV, GROUND, H, RELOAD, W, WALL, beamScale, catGeometry, flingPath, groundAt, holdFling } from '../battle.js';
import { TEAMS, TICK_MS } from '../rules.js';
import { FILLS, GORE, INK, WOOD_INK, drawBody, drawShape, mixColor, paperBackground, placeShape, teamInk } from './paint.js';

const DUST = { stone: '#9b9488', wood: '#b98a55' };
// How far back a drag flings: world units of drag to speed
const PULL = 3.6;

const Screen = styled(
	Component,
	() => `
		position: relative;
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	`,
);

const Controls = styled(
	Component,
	({ space }) => `
		display: flex;
		justify-content: center;
		gap: ${space.md};
		padding: ${space.sm};

		& button { font-size: 1.8rem; min-width: 96px; padding: 8px 18px; }
	`,
);

const Overlay = styled(
	Component,
	({ colors, elevation, fontSize, radius, space }) => `
		position: absolute;
		left: 50%;
		top: 40%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: ${space.md};
		padding: ${space.lg} ${space.xl};
		border-radius: ${radius.lg};
		background: ${colors.alpha(colors.blackish(), 0.88)};
		box-shadow: ${elevation.lg};
		font-size: ${fontSize.xl};
		text-align: center;

		&:empty { display: none; }
		& .big { font-size: 4rem; line-height: 1; }
		& .row { display: flex; gap: ${space.md}; flex-wrap: wrap; justify-content: center; }
		& button { font-size: 2rem; padding: 8px 22px; }
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

// The battle as every page sees it, and for the two who play it, the catapults to drag and the men to send
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
		this.flash = null;

		this.stage = new Stage({ appendTo: this });
		this.overlay = new Overlay({ appendTo: this });
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

		this.sendButton = new Button({ appendTo: controls, title: 'Send a stick man (Space)', onPointerPress: () => this.send() });
		this.stanceButton = new Button({ appendTo: controls, title: 'Charge or hold (H)', onPointerPress: () => act('stance') });
		this.input = createInput({
			keys: { send: [' '], stance: ['h', 'H'] },
			onPress: name => (name === 'send' ? this.send() : act('stance')),
		});
		this.input.pointer(this.stage.elem, {
			onDown: point => this.aimFrom(point),
			onMove: point => this.aim && Object.assign(this.aim, this.toWorld(point)),
			onUp: () => this.release(),
		});
		this.addCleanup('input', () => this.input.destroy());
	}

	send() {
		act('send', undefined, { quiet: true }).then(said => {
			if (!said.ok) this.say('🚫', this.team === 0 ? 150 : W - 150, GROUND - 200);
		});
	}

	/**
	 * What the server says now
	 * @param {object} view - The game's view
	 * @param {object} me - { team, sound, avatars, art }
	 */
	update(view, { team, sound, avatars, art }) {
		this.team = team;
		this.sound = sound;
		this.avatars = avatars;
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
		}
		if (battle) {
			// A view sent after an action carries the same picture: it isn't a new tick
			if (!this.cur || battle.time !== this.cur.time) {
				this.prev = this.cur;
				this.curAt = performance.now();
			}
			this.cur = battle;
		}
		for (const event of view.events ?? []) this.play(event);
		if (this.sendButton) {
			this.sendButton.elem.textContent = `🏃 ${battle?.reserve[team] ?? 0}`;
			this.stanceButton.elem.textContent = state.hold[team] ? '🛡️' : '⚔️';
		}
		this.showOverlay(view);
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

	showOverlay(view) {
		const { state } = view;
		const key = `${state.phase}|${view.away.join()}|${state.battles}`;

		if (key === this.shown) return;
		this.shown = key;
		this.overlay.elem.replaceChildren();

		if (state.phase === 'battle' && view.away.length) {
			const who = view.away.map(t => `${TEAMS[t].emoji} ${this.avatars[state.seats[t]] ?? ''}`).join(' ');

			this.overlay.elem.innerHTML = `<div class="big">⏸️</div><div>${who} …</div>`;

			return;
		}
		if (state.phase !== 'over' || !state.result) return;

		const { winner, stats } = state.result;
		const mine = this.team >= 0;
		const big = winner < 0 ? '🤝' : mine ? (winner === this.team ? '🏆' : '💀') : `${TEAMS[winner].emoji} 🏆`;

		if (mine) this.sound?.play(winner === this.team ? 'win' : 'lose');
		this.overlay.elem.innerHTML = `
			<div class="big">${big}</div>
			<div class="row"><span>${TEAMS[0].emoji} 🗡️ ${stats.kills[0]}</span><span>${TEAMS[1].emoji} 🗡️ ${stats.kills[1]}</span></div>
			<div class="row"><span>🦴 ${stats.limbs}</span><span>💀 ${stats.heads}</span><span>🩸 ${(stats.blood * 0.004).toFixed(1)} L</span></div>`;
		if (!mine) return;

		const row = new Component({ appendTo: this.overlay, addClass: 'row' });

		new Button({ appendTo: row, textContent: '🔁', title: 'Again, same armies', onPointerPress: () => act('again') });
		new Button({ appendTo: row, textContent: '✏️', title: 'Draw new armies', onPointerPress: () => act('redraw') });
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

		return f ? { cx: (x - f.left) / f.scale, cy: (y - f.top) / f.scale } : { cx: 0, cy: 0 };
	}

	myCats() {
		return (this.cur?.cats ?? []).filter(c => c.t === this.team).map((cat, which) => ({ cat, which }));
	}

	// A press on (or behind) one of our catapults starts pulling it back
	aimFrom(point) {
		if (this.view?.state.phase !== 'battle' || this.view.away.length) return;

		const { cx: x, cy: y } = this.toWorld(point);
		const cats = this.myCats()
			.filter(({ cat }) => !cat.dead)
			.map(entry => ({ ...entry, d: Math.hypot(entry.cat.x - x, GROUND - 50 - y) }))
			.sort((a, b) => a.d - b.d);

		if (!cats.length) return;

		const wall = this.cur.walls[this.team];
		const behind = this.team === 0 ? x < wall.x1 + 60 : x > wall.x0 - 60;
		let chosen = cats[0].d < 110 ? cats[0] : null;

		if (!chosen && behind) chosen = cats.find(({ cat }) => cat.cd <= 0 && cat.n > 0) ?? cats[0];
		if (chosen) this.aim = { which: chosen.which, sx: x, sy: y, cx: x, cy: y };
	}

	pull() {
		return holdFling((this.aim.sx - this.aim.cx) * PULL, (this.aim.sy - this.aim.cy) * PULL);
	}

	release() {
		const aim = this.aim;

		if (!aim) return;

		const [vx, vy] = this.pull();

		this.aim = null;

		if (Math.hypot(vx, vy) < 90) return;

		const cat = this.myCats()[aim.which]?.cat;

		act('fling', { which: aim.which, vx, vy }, { quiet: true }).then(said => {
			if (!said.ok && cat) this.say(cat.n <= 0 ? '🚫' : '⏳', cat.x, GROUND - 190);
		});
	}

	say(text, x, y) {
		this.flash = { text, x, y, until: performance.now() + 900 };
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

		cur.cats.forEach((cat, at) => this.drawCat(g, cat, prev?.cats[at] ? lerp(prev.cats[at].arm, cat.arm, t) : cat.arm));
		for (const body of ease(prev?.bodies, cur.bodies, t)) this.drawBody(g, body);
		for (const wall of cur.walls) this.drawWall(g, wall);
		for (const prop of ease(prev?.props, cur.props, t)) this.drawProp(g, prop);
		for (const proj of ease(prev?.projs, cur.projs, t)) this.drawProp(g, proj);
		this.stepParts(g, dt, cur.walls);
		if (this.aim) this.drawAim(g);
		if (this.flash && performance.now() < this.flash.until) {
			g.font = '40px sans-serif';
			g.textAlign = 'center';
			g.fillStyle = '#000';
			g.fillText(this.flash.text, this.flash.x, this.flash.y);
		}
		g.restore();
	}

	drawBody(g, body) {
		const rig = this.item(body.r, 'stickmen')?.rig;

		if (!rig) return;
		drawBody(g, rig, body, teamInk(body.t));
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

		// Its ammo left, its health, and its reload draining
		const y = GROUND - 150;

		g.fillStyle = teamInk(cat.t);
		g.font = '18px sans-serif';
		g.textAlign = 'center';
		g.fillText(cat.n ? `☄️ ${cat.n}` : '🚫', cat.x, y);
		if (cat.hp < 100) {
			g.strokeStyle = INK;
			g.lineWidth = 1.5;
			g.strokeRect(cat.x - 25, y + 6, 50, 6);
			g.fillStyle = '#c0392b';
			g.fillRect(cat.x - 25, y + 6, 50 * clamp(cat.hp / 100, 0, 1), 6);
		}
		if (cat.cd > 0 && cat.n > 0) {
			g.strokeStyle = 'rgba(0,0,0,0.35)';
			g.lineWidth = 3;
			g.beginPath();
			g.arc(cat.x, y + 22, 7, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cat.cd / RELOAD));
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

		// A flag on the middle column, and who's playing that side above it
		const mc = wall.cols[1], fx = wall.x0 + 1.5 * WALL.cw;
		const fy = GROUND - mc.length * WALL.ch - (mc.length ? mc[mc.length - 1][6] : 0);
		const d = wall.team === 0 ? 1 : -1;

		g.strokeStyle = INK;
		g.lineWidth = 2;
		g.beginPath();
		g.moveTo(fx, fy);
		g.lineTo(fx, fy - 40);
		g.stroke();
		g.fillStyle = teamInk(wall.team);
		g.beginPath();
		g.moveTo(fx, fy - 40);
		g.lineTo(fx + d * (24 + Math.sin(performance.now() / 160) * 3), fy - 33);
		g.lineTo(fx, fy - 26);
		g.fill();

		const seat = this.view?.state.seats[wall.team];
		const who = seat ? this.avatars?.[seat] : this.view?.state.mode === 'cpu' && wall.team === 1 ? '🤖' : '';

		if (who) {
			g.font = '30px sans-serif';
			g.textAlign = 'center';
			g.fillStyle = '#000';
			g.fillText(wall.team === this.team ? `${who}⬇️` : who, fx, fy - 52);
		}
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

		const path = flingPath(from, vx, vy, this.cur.walls);

		path.forEach(([x, y], at) => {
			if (at % 4) return;
			g.globalAlpha = 1 - at / 200;
			g.beginPath();
			g.arc(x, y, 3, 0, TAU);
			g.fill();
		});
		g.globalAlpha = 1;
		if (cat.cd > 0 || cat.n <= 0) {
			g.font = '30px sans-serif';
			g.textAlign = 'center';
			g.fillText(cat.n <= 0 ? '🚫' : '⏳', cat.x, GROUND - 190);
		}
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
