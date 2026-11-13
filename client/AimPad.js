import { Component, styled } from '@vanilla-bean/components';

import { clamp } from '../art.js';
import { FLING_ANGLES, catRange, flingAngle, flingFor } from '../field.js';
import { icon } from './icons.js';
import { HAND, PENCIL, RED_PENCIL } from './theme.js';
import { doodle } from './ui.js';

// How big the pad is drawn, at most, in CSS pixels
const MOST_SIZE = 260;

const Pad = styled(
	Component,
	({ space }) => `
		position: absolute;
		left: 50%;
		top: 12%;
		transform: translateX(-50%) rotate(-1deg);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: ${space.xs};
		padding: ${space.sm} ${space.md} ${space.md};
		/* Mostly see-through: the field and the arcs it aims show behind it */
		background: rgba(255, 253, 246, 0.28);
		border: 2.5px solid rgba(43, 43, 43, 0.55);
		border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
		box-shadow: none;
		touch-action: none;
		user-select: none;

		&.hidden { display: none; }

		/* Upright on a phone: below the overview strip */
		@media (orientation: portrait) and (max-width: 900px) {
			top: 22%;
		}
		& .bar { display: flex; align-items: center; gap: ${space.sm}; width: 100%; font-size: 1.3em; }
		& .bar .close { margin-left: auto; padding: 2px 8px; }
		& canvas { touch-action: none; cursor: crosshair; }
	`,
);

/**
 * The aiming pad: shown while the catapult is picked out, in the middle of the screen where there's room to pull. Pulled
 * back from its centre like a slingshot, it aims the other way, full strength at its edge; let go, and that's the
 * catapult's aim, which it fires at by itself whenever it's ready, until it's aimed again or told to hold its fire.
 * @param {object} options - { onAim(velocity or null) while pulling, onFire(velocity) on letting go, onHold(), onClose() }
 */
export default class AimPad extends Pad {
	static schema = { onAim: { data: true }, onFire: { data: true }, onClose: { data: true }, onHold: { data: true }, onRoll: { data: true } };

	build() {
		super.build();
		this.elem.classList.add('hidden', 'aim-pad');
		this.pull = null;

		const bar = document.createElement('div');

		bar.className = 'bar';
		this.label = document.createElement('span');
		bar.append(this.label);

		const close = doodle('empty', { title: 'Done aiming (Esc)', addClass: 'close', onPress: () => this.options.onClose?.() });

		this.holdButton = doodle('pause', { title: 'Hold its fire', onPress: () => this.options.onHold?.() });
		// Roll it back toward home, or on toward the enemy: its crew push it, and its reach goes with it
		this.backButton = doodle('roll', { title: 'Roll it back', onPress: () => this.options.onRoll?.(-1) });
		this.onButton = doodle('roll', { title: 'Roll it forward', onPress: () => this.options.onRoll?.(1) });
		bar.append(this.backButton.elem, this.onButton.elem, this.holdButton.elem, close.elem);
		this.canvas = document.createElement('canvas');
		this.elem.append(bar, this.canvas);
		this.context = this.canvas.getContext('2d');

		const point = event => {
			const box = this.canvas.getBoundingClientRect();

			return { x: event.clientX - box.left - box.width / 2, y: event.clientY - box.top - box.height / 2 };
		};

		this.canvas.addEventListener('pointerdown', event => {
			event.preventDefault();
			event.stopPropagation();
			this.canvas.setPointerCapture(event.pointerId);
			this.pull = point(event);
			this.aimed();
		});
		this.canvas.addEventListener('pointermove', event => {
			if (!this.pull) return;
			this.pull = point(event);
			this.aimed();
		});

		const release = event => {
			if (!this.pull) return;

			const v = this.velocity();

			this.pull = null;
			this.options.onAim?.(null);
			this.draw();
			if (event.type === 'pointerup' && Math.hypot(...v) > 90) this.options.onFire?.(v);
		};

		this.canvas.addEventListener('pointerup', release);
		this.canvas.addEventListener('pointercancel', release);
	}

	/** Shown for the catapult when it's picked (whether it's aimed, firing by itself; where it is), or put away */
	show(picked, aimed, ink, team, cat) {
		this.team = team;
		this.elem.classList.toggle('hidden', !picked);
		if (!picked) {
			this.pull = null;

			return;
		}
		this.ink = ink;
		this.label.replaceChildren(icon('catapult', { size: '1.3em', color: ink }), icon('target', { size: '1.3em', color: aimed ? ink : RED_PENCIL }));
		this.holdButton.elem.style.visibility = aimed ? 'visible' : 'hidden';
		// Each roll arrow points the way it rolls on the screen, and is gone once it can't go further that way
		const [home, far] = catRange(team), at = cat?.g ?? cat?.x ?? home, toward = Math.sign(far - home);

		this.backButton.elem.style.transform = toward > 0 ? 'scaleX(-1)' : '';
		this.onButton.elem.style.transform = toward > 0 ? '' : 'scaleX(-1)';
		this.backButton.elem.style.visibility = Math.abs(at - home) > 1 ? 'visible' : 'hidden';
		this.onButton.elem.style.visibility = Math.abs(far - at) > 1 ? 'visible' : 'hidden';
		this.fit();
		this.draw();
	}

	// As big as fits the screen, up to its most
	fit() {
		const size = Math.round(clamp(Math.min(window.innerWidth, window.innerHeight) * 0.34, 150, MOST_SIZE));
		const ratio = window.devicePixelRatio || 1;

		if (size === this.size) return;
		this.size = size;
		this.canvas.style.width = `${size}px`;
		this.canvas.style.height = `${size}px`;
		this.canvas.width = Math.round(size * ratio);
		this.canvas.height = Math.round(size * ratio);
		this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
	}

	// How far along the pad's radius it's pulled, 0 to 1: the edge is as far as the catapult reaches
	part() {
		return this.pull ? clamp(Math.hypot(this.pull.x, this.pull.y) / (this.size / 2 - 8), 0, 1) : 0;
	}

	// The fling for the pull now: the other way from it (held to the catapult's angles), as far as it's pulled
	velocity() {
		if (!this.pull) return [0, 0];

		return flingFor(this.team, flingAngle(this.team, -this.pull.x, -this.pull.y), this.part());
	}

	aimed() {
		this.draw();
		this.options.onAim?.(this.velocity());
	}

	draw() {
		const g = this.context, size = this.size, c = size / 2, radius = c - 8;

		if (!g || !size) return;
		g.clearRect(0, 0, size, size);
		g.lineCap = g.lineJoin = 'round';
		// Rings a quarter of the strength apart, and the edge that's all of it
		g.strokeStyle = 'rgba(43,43,43,0.2)';
		g.lineWidth = 1.5;
		for (const part of [0.25, 0.5, 0.75]) {
			g.beginPath();
			g.arc(c, c, radius * part, 0, Math.PI * 2);
			g.stroke();
		}
		g.strokeStyle = 'rgba(43,43,43,0.55)';
		g.lineWidth = 2.5;
		g.beginPath();
		g.arc(c, c, radius, 0, Math.PI * 2);
		g.stroke();
		// The way it can throw: forward, between its lowest and steepest
		const dir = this.team === 1 ? -1 : 1;
		const toward = a => Math.atan2(-Math.sin(a), Math.cos(a) * dir);

		g.fillStyle = 'rgba(43,43,43,0.07)';
		g.beginPath();
		g.moveTo(c, c);
		g.arc(c, c, radius, toward(FLING_ANGLES[1]), toward(FLING_ANGLES[0]), dir < 0);
		g.closePath();
		g.fill();
		g.fillStyle = PENCIL;
		g.beginPath();
		g.arc(c, c, 4, 0, Math.PI * 2);
		g.fill();
		if (!this.pull) {
			g.font = `18px ${HAND}`;
			g.textAlign = 'center';
			g.fillStyle = 'rgba(43,43,43,0.6)';
			g.fillText('pull back to aim', c, c + radius * 0.45);
			g.fillText('it fires by itself', c, c + radius * 0.62);

			return;
		}

		const [vx, vy] = this.velocity();
		const strength = this.part(), m = Math.hypot(vx, vy) || 1;
		const px = c - (vx / m) * strength * radius, py = c - (vy / m) * strength * radius;
		const ax = c + (vx / m) * strength * radius * 0.8, ay = c + (vy / m) * strength * radius * 0.8;

		// The band pulled back, and an arrow the way it flings
		g.strokeStyle = PENCIL;
		g.lineWidth = 3;
		g.setLineDash([6, 5]);
		g.beginPath();
		g.moveTo(c, c);
		g.lineTo(px, py);
		g.stroke();
		g.setLineDash([]);
		g.fillStyle = PENCIL;
		g.beginPath();
		g.arc(px, py, 9, 0, Math.PI * 2);
		g.fill();
		g.strokeStyle = this.ink ?? RED_PENCIL;
		g.lineWidth = 4;
		g.beginPath();
		g.moveTo(c, c);
		g.lineTo(ax, ay);
		g.stroke();

		const angle = Math.atan2(ay - c, ax - c);

		g.beginPath();
		g.moveTo(ax, ay);
		g.lineTo(ax - Math.cos(angle - 0.5) * 14, ay - Math.sin(angle - 0.5) * 14);
		g.moveTo(ax, ay);
		g.lineTo(ax - Math.cos(angle + 0.5) * 14, ay - Math.sin(angle + 0.5) * 14);
		g.stroke();
		g.font = `22px ${HAND}`;
		g.textAlign = 'center';
		g.fillStyle = PENCIL;
		g.fillText(`${Math.round(strength * 100)}%`, c, size - 14);
	}
}
