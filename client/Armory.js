import { Component, styled } from '@vanilla-bean/components';
import { View } from '@fatlard1993/web-game-framework/ui';

import { weapons, vote } from './armoryPicks.js';
import { icon } from './icons.js';
import { drawRawFit } from './paint.js';
import { PENCIL, RED_PENCIL } from './theme.js';
import { Doodle, count, doodle, lined } from './ui.js';

const LOVED = '#2f7a3a';

const Screen = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: ${space.md};
		min-height: 100%;
		padding: ${space.lg} ${space.md};
		color: ${PENCIL};
		${lined}

		& .top { display: flex; align-items: center; gap: ${space.md}; width: 100%; max-width: 1100px; flex-wrap: wrap; }
		& .sorts { display: flex; gap: ${space.sm}; margin-left: auto; }
		& .cards { display: flex; flex-wrap: wrap; justify-content: center; gap: ${space.md}; max-width: 1100px; }
		& .empty { opacity: 0.5; margin-top: ${space.xl}; }
	`,
);

const Card = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: ${space.xs};
		padding: ${space.sm};
		background: #fffdf6;
		border: 2.5px solid ${PENCIL};
		border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
		box-shadow: 2px 3px 0 ${PENCIL};
		font-size: 1.15em;

		& canvas { width: 110px; height: 150px; }
		& .row { display: flex; gap: ${space.sm}; align-items: center; }
		& .row button { padding: 2px 8px; }
	`,
);

/** The armory: every weapon players have drawn, with its thumbs and kills; sorted loved, hated, controversial or deadliest,
 * and voted on here, one thumb each */
export default class Armory extends View {
	build() {
		const screen = new Screen({ appendTo: this });
		const top = document.createElement('div');
		const sorts = document.createElement('div');

		top.className = 'top';
		sorts.className = 'sorts';
		this.sortButtons = Object.fromEntries(
			[
				['loved', 'thumbUp', 'Loved'],
				['hated', 'thumbDown', 'Hated'],
				['controversial', 'split', 'Loved and hated'],
				['deadliest', 'skull', 'Deadliest'],
			].map(([sort, name, title]) => [sort, doodle(name, { title, size: '1.8em', onPress: () => this.show(sort) })]),
		);
		sorts.append(...Object.values(this.sortButtons).map(button => button.elem));
		top.append(doodle('home', { title: 'Back', size: '1.8em', onPress: () => (window.location.href = '#/') }).elem, icon('rack', { size: '2.4em' }), sorts);
		screen.elem.append(top);
		this.cards = new Component({ appendTo: screen, addClass: 'cards' });
		this.show('loved');
	}

	async show(sort) {
		this.sort = sort;
		for (const [name, button] of Object.entries(this.sortButtons)) button.elem.setAttribute('aria-pressed', String(name === sort));

		const list = await weapons(sort);

		if (sort !== this.sort) return;
		if (!list.length) {
			const empty = icon('rack', { size: '5em' });

			empty.classList.add('empty');
			this.cards.elem.replaceChildren(empty);

			return;
		}
		this.cards.elem.replaceChildren(...list.map(weapon => this.card(weapon).elem));
	}

	// One weapon: its drawing, how many it's killed, and its thumbs, ours pressed in; tapping a thumb votes or takes it back
	card(weapon) {
		const card = new Card();
		const canvas = document.createElement('canvas');
		const row = document.createElement('div');

		canvas.width = 220;
		canvas.height = 300;
		drawRawFit(canvas, weapon.raw);
		row.className = 'row';

		const thumbs = () => {
			const up = new Doodle({ title: 'Love it', onPointerPress: () => this.vote(weapon, weapon.mine === 1 ? 0 : 1, thumbs) });
			const down = new Doodle({ title: 'Hate it', onPointerPress: () => this.vote(weapon, weapon.mine === -1 ? 0 : -1, thumbs) });

			up.elem.append(count('thumbUp', weapon.up, LOVED));
			down.elem.append(count('thumbDown', weapon.down, RED_PENCIL));
			up.elem.setAttribute('aria-pressed', String(weapon.mine === 1));
			down.elem.setAttribute('aria-pressed', String(weapon.mine === -1));
			row.replaceChildren(up.elem, down.elem, count('skull', weapon.kills));
		};

		thumbs();
		card.elem.append(canvas, row);

		return card;
	}

	async vote(weapon, thumb, redraw) {
		const said = await vote(weapon.id, thumb);

		if (!said) return;
		Object.assign(weapon, said, { mine: thumb });
		redraw();
	}
}
