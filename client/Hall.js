import { Component, GET, Notify, styled } from '@vanilla-bean/components';
import { createGame } from '@fatlard1993/web-game-framework/client';

import { bboxOf } from '../art.js';
import { TEAMS } from '../rules.js';
import { icon } from './icons.js';
import { sitDown } from './Start.js';
import { PENCIL } from './theme.js';
import { Doodle, count } from './ui.js';

// A gladiator in the hall: its drawing, armor and shield on, its weapon beside it, its place and its record. Tapped, it's
// the one you'll fight.
const Card = styled(
	Doodle,
	({ space }) => `
		flex-direction: column;
		gap: ${space.xs};
		padding: ${space.sm};
		font-size: 1.2em;

		& canvas { width: 180px; height: 150px; }
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

// A gladiator drawn for its card: the warrior with its armor and shield (drawn over it, so they line up), its weapon by it
const drawGladiator = (canvas, gladiator) => {
	const ratio = window.devicePixelRatio || 1, g = canvas.getContext('2d');

	canvas.width = 180 * ratio;
	canvas.height = 150 * ratio;
	g.scale(ratio, ratio);
	fitInto(
		g,
		[
			gladiator.shield && { strokes: gladiator.shield, ink: '#5a3d1e', fill: '#c49563' },
			{ strokes: gladiator.warrior, ink: TEAMS[1].ink },
			gladiator.armor && { strokes: gladiator.armor, ink: '#59656e', width: 3.2 },
		].filter(Boolean),
		{ x: 4, y: 4, w: 120, h: 142 },
	);
	if (gladiator.weapon) fitInto(g, [{ strokes: gladiator.weapon, ink: PENCIL, width: 2 }], { x: 122, y: 10, w: 54, h: 130 });
};

/** The hall's tab: every gladiator kept in it, best record first; tap one to fight it */
export default class HallList {
	constructor(host) {
		this.cards = new Component({ appendTo: host, addClass: 'cards' });
		this.load();
	}

	async load() {
		const { body: gladiators = [] } = await GET('/hall', { apiId: 'hall', invalidateAfter: 0 });

		if (!gladiators.length) {
			// Nobody yet: an empty hall, waiting for a winner
			const empty = icon('trophy', { size: '5em' });

			empty.classList.add('empty');
			this.cards.elem.replaceChildren(empty);

			return;
		}
		this.cards.elem.replaceChildren(
			...gladiators.map((gladiator, at) => {
				const card = new Card({ title: 'Fight this one', onPointerPress: () => this.fight(gladiator) });
				const canvas = document.createElement('canvas');
				const record = document.createElement('div');

				record.className = 'record';
				record.append(count('trophy', gladiator.wins), count('skull', gladiator.losses));
				// Its name, once it's won enough to earn one
				const name = gladiator.name && Object.assign(document.createElement('div'), { className: 'name', textContent: gladiator.name });
				card.elem.style.position = 'relative';
				card.elem.append(Object.assign(document.createElement('span'), { className: 'place', textContent: `${at + 1}` }), canvas, ...(name ? [name] : []), record);
				drawGladiator(canvas, gladiator);

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
