// How the art is put on a canvas: a drawing as kept (raw strokes, for thumbnails), a normalized shape (stones, beams,
// ammo, weapons) filled and inked, a stick man skinned onto its joints, and the lined-paper battlefield.

import { BONES, TAU, allPts, bboxOf, clamp } from '../art.js';
import { ADJ, DEPTH, GROUND, H, SKEW_X, SKEW_Y, W } from '../field.js';
import { TEAMS } from '../rules.js';

export const INK = '#2b2b2b';
export const GORE = '#8e0d0d';
export const FILLS = { stone: '#c4bcad', hurt: '#8d8375', wood: '#b98a55', steel: '#cfd6dc', ammo: '#8f8a80' };
export const WOOD_INK = '#4a2f17';
export const PAPER = '#fffdf6';

const rgb = hex => {
	const n = parseInt(hex.slice(1), 16);

	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const mixColor = (a, b, t) => {
	const A = rgb(a), B = rgb(b), k = clamp(t, 0, 1);

	return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
};

/** A normalized shape ({ strokes, hull }) in whatever transform the context has: its hull filled, its lines inked */
export const drawShape = (g, shape, fill, ink, lw) => {
	const h = shape.hull;

	if (fill && h.length > 2) {
		g.beginPath();
		g.moveTo(h[0].x, h[0].y);
		for (let i = 1; i < h.length; i++) g.lineTo(h[i].x, h[i].y);
		g.closePath();
		g.fillStyle = fill;
		g.fill();
	}
	if (!ink) return;
	g.beginPath();
	for (const s of shape.strokes) {
		if (!s.length) continue;
		g.moveTo(s[0].x, s[0].y);
		for (let i = 1; i < s.length; i++) g.lineTo(s[i].x, s[i].y);
	}
	g.strokeStyle = ink;
	g.lineWidth = lw;
	g.stroke();
};

/**
 * A weapon as it was drawn, in whatever transform the context has: steel laid along every one of its lines (bloodier
 * the more it's used), the pencil over it. Never a fill under it, which would round off what was drawn.
 */
export const drawBlade = (g, shape, blood, lw) => {
	g.beginPath();
	for (const s of shape.strokes) {
		if (!s.length) continue;
		g.moveTo(s[0].x, s[0].y);
		for (let i = 1; i < s.length; i++) g.lineTo(s[i].x, s[i].y);
	}
	g.strokeStyle = mixColor(FILLS.steel, GORE, blood);
	g.lineWidth = lw * 3.4;
	g.stroke();
	g.strokeStyle = INK;
	g.lineWidth = lw;
	g.stroke();
};

/** A shape placed in the world: centered at x, y, turned a, stretched sx by sy, shifted ox along its length first */
export const placeShape = (g, shape, { x, y, a = 0, sx, sy, ox = 0 }, fill, ink, lw, blade = null) => {
	g.save();
	g.translate(x, y);
	g.rotate(a);
	g.scale(sx, sy);
	g.translate(-ox, 0);
	if (blade === null) drawShape(g, shape, fill, ink, lw / ((Math.abs(sx) + Math.abs(sy)) / 2));
	else drawBlade(g, shape, blade, lw / ((Math.abs(sx) + Math.abs(sy)) / 2));
	g.restore();
};

/** A drawing as it was drawn, fitted into a canvas: for the gallery of what's been kept */
export const drawRawFit = (canvas, strokes, color = '#222') => {
	const g = canvas.getContext('2d');
	const pts = allPts(strokes);

	g.clearRect(0, 0, canvas.width, canvas.height);
	if (!pts.length) return;

	const bb = bboxOf(pts), pad = canvas.width * 0.12;
	const s = Math.min((canvas.width - pad * 2) / Math.max(bb.w, 1), (canvas.height - pad * 2) / Math.max(bb.h, 1));

	g.save();
	g.translate(canvas.width / 2, canvas.height / 2);
	g.scale(s, s);
	g.translate(-bb.cx, -bb.cy);
	g.lineCap = g.lineJoin = 'round';
	g.strokeStyle = color;
	g.lineWidth = Math.max(2.5 / s, 5);
	g.beginPath();
	for (const st of strokes) {
		g.moveTo(st[0].x, st[0].y);
		for (let i = 1; i < st.length; i++) g.lineTo(st[i].x, st[i].y);
	}
	g.stroke();
	g.restore();
};

const FRAMES = new Float64Array(40);

/**
 * A stick man (or what's left of one) skinned onto its joints: each point of the drawing rides the bone it was bound
 * to, so the player's own lines walk, swing and come apart
 * @param {CanvasRenderingContext2D} g - Where
 * @param {object} rig - The drawing's rig
 * @param {object} body - { j: [x, y, ...] joints, o: owned-bones mask, f: facing, q: squash }
 * @param {string} color - Its side's ink
 * @param {number} [width] - Its line, in world units
 */
export const drawBody = (g, rig, body, color, width = 2.6) => {
	const { j, o, f = 1, q = 1 } = body;
	const F = FRAMES;

	for (let b = 0; b < 10; b++) {
		const [pa, pb] = BONES[b], k = b * 4;

		F[k] = j[pa * 2];
		F[k + 1] = j[pa * 2 + 1];
		F[k + 2] = j[pb * 2] - F[k];
		F[k + 3] = j[pb * 2 + 1] - F[k + 1];
	}
	g.beginPath();
	for (const st of rig.strokes) {
		let prev = -1;

		for (const p of st) {
			const b = p.b;

			if (!(o & (1 << b))) {
				prev = -1;
				continue;
			}

			const k = b * 4, dx = F[k + 2], dy = F[k + 3];
			const x = F[k] + p.u * dx - p.v * f * dy;
			let y = F[k + 1] + p.u * dy + p.v * f * dx;

			if (q < 1) y = GROUND - (GROUND - y) * q;
			if (prev < 0 || (prev !== b && !ADJ[prev][b])) g.moveTo(x, y);
			else g.lineTo(x, y);
			prev = b;
		}
	}
	g.strokeStyle = color;
	g.lineWidth = width;
	g.stroke();
};

let paper = null;

/** The battlefield's paper: lines, a margin, a scribbled sun and clouds, the ground hatched under its pencil line */
export const paperBackground = () => {
	if (paper) return paper;
	paper = document.createElement('canvas');
	paper.width = W;
	paper.height = H;

	const g = paper.getContext('2d');

	g.fillStyle = '#f7f2e4';
	g.fillRect(0, 0, W, H);
	g.strokeStyle = 'rgba(90,130,210,0.22)';
	g.lineWidth = 1.5;
	for (let y = 60; y < GROUND; y += 32) {
		g.beginPath();
		g.moveTo(0, y);
		g.lineTo(W, y);
		g.stroke();
	}
	g.strokeStyle = 'rgba(220,70,70,0.3)';
	g.beginPath();
	g.moveTo(40, 0);
	g.lineTo(40, H);
	g.stroke();
	g.lineCap = 'round';
	g.strokeStyle = 'rgba(60,60,60,0.45)';
	g.lineWidth = 2.5;
	g.beginPath();
	for (let i = 0; i <= 34; i++) {
		const a = (i / 32) * TAU, r = 38 + Math.sin(i * 1.7) * 2;
		const x = W / 2 + Math.cos(a) * r, y = 130 + Math.sin(a) * r;

		if (i) g.lineTo(x, y);
		else g.moveTo(x, y);
	}
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * TAU;

		g.moveTo(W / 2 + Math.cos(a) * 50, 130 + Math.sin(a) * 50);
		g.lineTo(W / 2 + Math.cos(a) * 68, 130 + Math.sin(a) * 68);
	}
	g.stroke();
	for (const [cx, cy, s] of [
		[300, 170, 1],
		[1100, 140, 1.2],
		[700, 260, 0.8],
	]) {
		g.beginPath();
		for (let k = 0; k < 4; k++) g.arc(cx + (k - 1.5) * 34 * s, cy + (k % 2 ? -10 : 4) * s, 26 * s, Math.PI * 0.9, Math.PI * 2.1);
		g.stroke();
	}
	// The field: a ground plane running back from the front edge, up and a little right, hatched in pencil
	const backY = GROUND - DEPTH * SKEW_Y, backX = DEPTH * SKEW_X;

	g.fillStyle = '#ece3cd';
	g.beginPath();
	g.moveTo(-50, GROUND);
	g.lineTo(W + 50, GROUND);
	g.lineTo(W + 50 + backX, backY);
	g.lineTo(-50 + backX, backY);
	g.closePath();
	g.fill();
	g.fillStyle = '#e4d9bf';
	g.fillRect(0, GROUND, W, H - GROUND);
	g.save();
	g.beginPath();
	g.rect(0, backY, W, H - backY);
	g.clip();
	g.strokeStyle = 'rgba(80,70,50,0.14)';
	g.lineWidth = 1.2;
	for (let x = -200; x < W + 200; x += 11) {
		g.beginPath();
		g.moveTo(x + backX, backY);
		g.lineTo(x, GROUND);
		g.lineTo(x - 30, H);
		g.stroke();
	}
	g.restore();
	g.strokeStyle = 'rgba(58,58,58,0.45)';
	g.lineWidth = 2;
	g.beginPath();
	g.moveTo(0, backY);
	g.lineTo(W, backY);
	g.stroke();
	g.strokeStyle = '#3a3a3a';
	g.lineWidth = 3;
	g.beginPath();
	for (let x = 0; x <= W; x += 20) {
		const y = GROUND + Math.sin(x * 0.05) * 0.8 + (Math.random() - 0.5) * 1.2;

		if (x) g.lineTo(x, y);
		else g.moveTo(x, y);
	}
	g.stroke();
	g.lineWidth = 1.5;
	g.strokeStyle = 'rgba(60,90,40,0.5)';
	for (let i = 0; i < 160; i++) {
		const z = Math.random() * DEPTH, x = Math.random() * W + z * SKEW_X, y = GROUND - z * SKEW_Y;

		g.beginPath();
		g.moveTo(x - 4, y - 6);
		g.lineTo(x, y);
		g.lineTo(x + 2, y - 8);
		g.lineTo(x + 3, y);
		g.stroke();
	}

	return paper;
};

export const teamInk = team => TEAMS[team]?.ink ?? INK;
