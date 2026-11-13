import { Component, styled } from '@vanilla-bean/components';
import { act } from '@fatlard1993/web-game-framework/client';

import { DEFAULT_RAW, PAD, clamp } from '../art.js';
import { icon } from './icons.js';
import { holdReload } from './freshPage.js';
import { PEN, Pad, SHEET, drawRing, inkStrokes, isDot, offPad, tooSmallRing } from './Pad.js';
import { PENCIL } from './theme.js';
import { doodle } from './ui.js';

const Corner = styled(
	Component,
	({ space }) => `
		position: absolute;
		left: ${space.sm};
		bottom: calc(var(--controls, 0px) + ${space.sm});
		display: flex;
		flex-direction: column-reverse;
		align-items: flex-start;
		gap: ${space.sm};
		pointer-events: none;
		color: ${PENCIL};

		/* In the corner away from its own side, so its catapult and army stay in sight */
		&.right { left: auto; right: ${space.sm}; align-items: flex-end; }
		& > * { pointer-events: auto; }
		& .hidden { display: none; }
		& .rocks { font-size: 1.3em; }
		/* The catapult is empty and there are rocks to draw: the button asks for one */
		& .rocks.wanted { background: #ffe36e; animation: wanted 1.2s ease-in-out infinite; }
		@keyframes wanted { 50% { transform: rotate(-4deg) scale(1.08); } }
	`,
);

const Panel = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-direction: column;
		gap: ${space.xs};
		padding: ${space.sm};
		background: rgba(255, 253, 246, 0.92);
		border: 2.5px solid ${PENCIL};
		border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
		box-shadow: 3px 4px 0 ${PENCIL};
		touch-action: none;
		user-select: none;
		transform: rotate(-0.5deg);

		& canvas { border: 2px solid ${PENCIL}; touch-action: none; }
		& .bar { display: flex; align-items: center; gap: ${space.xs}; font-size: 1.2em; }
		& .bar .left { display: inline-flex; align-items: center; margin-left: auto; }
		& .bar button { padding: 3px 10px; }
	`,
);

/**
 * The catapult's rocks, drawn during the battle: a button in the field's corner showing how many are still to draw
 * (asking for one when the catapult is empty), opening a small pad to draw one on. Each kept rock goes onto the catapult's
 * pile, if it passes the ammo check.
 * @param {object} options - { onOpen() when the pad opens }; its `sound` is set by the battle
 */
export default class RockPad extends Corner {
	static schema = { onOpen: { data: true } };

	build() {
		super.build();
		this.strokes = [];
		this.open = false;
		this.ghost = DEFAULT_RAW.ammo()[0];

		this.button = doodle('rock', { title: 'Draw a rock for the catapult (D)', size: '2em', addClass: 'rocks', onPress: () => this.toggle() });
		this.count = document.createElement('span');
		this.button.elem.append(this.count);
		this.panel = new Panel({ addClass: 'hidden' });
		this.elem.append(this.button.elem, this.panel.elem);

		this.size = Math.round(clamp(Math.min(window.innerWidth * 0.5, window.innerHeight * 0.3), 150, 230));
		this.pad = new Pad({
			appendTo: this.panel,
			width: `${this.size}px`,
			height: `${this.size}px`,
			lineWidth: (PEN * this.size) / PAD,
			background: SHEET,
			color: '#222',
			onLine: event => this.addStroke(event.detail.line),
		});

		const bar = document.createElement('div');

		bar.className = 'bar';
		this.left = document.createElement('span');
		this.left.className = 'left';
		bar.append(
			doodle('keep', { title: 'Throw it on the pile (Enter)', onPress: () => this.keep() }).elem,
			doodle('undo', { title: 'Undo', onPress: () => this.undo() }).elem,
			this.left,
			doodle('empty', { title: 'Put it away (D)', onPress: () => this.toggle(false) }).elem,
		);
		this.panel.elem.append(bar);
		// What's drawn here is the pad's alone: the battlefield's own presses and drags don't hear it
		this.panel.elem.addEventListener('pointerdown', event => event.stopPropagation());
		requestAnimationFrame(() => this.redraw());
		// No reloading for a newer build with a rock half drawn
		this.addCleanup('holdReload', holdReload(() => this.open && this.strokes.length > 0));
	}

	/** How many rocks are still to draw this battle, whether the catapult is empty and waiting for one, and whose it is */
	show(left, wanted, team) {
		this.elem.classList.toggle('right', team === 0);
		this.leftCount = left;
		this.button.elem.classList.toggle('hidden', left <= 0 || this.open);
		this.button.elem.classList.toggle('wanted', wanted && left > 0 && !this.open);
		this.count.textContent = String(left);
		this.left.replaceChildren(icon('rock', { size: '1.2em' }), String(left));
		if (left <= 0 && this.open) this.toggle(false);
	}

	toggle(open = !this.open) {
		if (open && !(this.leftCount > 0)) return;
		this.open = open;
		this.panel.elem.classList.toggle('hidden', !open);
		this.button.elem.classList.toggle('hidden', open || !(this.leftCount > 0));
		if (open) this.options.onOpen?.();
		this.redraw();
	}

	addStroke(line) {
		if (!line?.length) return;

		const k = PAD / this.size;
		const first = !this.strokes.length;
		const pieces = offPad(line, { x0: 0, y0: 0, x1: this.size, y1: this.size });

		if (this.ring) {
			this.ring = null;
			this.redraw();
		}
		for (const piece of pieces) this.strokes.push(piece.map(({ x, y }) => ({ x: x * k, y: y * k })));
		if ((first && this.strokes.length) || pieces.length !== 1 || pieces[0].length !== line.length || pieces.some(isDot)) this.redraw();
	}

	undo() {
		this.strokes.pop();
		this.ring = null;
		this.redraw();
	}

	async keep() {
		if (!this.open || !this.strokes.length || this.keeping) return;

		const strokes = this.strokes;

		this.keeping = true;

		const said = await act('rock', { strokes }).finally(() => (this.keeping = false));

		if (!said.ok) {
			// Too small: the smallest a rock may be, ringed around it
			if (this.strokes === strokes && (this.ring = tooSmallRing('ammo', strokes))) this.redraw();

			return this.sound?.play('nope');
		}
		this.sound?.play('keep');
		if (this.strokes === strokes) {
			this.strokes = [];
			this.redraw();
		}
	}

	redraw() {
		const g = this.pad.canvas, k = this.size / PAD;

		if (!g) return;
		this.pad.clearCanvas();
		g.lineCap = g.lineJoin = 'round';
		if (!this.strokes.length) {
			g.setLineDash([10 * k, 12 * k]);
			g.strokeStyle = 'rgba(0,0,0,0.13)';
			g.lineWidth = 6 * k;
			inkStrokes(g, this.ghost, k);
			g.setLineDash([]);
		}
		g.strokeStyle = '#222';
		g.lineWidth = PEN * k;
		inkStrokes(g, this.strokes, k);
		drawRing(g, this.ring, k);
		this.pad.inkLive(PEN * k);
	}
}
