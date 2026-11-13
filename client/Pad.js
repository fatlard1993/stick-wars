import { Whiteboard } from '@vanilla-bean/components';

import { LEAST_ACROSS, bboxOf, clamp } from '../art.js';

/** The pen, in pad units: the same weight as the drawings the checks were tuned on */
export const PEN = 7;
/** The paper a pad is */
export const SHEET = '#fffdf6';

/**
 * A drawing pad. A pen's place is measured against the pad itself, never the Whiteboard's offsetX (that's against
 * whatever element the pointer is over); off the pad it's held to the edge, where the pen lifts (see offPad). One pen at a
 * time: a palm resting on the screen doesn't draw a second line.
 */
export class Pad extends Whiteboard {
	getPosition({ clientX, clientY }) {
		const box = this.elem.getBoundingClientRect();

		return { x: clamp(clientX - box.left, 0, box.width), y: clamp(clientY - box.top, 0, box.height) };
	}

	interactionInit(event) {
		if (this._gesture.active) return;
		super.interactionInit(event);
	}
}

/**
 * A stroke with the pen lifted wherever it left the page (or the box a weapon is drawn in): what was past it is dropped,
 * and the stroke goes on as a new one where the pen came back
 */
export const offPad = (line, { x0, y0, x1, y1 }) => {
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

/** Strokes (in pad units) inked on a pad's canvas, k canvas pixels to a pad unit */
export const inkStrokes = (g, strokes, k) => {
	g.beginPath();
	for (const s of strokes) {
		g.moveTo(s[0].x * k, s[0].y * k);
		for (const p of s) g.lineTo(p.x * k, p.y * k);
	}
	g.stroke();
};

// What a page draws of each kind, by the name its size check knows it by
const ACROSS_OF = { stones: 'stone', ammo: 'ammo', shield: 'shield', wheels: 'wheel' };

/** For a drawing turned down: the ring of the smallest it may be, around it, if it was too small; null if not */
export const tooSmallRing = (kind, strokes) => {
	const least = LEAST_ACROSS[ACROSS_OF[kind]];
	const box = bboxOf(strokes.flat());

	return least && Math.max(box.w, box.h) < least ? { x: box.cx, y: box.cy, r: least / 2 } : null;
};

/** That ring, dashed in red pencil (k: canvas pixels per pad unit) */
export const drawRing = (g, ring, k) => {
	if (!ring) return;
	g.strokeStyle = 'rgba(179,38,30,0.8)';
	g.lineWidth = 3 * k;
	g.setLineDash([7 * k, 6 * k]);
	g.beginPath();
	g.arc(ring.x * k, ring.y * k, ring.r * k, 0, Math.PI * 2);
	g.stroke();
	g.setLineDash([]);
};
