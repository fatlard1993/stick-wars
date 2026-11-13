import { Component, GET, Notify, styled } from '@vanilla-bean/components';
import { createGame } from '@fatlard1993/web-game-framework/client';

import { bboxOf } from '../art.js';
import { TEAMS } from '../rules.js';
import { icon } from './icons.js';
import { sitDown } from './Start.js';
import { PENCIL, RED_PENCIL } from './theme.js';
import { Doodle, count } from './ui.js';

// A gladiator in the hall: its drawing, armor and shield on (its weapon is whatever it's handed next), its place and its
// record. Tapped, it's the one you'll fight.
const Card = styled(
	Doodle,
	({ space }) => `
		flex-direction: column;
		gap: ${space.xs};
		padding: ${space.sm};
		font-size: 1.2em;

		& canvas { width: 130px; height: 160px; }
		& .record { display: flex; gap: ${space.md}; align-items: center; }
		& .place { position: absolute; top: 6px; left: 10px; font-size: 1.1em; opacity: 0.7; }
		& .name { font-size: 1em; max-width: 170px; text-align: center; white-space: normal; line-height: 1.1; }
	`,
);

// Pieces of drawing (each { strokes, ink, fill }) drawn together, fitted into a part of a canvas, the box they share
const fitInto = (g, pieces, { x, y, w, h }) => {
	const box = bboxOf(pieces.flatMap(piece => piece.strokes).flat());
	const k = Math.min(w / Math.max(1, box.w), h / Math.max(1, box.h)) * 0.92;
	const ox = x + w / 2 - box.cx * k, oy = y + h / 2 - box.cy * k;

	g.lineCap = g.lineJoin = 'round';
	for (const { strokes, ink, fill, width = 2.4 } of pieces) {
		g.beginPath();
		for (const stroke of strokes) {
			stroke.forEach((p, i) => (i ? g.lineTo(ox + p.x * k, oy + p.y * k) : g.moveTo(ox + p.x * k, oy + p.y * k)));
		}
		if (fill) {
			g.fillStyle = fill;
			g.globalAlpha = 0.8;
			g.fill();
			g.globalAlpha = 1;
		}
		g.strokeStyle = ink;
		g.lineWidth = width;
		g.stroke();
	}
};

/** A gladiator drawn for a card: the warrior with its armor and shield on (drawn over it, so they line up), no weapon */
export const drawGladiator = (canvas, gladiator, w = 130, h = 160) => {
	const ratio = window.devicePixelRatio || 1, g = canvas.getContext('2d');

	canvas.width = w * ratio;
	canvas.height = h * ratio;
	g.scale(ratio, ratio);
	fitInto(
		g,
		[
			gladiator.shield && { strokes: gladiator.shield, ink: '#5a3d1e', fill: '#c49563' },
			{ strokes: gladiator.warrior, ink: TEAMS[1].ink },
			gladiator.armor && { strokes: gladiator.armor, ink: '#59656e', width: 3.2 },
		].filter(Boolean),
		{ x: 4, y: 4, w: w - 8, h: h - 8 },
	);
};

/** The hall's tab: every gladiator kept in it, best record first; tap one to fight it. The fallen's tab is the same,
 * for those the crowd gave the thumbs down: greyed, and not to be fought. */
export default class HallList {
	constructor(host, { fallen = false } = {}) {
		this.fallen = fallen;
		this.cards = new Component({ appendTo: host, addClass: 'cards' });
		this.load();
	}

	async load() {
		const { body } = await GET(this.fallen ? '/fallen' : '/hall', { apiId: this.fallen ? 'fallen' : 'hall', invalidateAfter: 0 });
		const gladiators = Array.isArray(body) ? body : [];

		if (!gladiators.length) {
			// Nobody yet: an empty hall, waiting for a winner (or no one fallen)
			const empty = icon(this.fallen ? 'skull' : 'trophy', { size: '5em' });

			empty.classList.add('empty');
			this.cards.elem.replaceChildren(empty);

			return;
		}
		this.cards.elem.replaceChildren(
			...gladiators.map((gladiator, at) => {
				const card = new Card(this.fallen ? { title: 'Fallen', disabled: false } : { title: 'Fight this one', onPointerPress: () => this.fight(gladiator) });
				const canvas = document.createElement('canvas');
				const record = document.createElement('div');

				record.className = 'record';
				record.append(count('trophy', gladiator.wins), count('skull', gladiator.losses));
				// Its name, once it's won enough to earn one
				const name = gladiator.name && Object.assign(document.createElement('div'), { className: 'name', textContent: gladiator.name });
				card.elem.style.position = 'relative';
				card.elem.append(...(this.fallen ? [] : [Object.assign(document.createElement('span'), { className: 'place', textContent: `${at + 1}` })]), canvas, ...(name ? [name] : []), record);
				drawGladiator(canvas, gladiator);
				// The fallen: faded, a thumb down over them
				if (this.fallen) {
					canvas.style.opacity = '0.55';
					canvas.style.filter = 'grayscale(1)';
					card.elem.style.cursor = 'default';
					card.elem.append(Object.assign(icon('thumbDown', { size: '2em', color: RED_PENCIL }), { style: 'position: absolute; top: 6px; right: 8px' }));
				}

				return card.elem;
			}),
		);
	}

	// A new fight against this one: draw your gladiator, and it's waiting in the arena
	async fight(gladiator) {
		try {
			const name = `gladiators, against a champion ${new Date().toLocaleTimeString()}`;

			await sitDown((await createGame({ body: { name, mode: 'cpu', style: 'gladiator', rival: gladiator.id } })).body);
		} catch (error) {
			console.error('Could not start the fight', error);
			new Notify({ x: window.innerWidth / 2, y: 120, intent: 'warning', content: 'That did not work. Try again?', timeout: 3000 });
		}
	}
}
