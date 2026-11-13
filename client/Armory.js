import { Component, styled } from '@vanilla-bean/components';

import { shelf, vote } from './armoryPicks.js';
import { icon } from './icons.js';
import { drawRawFit } from './paint.js';
import { PENCIL, RED_PENCIL } from './theme.js';
import { Doodle, count, doodle } from './ui.js';

const LOVED = '#2f7a3a';

const Sorts = styled(Component, ({ space }) => `display: flex; gap: ${space.sm}; justify-content: center; flex-wrap: wrap;`);

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
		& .name { max-width: 150px; text-align: center; font-size: 0.95em; white-space: normal; line-height: 1.1; }
		& .row { display: flex; gap: ${space.sm}; align-items: center; }
		& .row button { padding: 2px 8px; }
	`,
);

/** A shelf's tab: every weapon (or stick man) players have drawn, with its thumbs (and kills); sorted loved, hated,
 * controversial (or deadliest), and voted on here, one thumb each */
export default class ShelfList {
	// Which shelf, its doodle, its sorts, and whether its drawings have kills to show
	static armory = { shelf: 'armory', mark: 'rack', sorts: ['loved', 'hated', 'controversial', 'deadliest'], kills: true };
	static crowd = { shelf: 'crowd', mark: 'crowd', sorts: ['loved', 'hated', 'controversial'], kills: false };

	constructor(host, config) {
		const kept = config.sorts;

		this.config = config;
		this.sortButtons = Object.fromEntries(
			[
				['loved', 'thumbUp', 'Loved'],
				['hated', 'thumbDown', 'Hated'],
				['controversial', 'split', 'Loved and hated'],
				['deadliest', 'skull', 'Deadliest'],
			]
				.filter(([sort]) => kept.includes(sort))
				.map(([sort, name, title]) => [sort, doodle(name, { title, size: '1.8em', onPress: () => this.show(sort) })]),
		);
		new Sorts({ appendTo: host }).elem.append(...Object.values(this.sortButtons).map(button => button.elem));
		this.cards = new Component({ appendTo: host, addClass: 'cards' });
		this.show('loved');
	}

	async show(sort) {
		this.sort = sort;
		for (const [name, button] of Object.entries(this.sortButtons)) button.elem.setAttribute('aria-pressed', String(name === sort));

		const list = await shelf(this.config.shelf, sort);

		if (sort !== this.sort) return;
		if (!list.length) {
			const empty = icon(this.config.mark, { size: '5em' });

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
			row.replaceChildren(up.elem, down.elem, ...(this.config.kills ? [count('skull', weapon.kills)] : []));
		};

		thumbs();
		// Its name, once its kills have earned it one
		if (weapon.name) card.elem.append(canvas, Object.assign(document.createElement('div'), { className: 'name', textContent: weapon.name }), row);
		else card.elem.append(canvas, row);

		return card;
	}

	async vote(weapon, thumb, redraw) {
		const said = await vote(weapon.id, thumb, this.config.shelf);

		if (!said) return;
		Object.assign(weapon, said, { mine: thumb });
		redraw();
	}
}
