import { Button, Component, Notify, Whiteboard, styled } from '@vanilla-bean/components';
import { act, createInput } from '@fatlard1993/web-game-framework/client';

import { DEFAULT_RAW, PAD, clamp, judge, pick } from '../art.js';
import { MODES, STEPS, TEAMS } from '../rules.js';
import { PAPER, drawRawFit } from './paint.js';

const PRAISE = {
	stickmen: ['Recruited!', 'Fresh meat!', 'Enlisted!', 'Another one for the grinder!'],
	stones: ['Solid.', 'Rock on.', 'Stacked!'],
	beams: ['Timber!', 'Sturdy.', 'Nailed it.'],
	ammo: ['Loaded!', 'That will hurt.', 'Incoming!'],
	swords: ['Sharp!', 'Brutal.', 'Oh, that is nasty.'],
};
// The pen, in pad units: the same weight as the drawings the checks were tuned on
const PEN = 7;

const Screen = styled(
	Component,
	({ space }) => `
		display: flex;
		flex: 1;
		min-height: 0;
		gap: ${space.lg};
		padding: ${space.md};
		justify-content: center;

		@media (max-width: 767px) {
			flex-direction: column;
		}
	`,
);

const Column = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-direction: column;
		gap: ${space.sm};
		min-width: 0;
		min-height: 0;
	`,
);

const Main = styled(Column, () => 'flex: 1; max-width: 900px;');

const Side = styled(
	Column,
	({ space }) => `
		width: 300px;
		gap: ${space.md};

		@media (max-width: 767px) {
			width: auto;
		}
	`,
);

const Heading = styled(
	Component,
	({ fontSize, space }) => `
		display: flex;
		align-items: center;
		gap: ${space.md};
		font-size: ${fontSize.xxl};
		white-space: nowrap;

		& .dots { margin-left: auto; letter-spacing: 2px; }
	`,
);

const Clock = styled(
	Component,
	({ colors, radius }) => `
		position: relative;
		height: 14px;
		border-radius: ${radius.pill};
		background: ${colors.alpha(colors.white, 0.1)};
		overflow: hidden;

		& > div {
			position: absolute;
			inset: 0;
			transform-origin: left;
			background: ${colors.yellow};
		}

		&.low > div { background: ${colors.red}; }
	`,
);

const PadBox = styled(
	Component,
	() => `
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	`,
);

const Tools = styled(
	Component,
	({ space }) => `
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: ${space.sm};

		& button { font-size: 1.6rem; padding: 10px; }
		& .keep { grid-column: span 2; font-size: 2rem; }

		@media (max-width: 767px) {
			grid-template-columns: repeat(4, 1fr);
			& .keep { grid-column: span 1; }
		}
	`,
);

const Stats = styled(
	Component,
	({ colors, fontSize, radius, space }) => `
		display: flex;
		flex-direction: column;
		gap: ${space.xs};

		&:empty { display: none; }
		& h3 { margin: 0; font-size: ${fontSize.xl}; }
		& .stat { display: flex; align-items: center; gap: ${space.sm}; }
		& .stat span { width: 2em; text-align: center; }
		& .stat i {
			flex: 1;
			height: 10px;
			border-radius: ${radius.pill};
			background: ${colors.alpha(colors.white, 0.1)};
			overflow: hidden;
		}
		& .stat b { display: block; height: 100%; background: ${colors.red}; }
	`,
);

const Gallery = styled(
	Component,
	({ colors, radius, space }) => `
		display: flex;
		flex-wrap: wrap;
		gap: ${space.sm};
		overflow: auto;
		min-height: 0;

		& canvas {
			width: 56px;
			height: 56px;
			border-radius: ${radius.md};
			background: ${PAPER};
			border: 2px solid ${colors.border};
		}
	`,
);

const Waiting = styled(
	Component,
	({ fontSize, space }) => `
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: ${space.lg};
		font-size: ${fontSize.xxl};
		text-align: center;

		& .big { font-size: 5rem; line-height: 1; }
	`,
);

// The drawing page: a pad to draw the step's art on, a dashed example to show what's wanted, the clock draining, and
// beside it the tools and everything kept so far. A drawing is judged by the server when kept; weapons show what
// their shape would make them do while they're still being drawn.
export default class DrawScreen extends Screen {
	build() {
		super.build();
		this.strokes = [];
		this.step = -1;
		this.deadline = 0;
		this.art = null;

		this.main = new Main({ appendTo: this });
		this.side = new Side({ appendTo: this });
		this.heading = new Heading({ appendTo: this.main });
		this.clock = new Clock({ appendTo: this.main });
		this.clockBar = document.createElement('div');
		this.clock.elem.append(this.clockBar);
		this.padBox = new PadBox({ appendTo: this.main });
		this.pad = new Whiteboard({
			appendTo: this.padBox,
			background: PAPER,
			color: '#222',
			onLine: event => this.addStroke(event.detail.line),
		});
		this.waiting = new Waiting();

		const tools = new Tools({ appendTo: this.side });

		new Button({ appendTo: tools, textContent: '✅', title: 'Keep it (Enter)', addClass: 'keep', onPointerPress: () => this.keep() });
		new Button({ appendTo: tools, textContent: '↩️', title: 'Undo (Z)', onPointerPress: () => this.undo() });
		new Button({ appendTo: tools, textContent: '🗑️', title: 'Clear (C)', onPointerPress: () => this.clear() });
		new Button({ appendTo: tools, textContent: '⏭️', title: 'Done, next (N)', onPointerPress: () => act('next') });
		this.stats = new Stats({ appendTo: this.side });
		this.count = new Component({ appendTo: this.side });
		this.gallery = new Gallery({ appendTo: this.side });

		this.input = createInput({
			keys: { keep: ['Enter'], undo: ['z', 'Z'], clear: ['c', 'C'], next: ['n', 'N'] },
			onPress: name => (name === 'next' ? act('next') : this[name]?.()),
		});
		this.addCleanup('input', () => this.input.destroy());

		this.sizer = new ResizeObserver(() => this.fit());
		this.sizer.observe(this.padBox.elem);
		this.addCleanup('sizer', () => this.sizer.disconnect());

		const run = () => {
			if (!this.elem.isConnected && this.ran) return;
			this.ran = true;
			this.tickClock();
			this.frame = requestAnimationFrame(run);
		};

		this.frame = requestAnimationFrame(run);
		this.addCleanup('frame', () => cancelAnimationFrame(this.frame));
	}

	// The pad made as big a square as fits, its pen scaled with it
	fit() {
		const { width, height } = this.padBox.elem.getBoundingClientRect();
		const size = Math.floor(Math.max(120, Math.min(width, height)));

		if (size === this.size) return;
		this.size = size;
		this.pad.options.width = `${size}px`;
		this.pad.options.height = `${size}px`;
		this.pad.options.lineWidth = (PEN * size) / PAD;
		this.redraw();
	}

	/**
	 * What the server says now: whose side this is, how far they are, and how long is left
	 * @param {object} view - The game's view
	 * @param {object} me - { team, sound, avatars }
	 */
	update(view, { team, sound, avatars }) {
		this.team = team;
		this.sound = sound;

		const mine = view.state.drawing[team];

		if (!mine || mine.done) return this.showWaiting(view, avatars);
		this.showPad();
		if (mine.step !== this.step) this.setStep(mine.step);

		const ends = performance.now() + mine.left * 1000;

		// Kept steady between views: only a jump of more than a beat moves the clock
		if (Math.abs(ends - this.deadline) > 1200) this.deadline = ends;
	}

	setStep(step) {
		const { kind, emoji, title } = STEPS[step];

		this.step = step;
		this.kind = kind;
		this.strokes = [];
		this.ghost = DEFAULT_RAW[kind]()[0];
		this.stats.elem.replaceChildren();
		this.heading.elem.replaceChildren(
			Object.assign(document.createElement('span'), { textContent: emoji }),
			Object.assign(document.createElement('span'), { textContent: title }),
			Object.assign(document.createElement('span'), {
				className: 'dots',
				textContent: STEPS.map((_, at) => (at < step ? '●' : at === step ? '◉' : '○')).join(''),
			}),
		);
		this.redraw();
		this.showKept();
	}

	setArt(art) {
		this.art = art;
		this.showKept();
	}

	showKept() {
		const items = this.art?.art?.[this.team]?.[this.kind] ?? [];

		this.count.elem.textContent = items.length ? `${STEPS[this.step].emoji} × ${items.length}` : '';
		this.gallery.elem.replaceChildren(
			...items.map(item => {
				const canvas = document.createElement('canvas');

				canvas.width = canvas.height = 112;
				drawRawFit(canvas, item.raw);

				return canvas;
			}),
		);
	}

	tickClock() {
		if (this.step < 0) return;

		const left = Math.max(0, (this.deadline - performance.now()) / 1000);
		const of = STEPS[this.step].seconds;

		this.clockBar.style.transform = `scaleX(${clamp(left / of, 0, 1)})`;
		this.clock.elem.classList.toggle('low', left < 6);
	}

	addStroke(line) {
		if (!this.size || !line?.length) return;

		const k = PAD / this.size;

		this.strokes.push(line.map(({ x, y }) => ({ x: x * k, y: y * k })));
		// The first line wipes the example away
		if (this.strokes.length === 1) this.redraw();
		this.preview();
	}

	undo() {
		this.strokes.pop();
		this.redraw();
		this.preview();
	}

	clear() {
		this.strokes = [];
		this.redraw();
		this.stats.elem.replaceChildren();
	}

	async keep() {
		if (!this.strokes.length) return;

		const { kind } = this;
		const strokes = this.strokes;
		const said = await act('keep', { strokes });

		if (!said.ok) {
			this.sound?.play('nope');

			return;
		}
		this.sound?.play('keep');
		new Notify({ x: window.innerWidth / 2, y: 120, intent: 'success', content: `✅ ${pick(PRAISE[kind])}`, timeout: 1500 });
		if (this.strokes === strokes) this.clear();
		if (said.result?.stats) this.showStats(said.result.stats);
	}

	// A weapon's stats while it's still being drawn, from the same check the server will run
	preview() {
		if (this.kind !== 'swords' || !this.strokes.length) return;

		const verdict = judge('swords', this.strokes);

		if (verdict.ok) this.showStats(verdict.item.stats);
	}

	showStats(s) {
		const bar = (emoji, v) =>
			`<div class="stat"><span>${emoji}</span><i><b style="width:${Math.round(clamp(v, 0, 1) * 100)}%"></b></i></div>`;

		this.stats.elem.innerHTML =
			`<h3>${s.name}</h3>` +
			bar('📏', s.lr) +
			bar('🏋️', (s.weight - 0.35) / 2.2) +
			bar('🪚', s.serr) +
			bar('🔪', s.cut) +
			bar('⚡', 1 - (s.swing - 0.36) / 0.75);
	}

	redraw() {
		if (!this.size) return;

		const g = this.pad.canvas, k = this.size / PAD;
		const path = strokes => {
			g.beginPath();
			for (const s of strokes) {
				g.moveTo(s[0].x * k, s[0].y * k);
				for (const p of s) g.lineTo(p.x * k, p.y * k);
			}
			g.stroke();
		};

		this.pad.clearCanvas();
		g.lineCap = g.lineJoin = 'round';
		if (!this.strokes.length && this.ghost) {
			g.setLineDash([10 * k, 12 * k]);
			g.strokeStyle = 'rgba(0,0,0,0.13)';
			g.lineWidth = 6 * k;
			path(this.ghost);
			g.setLineDash([]);
		}
		g.strokeStyle = '#222';
		g.lineWidth = PEN * k;
		path(this.strokes);
	}

	showPad() {
		if (!this.waiting.elem.isConnected) return;
		this.waiting.elem.remove();
		this.main.elem.style.display = '';
		this.side.elem.style.display = '';
	}

	// Done drawing (or only watching): who the battle waits on
	showWaiting(view, avatars) {
		this.main.elem.style.display = 'none';
		this.side.elem.style.display = 'none';
		if (!this.waiting.elem.isConnected) this.elem.append(this.waiting.elem);

		const { drawing, seats, mode } = view.state;
		const sides = (mode === 'duo' ? [0, 1] : [0]).map(t => {
			const who = seats[t] ? avatars[seats[t]] ?? '🙂' : '➕👫';
			const how = !seats[t] ? '…' : drawing[t].done ? '✅' : `✏️ ${drawing[t].step + 1}/${STEPS.length}`;

			return `${TEAMS[t].emoji} ${who} ${how}`;
		});

		this.waiting.elem.innerHTML = `<div class="big">${MODES[mode]} ⏳</div>${sides.map(s => `<div>${s}</div>`).join('')}`;
	}
}
