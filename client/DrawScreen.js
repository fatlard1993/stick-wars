import { Component, Notify, styled } from '@vanilla-bean/components';
import { JoinCard } from '@fatlard1993/web-game-framework/ui';
import { act, createInput } from '@fatlard1993/web-game-framework/client';

import { DEFAULT_RAW, PAD, WEAPON_AREA, clamp, freshOf, pick } from '../art.js';
import { STYLES, TEAMS, stepsOf } from '../rules.js';
import BorrowPicker from './BorrowPicker.js';
import { holdReload } from './freshPage.js';
import HallPicker from './HallPicker.js';
import { icon } from './icons.js';
import { PEN, Pad, SHEET, drawRing, inkStrokes, isDot, offPad, tooSmallRing } from './Pad.js';
import { drawRawFit } from './paint.js';
import { PENCIL } from './theme.js';
import { doodle } from './ui.js';

const PRAISE = {
	stickmen: ['Recruited!', 'Fresh meat!', 'Enlisted!', 'Another one for the grinder!'],
	stones: ['Solid.', 'Rock on.', 'Stacked!'],
	beams: ['Timber!', 'Sturdy.', 'Nailed it.'],
	ammo: ['Loaded!', 'That will hurt.', 'Incoming!'],
	wheels: ['Rolling!', 'Round enough.', 'Wheee.'],
	swords: ['Sharp!', 'Brutal.', 'Oh, that is nasty.'],
	armor: ['Clank!', 'Tin can!', 'Well wrapped.'],
	shield: ['Blocked!', 'Hide behind that.', 'Sturdy.'],
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
			justify-content: flex-start;
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

const Main = styled(
	Column,
	() => `
		flex: 1;
		max-width: 900px;

		/* A phone held upright: everything stacked from the top, not spread over the height */
		@media (max-width: 767px) {
			flex: none;
		}
	`,
);

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

		@media (max-width: 767px) {
			font-size: 1.4em;
		}

		/* The title gives way first (cut short) so the counts and dots always fit */
		& > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
		& .dots { margin-left: auto; display: flex; gap: 6px; flex-shrink: 0; }
		& .dots i { width: 14px; height: 14px; border: 2.5px solid ${PENCIL}; border-radius: 50% 45% 50% 40%; }
		@media (max-width: 480px) {
			gap: ${space.sm};
			& .dots { gap: 4px; }
			& .dots i { width: 10px; height: 10px; border-width: 2px; }
		}
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

		/* On a narrow phone the pad is as wide as the screen, square, with the tools right under it */
		@media (max-width: 767px) {
			flex: none;
			width: 100%;
			aspect-ratio: 1;
			max-height: 62vh;
		}

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
		/* Too like one kept before it: it fights, but earns no extra man */
		& canvas.copy { opacity: 0.35; border-style: dashed; }
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
// How far a side drawing is along, as the pages show it: a dot a page (done, this one, to come) and its clock running
// down, or a pause sign while its player's page is closed (its clock stopped)
// How often a page sends its drawing as it's drawn, in ms, and how big another's is shown while waiting, in CSS pixels
const SKETCH_EVERY = 300, SKETCH_SIZE = 150;

const progressOf = (view, t, ink) => {
	const steps = stepsOf(view.state), { step, left } = view.state.drawing[t];
	const dots = document.createElement('span');
	const clock = document.createElement('span');
	const fill = document.createElement('span');
	const away = view.away?.includes(t);

	dots.style.cssText = 'display: inline-flex; gap: 4px';
	dots.append(
		...steps.map((_, at) => {
			const dot = document.createElement('i');

			dot.style.cssText = `width: 12px; height: 12px; border: 2px solid ${ink}; border-radius: 50%; background: ${at < step ? ink : at === step ? '#ffe36e' : 'transparent'}`;

			return dot;
		}),
	);
	clock.style.cssText = `display: inline-block; width: 90px; height: 12px; border: 2px solid ${ink}; border-radius: 6px; overflow: hidden`;
	fill.style.cssText = `display: block; height: 100%; width: ${clamp((left / (steps[step]?.seconds || 1)) * 100, 0, 100)}%; background: ${away ? 'rgba(43,43,43,0.25)' : ink}; transition: width 1s linear`;
	clock.append(fill);

	return [dots, clock, ...(away ? [icon('pause', { size: '1.4em', color: ink })] : [])];
};

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
			(this.nextButton = doodle('next', { title: 'Done, next (N)', onPress: () => act('next') })),
		);
		// On the weapon page: borrow one from the armory instead of drawing it
		this.picker = new BorrowPicker({ appendTo: document.body });
		this.addCleanup('picker', () => this.picker.elem.remove());
		this.borrowButton = doodle('rack', { title: 'Borrow one from the armory', size: '2em', onPress: () => this.picker.open() });
		// On a gladiator's first page: enlist one from the hall instead of drawing one
		this.hallPicker = new HallPicker({ appendTo: document.body });
		this.addCleanup('hallPicker', () => this.hallPicker.elem.remove());
		this.enlistButton = doodle('trophy', { title: 'Enlist one from the hall', size: '2em', onPress: () => this.hallPicker.open() });
		this.side.elem.append(this.borrowButton.elem, this.enlistButton.elem);
		this.count = new Component({ appendTo: this.side });
		this.gallery = new Gallery({ appendTo: this.side });

		// The page as it's drawn, sent now and then (when it's changed) for the others to watch; theirs, as they come
		this.sketches = {};
		this.sentSketch = '';
		this.sketchTimer = setInterval(() => this.sendSketch(), SKETCH_EVERY);
		// No reloading for a newer build mid-line, or with a drawing on the pad not yet kept
		this.addCleanup('holdReload', holdReload(() => this.strokes.length > 0 || Object.keys(this.pad.pointers ?? {}).length > 0));
		this.addCleanup('sketch', () => clearInterval(this.sketchTimer));

		this.input = createInput({
			keys: { keep: ['Enter'], undo: ['z', 'Z'], clear: ['c', 'C'], next: ['n', 'N'] },
			onPress: name => (name === 'next' ? this.nextButton.elem.style.display !== 'none' && act('next') : this[name]?.()),
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
	update(view, { team, sound, playerId, tv, gameId }) {
		this.team = team;
		this.sound = sound;
		this.playerId = playerId;
		this.tv = tv;
		this.gameId = gameId;
		this.steps = stepsOf(view.state);

		// A tournament's player draws on their own pages; anyone else on their seat's
		const mine = view.you?.drawing ?? view.state.drawing[team];

		if (!mine || mine.done) return this.showWaiting(view);
		this.showPad();
		if (mine.step !== this.step) this.setStep(mine.step);
		// The time saved so far for the wheels page, shown on the pages before it
		const banked = this.steps.find(step => step.banked);

		if (this.bankBadge) {
			this.bankBadge.style.display = banked && !this.steps[mine.step].banked ? 'inline-flex' : 'none';
			if (banked) this.bankBadge.replaceChildren(icon('wheel', { size: '1.2em' }), `${Math.floor(Math.min(mine.bank ?? 0, banked.seconds))}`);
		}

		const ends = performance.now() + mine.left * 1000;

		// Kept steady between views: only a jump of more than a beat moves the clock
		if (Math.abs(ends - this.deadline) > 1200) this.deadline = ends;
	}

	setStep(step) {
		const { kind, title } = this.steps[step];

		this.step = step;
		this.kind = kind;
		this.strokes = [];
		// The dashed example; armor has none, as it's drawn over the warrior shown under it
		this.ghost = DEFAULT_RAW[kind]?.()[0] ?? null;

		const dots = document.createElement('span');

		dots.className = 'dots';
		dots.append(
			...this.steps.map((_, at) => Object.assign(document.createElement('i'), { className: at < step ? 'done' : at === step ? 'now' : '' })),
		);
		this.bankBadge = Object.assign(document.createElement('span'), { title: 'Time saved for the wheels' });
		this.bankBadge.style.cssText = 'display: none; align-items: center; gap: 3px; margin-left: auto; flex-shrink: 0; font-size: 0.9em; opacity: 0.8';
		this.heading.elem.replaceChildren(Object.assign(document.createElement('span'), { textContent: title }), this.bankBadge, dots);
		this.borrowButton.elem.style.display = kind === 'swords' ? '' : 'none';
		this.enlistButton.elem.style.display = kind === 'stickmen' && this.steps === STYLES.gladiator ? '' : 'none';
		// No skipping a gladiator: it's drawn, or enlisted from the hall
		this.nextButton.elem.style.display = kind === 'stickmen' && this.steps === STYLES.gladiator ? 'none' : '';
		this.picker.close();
		this.hallPicker.close();
		this.redraw();
		this.showKept();
	}

	setArt(art) {
		this.art = art;
		this.showKept();
		this.redraw();
	}

	showKept() {
		const items = this.myArt()?.[this.kind] ?? [];

		this.count.elem.textContent = items.length ? `Kept: ${items.length}` : '';

		// In a war, a stick man or weapon too like one kept before earns no extra man: shown faded
		const counts = this.steps === STYLES.war && (this.kind === 'stickmen' || this.kind === 'swords');
		const fresh = counts ? freshOf(this.kind, items) : items.map(() => true);

		this.gallery.elem.replaceChildren(
			...items.map((item, at) => {
				const canvas = document.createElement('canvas');

				if (!fresh[at]) canvas.className = 'copy';
				canvas.width = canvas.height = 120;
				drawRawFit(canvas, item.raw);

				return canvas;
			}),
		);
	}

	tickClock() {
		if (this.step < 0) return;

		const left = Math.max(0, (this.deadline - performance.now()) / 1000);
		const of = this.steps[this.step].seconds;

		this.clockBar.style.transform = `scaleX(${clamp(left / of, 0, 1)})`;
		this.clock.elem.classList.toggle('low', left < 6);
	}

	addStroke(line) {
		if (!this.size || !line?.length) return;

		const k = PAD / this.size;
		const area = this.kind === 'swords' ? WEAPON_AREA : { x0: 0, y0: 0, x1: PAD, y1: PAD };
		const pieces = offPad(line, { x0: area.x0 / k, y0: area.y0 / k, x1: area.x1 / k, y1: area.y1 / k });
		const first = !this.strokes.length;

		// Drawing again: the ring showing how big is big enough has done its job
		if (this.ring) {
			this.ring = null;
			this.redraw();
		}
		for (const piece of pieces) this.strokes.push(piece.map(({ x, y }) => ({ x: x * k, y: y * k })));
		// The first line wipes the example away; a line that left the pad is drawn again without what was off it; a dot
		// is drawn by the page itself
		if ((first && this.strokes.length) || pieces.length !== 1 || pieces[0].length !== line.length || pieces.some(isDot)) this.redraw();
	}

	undo() {
		this.strokes.pop();
		this.ring = null;
		this.redraw();
	}

	clear() {
		this.strokes = [];
		this.ring = null;
		this.redraw();
	}

	async keep() {
		// One keep at a time: a double tap (or a tap and Enter) sends one drawing, not two
		if (!this.strokes.length || this.keeping) return;

		const { kind } = this;
		const strokes = this.strokes;

		this.keeping = true;

		const said = await act('keep', { strokes }).finally(() => (this.keeping = false));

		if (!said.ok) {
			this.sound?.play('nope');
			// Too small: the smallest it may be, drawn as a ring around it, so the next one's drawn big enough
			if (this.strokes === strokes && (this.ring = tooSmallRing(kind, strokes))) this.redraw();

			return;
		}
		this.sound?.play('keep');
		// Under the bar, clear of the pad, so it never sits under a pen; a copy of one kept is told it earns nothing more
		const copy = said.result?.fresh === false;

		new Notify({ x: window.innerWidth / 2, y: 70, intent: copy ? 'warning' : 'success', content: copy ? 'Too like one you have.' : pick(PRAISE[kind]), timeout: 1800 });
		if (this.strokes === strokes) this.clear();
	}

	redraw() {
		if (!this.size) return;

		const g = this.pad.canvas, k = this.size / PAD;
		const path = strokes => inkStrokes(g, strokes, k);

		this.pad.clearCanvas();
		g.lineCap = g.lineJoin = 'round';
		// Armor and a shield are drawn for the warrior: shown faintly under them, in its side's ink
		const warrior = (this.kind === 'armor' || this.kind === 'shield') && this.myArt()?.stickmen?.[0];

		if (warrior) {
			g.strokeStyle = TEAMS[Math.max(0, this.team)].ink;
			g.globalAlpha = 0.35;
			g.lineWidth = PEN * k;
			path(warrior.raw);
			g.globalAlpha = 1;
		}
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
		drawRing(g, this.ring, k);
		this.pad.inkLive(PEN * k);
	}

	showPad() {
		if (!this.waiting.elem.isConnected) return;
		this.waiting.elem.remove();
		this.main.elem.style.display = '';
		this.side.elem.style.display = '';
	}

	// Done drawing (or only watching): who the battle waits on, each side's flag and how far along it is
	// This page's drawing as it stands, the line under the pen too, out to the others if it's changed
	sendSketch() {
		if (!this.size || this.waiting.elem.isConnected || this.tv) return;

		const k = PAD / this.size;
		const live = Object.values(this.pad.pointers ?? {}).map(pointer => (pointer.line ?? []).map(({ x, y }) => ({ x: x * k, y: y * k })));
		const strokes = [...this.strokes, ...live.filter(line => line.length)].map(stroke => stroke.filter((_, i) => i % 2 === 0 || i === stroke.length - 1));
		const said = JSON.stringify(strokes.map(stroke => stroke.length) ) + (strokes.at(-1)?.at(-1)?.x ?? '');

		if (said === this.sentSketch) return;
		this.sentSketch = said;
		act('sketch', { strokes }, { quiet: true });
	}

	/** Another's page as they draw it: kept by whose, and drawn on the waiting screen if it's up */
	setSketch({ who, step, strokes }) {
		this.sketches[who] = { step, strokes };
		this.inkSketch(who);
	}

	// One side's sketch on its little page on the waiting screen (made once, drawn again as it changes)
	inkSketch(who) {
		const canvas = (this.sketchPages ??= {})[who];
		const sketch = this.sketches[who];

		if (!canvas) return;

		const ratio = window.devicePixelRatio || 1, size = SKETCH_SIZE, g = canvas.getContext('2d');

		if (!canvas.dataset.sized) {
			canvas.dataset.sized = 'yes';
			canvas.width = canvas.height = size * ratio;
			canvas.style.cssText = `width: ${size}px; height: ${size}px; background: ${SHEET}; border: 2.5px solid ${canvas.dataset.ink}; border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px; box-shadow: 2px 3px 0 ${PENCIL}`;
		}
		g.setTransform(ratio, 0, 0, ratio, 0, 0);
		g.clearRect(0, 0, size, size);
		g.strokeStyle = canvas.dataset.ink;
		g.lineWidth = Math.max(1.5, (PEN * size) / PAD);
		g.lineCap = g.lineJoin = 'round';
		if (sketch?.strokes?.length) inkStrokes(g, sketch.strokes, size / PAD);
	}

	// On a TV, while there's room to join: the code a phone scans to sit down (made once, kept)
	joinCode(view) {
		const { mode, seats, bracket, entrants = [] } = view.state;
		const room = mode === 'tournament' ? !bracket && entrants.filter(e => !e.gone).length < 8 : mode === 'duo' && seats.includes(null);

		if (!this.tv || !room) return [];
		this.joinCard ??= new JoinCard({ gameId: this.gameId });

		return [this.joinCard.elem];
	}

	// This page's own art: its tournament entrant's, or its seat's
	myArt() {
		return this.art?.entrants?.[this.playerId] ?? this.art?.art?.[this.team];
	}

	// A tournament gathering: everyone in, each drawing or done; the first player starts it once nobody's still drawing
	showGathering(view) {
		const { entrants, host } = view.state;
		const here = entrants.filter(entrant => !entrant.gone);
		const people = document.createElement('div');

		people.className = 'side';
		people.style.flexWrap = 'wrap';
		people.style.justifyContent = 'center';
		for (const entrant of here) {
			const one = document.createElement('span');

			one.style.display = 'inline-flex';
			one.append(icon('person', { size: '1.4em' }), icon(entrant.done ? 'keep' : 'draw', { size: '1.2em' }));
			people.append(one);
		}

		const ready = here.length >= 2 && here.every(entrant => entrant.done);
		const go =
			this.playerId === host
				? doodle('bracket', { title: 'Start the tournament', big: true, size: '2.6em', disabled: !ready, onPress: () => act('start') })
				: null;

		if (go && !ready) go.elem.style.opacity = '0.4';
		this.waiting.elem.replaceChildren(icon(ready ? 'bracket' : 'hourglass', { size: '3em' }), people, ...(go ? [go.elem] : []), ...this.joinCode(view));
	}

	/** Done drawing (or only watching), waiting on the others: who, how far along each is (its pages, its clock running
	 * down, or paused while its page is closed) */
	showWaiting(view) {
		this.main.elem.style.display = 'none';
		this.side.elem.style.display = 'none';
		if (!this.waiting.elem.isConnected) this.elem.append(this.waiting.elem);
		if (view.state.mode === 'tournament') return this.showGathering(view);

		const { drawing, seats, mode } = view.state;
		const rows = (mode === 'duo' ? [0, 1] : [0]).map(t => {
			const row = document.createElement('div');
			const ink = TEAMS[t].ink;

			row.className = 'side';
			row.style.color = ink;
			row.append(icon('flag', { size: '1.4em', color: ink }));
			if (!seats[t]) row.append(icon('invite', { size: '1.4em', color: ink }), 'waiting for someone to join');
			else if (drawing[t].done) row.append(icon('person', { size: '1.4em', color: ink }), icon('keep', { size: '1.4em', color: ink }));
			else {
				row.append(icon('person', { size: '1.4em', color: ink }), icon('redraw', { size: '1.4em', color: ink }), ...progressOf(view, t, ink));
				// Their page as they draw it, live
				const page = ((this.sketchPages ??= {})[t] ??= document.createElement('canvas'));

				page.dataset.ink = ink;
				this.inkSketch(t);

				return [row, page];
			}

			return [row];
		}).flat();

		this.waiting.elem.replaceChildren(icon('hourglass', { size: '3em' }), ...rows, ...this.joinCode(view));
	}
}
