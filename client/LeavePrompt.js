import { Component, styled } from '@vanilla-bean/components';

import { icon } from './icons.js';
import { PENCIL, RED_PENCIL } from './theme.js';
import { doodle } from './ui.js';

const Overlay = styled(
	Component,
	({ space }) => `
		position: fixed;
		inset: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(43, 43, 43, 0.35);

		& .card {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: ${space.md};
			padding: ${space.lg} ${space.xl};
			background: #fffdf6;
			border: 3px solid ${PENCIL};
			border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
			box-shadow: 4px 6px 0 ${PENCIL};
			color: ${PENCIL};
			transform: rotate(-1deg);
		}
		& .row { display: flex; gap: ${space.lg}; align-items: center; justify-content: center; }
		& .row button { padding: 10px 26px; }
	`,
);

/**
 * Leaving asked first: a door, what leaving costs in red (the drawings, and a duel in progress forfeited), and two big
 * doodles, stay or go. A tap outside the card, or Esc, is staying.
 * @param {object} options - { forfeits: whether leaving now loses a duel, onLeave() }
 */
export default class LeavePrompt extends Overlay {
	static schema = { forfeits: { default: false }, onLeave: { data: true } };

	build() {
		super.build();

		const card = document.createElement('div'), costs = document.createElement('div'), choices = document.createElement('div');

		card.className = 'card';
		costs.className = choices.className = 'row';
		costs.append(icon('draw', { size: '2.4em', color: RED_PENCIL }), ...(this.options.forfeits ? [icon('skull', { size: '2.4em', color: RED_PENCIL })] : []));
		choices.append(
			doodle('undo', { title: 'Stay', size: '2.4em', big: true, onPress: () => this.close() }).elem,
			doodle('leave', { title: 'Leave', size: '2.4em', addClass: 'red', onPress: () => this.leave() }).elem,
		);
		card.append(icon('leave', { size: '4em' }), costs, choices);
		this.elem.append(card);
		this.elem.addEventListener('pointerdown', event => event.target === this.elem && this.close());
		this.onKey = event => event.key === 'Escape' && this.close();
		window.addEventListener('keydown', this.onKey);
	}

	leave() {
		this.close();
		this.options.onLeave?.();
	}

	close() {
		window.removeEventListener('keydown', this.onKey);
		this.elem.remove();
	}
}
