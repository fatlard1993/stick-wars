import { Component, styled } from '@vanilla-bean/components';
import { getGames } from '@fatlard1993/web-game-framework/client';

import { TEAMS } from '../rules.js';
import { icon } from './icons.js';
import { sitDown } from './Start.js';
import { PENCIL } from './theme.js';
import { Doodle } from './ui.js';

// How often the list looks again, in ms
const LOOK_EVERY = 3000;

const List = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: ${space.sm};
		max-width: 760px;
		color: ${PENCIL};

		&:empty { display: none; }
		& button { gap: 6px; padding: 6px 10px; }
		& button .what { display: inline-flex; gap: 2px; padding-right: 6px; border-right: 2px dashed ${PENCIL}55; }
		& button .who { display: inline-flex; gap: 1px; }
		& button.free { background: #ffe36e; }
	`,
);

// What a game is doing: drawing, fighting, or over
const PHASE = { draw: 'redraw', battle: 'sword', over: 'trophy' };
const STYLE = { war: 'catapult', gladiator: 'helmet' };
const MODE = { cpu: 'robot', duo: 'twoPlayers', tournament: 'bracket' };

/**
 * The games on now, on the start page: each with someone in it, as pictures (war or gladiators, against whom, who's
 * there, what it's doing), and what a tap does: back into one you're in, a free side taken, or watching
 */
export default class GamesOn extends List {
	build() {
		super.build();
		this.look();
		this.timer = setInterval(() => this.look(), LOOK_EVERY);
		this.addCleanup('look', () => clearInterval(this.timer));
	}

	async look() {
		const { body: games = [] } = await getGames({ invalidateAfter: 0 }).catch(() => ({}));
		const live = (games ?? []).filter(game => game.players?.some(({ online }) => online));

		this.elem.replaceChildren(...live.map(game => this.card(game)));
	}

	card(game) {
		const { mode = 'cpu', style = 'war', phase = 'draw', seats = [], open, entrants = 0 } = game.state ?? {};
		const mine = game.players.some(({ id }) => id === localStorage.getItem(game.id));
		const online = id => game.players.find(player => player.id === id)?.online;
		// A side to take: a game for two with an empty seat, or a tournament still gathering
		const free = !mine && ((mode === 'duo' && seats.includes(null)) || (mode === 'tournament' && open));
		const doing = mine ? 'next' : free ? 'invite' : 'eye';
		const button = new Doodle({
			title: mine ? 'Back into your game' : free ? 'Join this game' : 'Watch this game',
			addClass: free ? 'free' : '',
			onPointerPress: () => (mine ? (window.location.href = `#/play/${game.id}`) : free ? sitDown(game) : (window.location.href = `#/watch/${game.id}`)),
		});
		const what = Object.assign(document.createElement('span'), { className: 'what' });
		const who = Object.assign(document.createElement('span'), { className: 'who' });

		what.append(icon(STYLE[style] ?? 'catapult', { size: '1.4em' }), icon(MODE[mode] ?? 'robot', { size: '1.4em' }));
		if (mode === 'tournament') who.append(icon('person', { size: '1.3em' }), `${entrants}`);
		else
			seats.forEach((id, t) => {
				const seat = id ? icon('person', { size: '1.3em', color: TEAMS[t].ink }) : mode === 'cpu' && t === 1 ? icon('robot', { size: '1.3em', color: TEAMS[t].ink }) : icon('person', { size: '1.3em', color: 'rgba(43,43,43,0.25)' });

				if (id && !online(id)) seat.style.opacity = '0.35';
				who.append(seat);
			});
		button.elem.append(what, who, icon(PHASE[phase] ?? 'draw', { size: '1.3em' }), icon(doing, { size: '1.5em' }));

		return button.elem;
	}
}
