import { Component, styled } from '@vanilla-bean/components';
import { act } from '@fatlard1993/web-game-framework/client';

import { weapons } from './armoryPicks.js';
import { icon } from './icons.js';
import { drawRawFit } from './paint.js';
import { PENCIL, RED_PENCIL } from './theme.js';
import { Doodle, count, doodle } from './ui.js';

const Overlay = styled(
	Component,
	({ space }) => `
		position: fixed;
		inset: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(43, 43, 43, 0.35);

		&.hidden { display: none; }
		& .panel {
			display: flex;
			flex-direction: column;
			gap: ${space.sm};
			width: min(92vw, 760px);
			max-height: 84vh;
			padding: ${space.md};
			background: #fffdf6;
			border: 3px solid ${PENCIL};
			border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
			box-shadow: 4px 6px 0 ${PENCIL};
			color: ${PENCIL};
		}
		& .bar { display: flex; align-items: center; gap: ${space.sm}; }
		& .bar .close { margin-left: auto; }
		& .weapons { display: flex; flex-wrap: wrap; gap: ${space.sm}; justify-content: center; overflow: auto; }
		& .weapons button { flex-direction: column; padding: 4px 8px; }
		& .weapons canvas { width: 70px; height: 96px; }
	`,
);

/**
 * The armory opened on the weapon page: its weapons, best loved first, each with its thumbs and kills; one tapped is
 * borrowed as this player's weapon instead of drawing one
 */
export default class BorrowPicker extends Overlay {
	build() {
		super.build();
		this.elem.classList.add('hidden');
		this.panel = document.createElement('div');
		this.panel.className = 'panel';

		const bar = document.createElement('div');

		bar.className = 'bar';
		bar.append(icon(this.constructor.mark, { size: '2em' }), doodle('empty', { title: 'Close', addClass: 'close', onPress: () => this.close() }).elem);
		this.list = document.createElement('div');
		this.list.className = 'weapons';
		this.panel.append(bar, this.list);
		this.elem.append(this.panel);
		// A tap outside the panel puts it away
		this.elem.addEventListener('pointerdown', event => event.target === this.elem && this.close());
	}

	// What it offers, its doodle, and what taking one is: the armory's weapons, borrowed
	static mark = 'rack';
	items() {
		return weapons('loved');
	}

	async open() {
		this.elem.classList.remove('hidden');
		this.list.replaceChildren();

		const list = await this.items();
		const { mark } = this.constructor;

		if (!list.length) return this.list.replaceChildren(icon(mark, { size: '4em', color: 'rgba(43,43,43,0.4)' }));
		this.list.replaceChildren(...list.map(item => this.card(item)));
	}

	// One weapon to borrow: its drawing, its name once earned, its thumbs and kills
	card(weapon) {
		const button = new Doodle({ title: 'Borrow this one', onPointerPress: () => this.borrow(weapon) });
		const canvas = document.createElement('canvas');
		const row = document.createElement('span');

		canvas.width = 140;
		canvas.height = 192;
		drawRawFit(canvas, weapon.raw);
		row.style.display = 'inline-flex';
		row.style.gap = '6px';
		row.append(count('thumbUp', weapon.up, '#2f7a3a'), count('thumbDown', weapon.down, RED_PENCIL), count('skull', weapon.kills));
		button.elem.append(canvas, ...(weapon.name ? [Object.assign(document.createElement('span'), { textContent: weapon.name, style: 'font-size: 0.8em; max-width: 110px' })] : []), row);

		return button.elem;
	}

	borrow(weapon) {
		return this.take('borrow', weapon);
	}

	async take(action, item) {
		const said = await act(action, { id: item.id });

		if (said.ok) {
			this.options.sound?.play?.('keep');
			this.close();
		}
	}

	close() {
		this.elem.classList.add('hidden');
	}
}
