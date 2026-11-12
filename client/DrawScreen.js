import { Component, Notify, Whiteboard, styled } from '@vanilla-bean/components';
import { act, createInput } from '@fatlard1993/web-game-framework/client';

import { DEFAULT_RAW, PAD, WEAPON_AREA, clamp, pick } from '../art.js';
import { STEPS, TEAMS } from '../rules.js';
import { icon } from './icons.js';
import { drawRawFit } from './paint.js';
import { PENCIL, RED_PENCIL } from './theme.js';
import { doodle } from './ui.js';

const PRAISE = {
	stickmen: ['Recruited!', 'Fresh meat!', 'Enlisted!', 'Another one for the grinder!'],
	stones: ['Solid.', 'Rock on.', 'Stacked!'],
	beams: ['Timber!', 'Sturdy.', 'Nailed it.'],
	ammo: ['Loaded!', 'That will hurt.', 'Incoming!'],
	swords: ['Sharp!', 'Brutal.', 'Oh, that is nasty.'],
};
// The pen, in pad units: the same weight as the drawings the checks were tuned on
const PEN = 7;
const SHEET = '#fffdf6';

// The drawing pad. A pen's place is measured against the pad itself: the Whiteboard's own measure (offsetX) is against
// whatever the pointer is over, and a stroke that strayed over the toast or the panel beside the pad jumped to wherever
// that thing's corner put it, drawing long lines nobody drew. Off the pad it's held to the edge, and the edge is where
// the pen lifts (see offPad). And one pen at a time: a palm resting on the screen doesn't draw a second line.
class Pad extends Whiteboard {
	getPosition({ clientX, clientY }) {
		const box = this.elem.getBoundingClientRect();

		return { x: clamp(clientX - box.left, 0, box.width), y: clamp(clientY - box.top, 0, box.height) };
	}

	interactionInit(event) {
		if (this._gesture.active) return;
		super.interactionInit(event);
	}
}

// A stroke with the pen lifted wherever it left the page (or the box a weapon is drawn in): what was past it is dropped,
// and the stroke goes on as a new one where the pen came back
const offPad = (line, { x0, y0, x1, y1 }) => {
	const out = [];
	let current = [];

	for (const point of line) {
		const edge = point.x <= x0 || point.y <= y0 || point.x >= x1 || point.y >= y1;

		if (edge) {
			if (current.length) out.push(current);
			current = [];
		} else current.push(point);
	}
	if (current.length) out.push(current);

	return out.filter(stroke => stroke.length > 1);
};

const Screen = styled(
	Component,
	({ space }) => `
		display: flex;
		flex: 1;
		min-height: 0;
		gap: ${space.lg};
		padding: ${space.md};
		justify-content: center;
		color: ${PENCIL};

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
	({ space }) => `
		display: flex;
		align-items: center;
		gap: ${space.md};
		font-size: 2em;
		white-space: nowrap;

		& .dots { margin-left: auto; display: flex; gap: 6px; }
		& .dots i { width: 14px; height: 14px; border: 2.5px solid ${PENCIL}; border-radius: 50% 45% 50% 40%; }
		& .dots i.done { background: ${PENCIL}; }
		& .dots i.now { background: #ffe36e; }
	`,
);

const Clock = styled(
	Component,
	() => `
		position: relative;
		height: 16px;
		border: 2.5px solid ${PENCIL};
		border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
		background: ${SHEET};
		overflow: hidden;

		& > div {
			position: absolute;
			inset: 0;
			transform-origin: left;
			background: #ffd34d;
		}

		&.low > div { background: #ff7a6b; }
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

		& canvas {
			border: 3px solid ${PENCIL};
			box-shadow: 3px 4px 0 ${PENCIL};
		}
	`,
);

const Tools = styled(
	Component,
	({ space }) => `
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: ${space.md};

		& button { padding: 10px; }
		& .big { grid-column: span 2; }

		@media (max-width: 767px) {
			grid-template-columns: repeat(4, 1fr);
			& .big { grid-column: span 1; }
		}
	`,
);

const Gallery = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-wrap: wrap;
		gap: ${space.sm};
		overflow: auto;
		min-height: 0;

		& canvas {
			width: 60px;
			height: 60px;
			background: ${SHEET};
			border: 2px solid ${PENCIL};
			border-radius: 10px 4px 12px 5px;
			transform: rotate(-2deg);
		}
		& canvas:nth-child(even) { transform: rotate(2deg); }
	`,
);

const Waiting = styled(
	Component,
	({ space }) => `
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: ${space.lg};
		font-size: 1.8em;
		text-align: center;

		& .side { display: flex; align-items: center; gap: ${space.md}; }
	`,
);

// The drawing page: a pad to draw the step's art on, a dashed example to show what's wanted, the clock draining, and
// beside it the tools and everything kept so far. A drawing is judged by the server when kept. Weapons are drawn in a
// box on the pad (the pen lifts at its edge), and what a weapon's shape makes it do is left for the battle to show.
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
		this.pad = new Pad({
			appendTo: this.padBox,
			background: SHEET,
			color: '#222',
			onLine: event => this.addStroke(event.detail.line),
		});
		this.waiting = new Waiting();

		const tools = new Tools({ appendTo: this.side });

		tools.append(
			doodle('keep', { title: 'Keep it (Enter)', big: true, size: '2em', onPress: () => this.keep() }),
			doodle('undo', { title: 'Undo (Z)', onPress: () => this.undo() }),
			doodle('clear', { title: 'Clear (C)', onPress: () => this.clear() }),
			doodle('next', { title: 'Done, next (N)', onPress: () => act('next') }),
		);
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
			this.tickClock();
			this.frame = requestAnimationFrame(run);
		};

		this.frame = requestAnimationFrame(run);
		this.addCleanup('frame', () => cancelAnimationFrame(this.frame));
	}

	// The pad made as big a square as fits, its pen scaled with it
	fit() {
		const { width, height } = this.padBox.elem.getBoundingClientRect();
		const size = Math.floor(Math.max(120, Math.min(width, height) - 8));

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
	 * @param {object} me - { team, sound }
	 */
	update(view, { team, sound }) {
		this.team = team;
		this.sound = sound;

		const mine = view.state.drawing[team];

		if (!mine || mine.done) return this.showWaiting(view);
		this.showPad();
		if (mine.step !== this.step) this.setStep(mine.step);

		const ends = performance.now() + mine.left * 1000;

		// Kept steady between views: only a jump of more than a beat moves the clock
		if (Math.abs(ends - this.deadline) > 1200) this.deadline = ends;
	}

	setStep(step) {
		const { kind, title } = STEPS[step];

		this.step = step;
		this.kind = kind;
		this.strokes = [];
		this.ghost = DEFAULT_RAW[kind]()[0];

		const dots = document.createElement('span');

		dots.className = 'dots';
		dots.append(
			...STEPS.map((_, at) => Object.assign(document.createElement('i'), { className: at < step ? 'done' : at === step ? 'now' : '' })),
		);
		this.heading.elem.replaceChildren(Object.assign(document.createElement('span'), { textContent: title }), dots);
		this.redraw();
		this.showKept();
	}

	setArt(art) {
		this.art = art;
		this.showKept();
	}

	showKept() {
		const items = this.art?.art?.[this.team]?.[this.kind] ?? [];

		this.count.elem.textContent = items.length ? `Kept: ${items.length}` : '';
		this.gallery.elem.replaceChildren(
			...items.map(item => {
				const canvas = document.createElement('canvas');

				canvas.width = canvas.height = 120;
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
		const area = this.kind === 'swords' ? WEAPON_AREA : { x0: 0, y0: 0, x1: PAD, y1: PAD };
		const pieces = offPad(line, { x0: area.x0 / k, y0: area.y0 / k, x1: area.x1 / k, y1: area.y1 / k });
		const first = !this.strokes.length;

		for (const piece of pieces) this.strokes.push(piece.map(({ x, y }) => ({ x: x * k, y: y * k })));
		// The first line wipes the example away; a line that left the pad is drawn again without what was off it
		if ((first && this.strokes.length) || pieces.length !== 1 || pieces[0].length !== line.length) this.redraw();
	}

	undo() {
		this.strokes.pop();
		this.redraw();
	}

	clear() {
		this.strokes = [];
		this.redraw();
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
		// Under the bar, clear of the pad, so it never sits under a pen
		new Notify({ x: window.innerWidth / 2, y: 70, intent: 'success', content: pick(PRAISE[kind]), timeout: 1500 });
		if (this.strokes === strokes) this.clear();
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
		// A weapon's box: drawn inside it, its handle at the bottom
		if (this.kind === 'swords') {
			const { x0, y0, x1, y1 } = WEAPON_AREA;

			g.strokeStyle = 'rgba(43,43,43,0.45)';
			g.lineWidth = 2.5 * k;
			g.setLineDash([12 * k, 9 * k]);
			g.strokeRect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k);
			g.setLineDash([]);
			g.strokeStyle = 'rgba(179,38,30,0.55)';
			g.lineWidth = 6 * k;
			g.beginPath();
			g.moveTo(((x0 + x1) / 2 - 30) * k, (y1 - 4) * k);
			g.lineTo(((x0 + x1) / 2 + 30) * k, (y1 - 4) * k);
			g.stroke();
		}
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

	// Done drawing (or only watching): who the battle waits on, each side's flag and how far along it is
	showWaiting(view) {
		this.main.elem.style.display = 'none';
		this.side.elem.style.display = 'none';
		if (!this.waiting.elem.isConnected) this.elem.append(this.waiting.elem);

		const { drawing, seats, mode } = view.state;
		const rows = (mode === 'duo' ? [0, 1] : [0]).map(t => {
			const row = document.createElement('div');
			const ink = TEAMS[t].ink;

			row.className = 'side';
			row.style.color = ink;
			row.append(icon('flag', { size: '1.4em', color: ink }));
			if (!seats[t]) row.append(icon('invite', { size: '1.4em', color: ink }), 'waiting for someone to join');
			else if (drawing[t].done) row.append(icon('person', { size: '1.4em', color: ink }), icon('keep', { size: '1.4em', color: ink }));
			else row.append(icon('person', { size: '1.4em', color: ink }), icon('draw', { size: '1.4em', color: ink }), `${drawing[t].step + 1} of ${STEPS.length}`);

			return row;
		});

		this.waiting.elem.replaceChildren(icon('hourglass', { size: '3em' }), ...rows);
	}
}
