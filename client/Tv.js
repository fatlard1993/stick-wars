import { Component, styled } from '@vanilla-bean/components';
import { View } from '@fatlard1993/web-game-framework/ui';

import { icon } from './icons.js';
import Play from './Play.js';
import { PENCIL } from './theme.js';
import { pickGame } from './tvPick.js';
import { lined } from './ui.js';

// How often a TV looks for the game to show, in ms
const LOOK_EVERY = 3000;

const Waiting = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: ${space.xl};
		min-height: 100%;
		color: ${PENCIL};
		${lined}
	`,
);

/** A TV with nothing to show yet: waiting for a game to start in the house, then off to watch it */
export class TvLobby extends View {
	build() {
		new Waiting({ appendTo: this }).elem.append(icon('tv', { size: '6em' }), icon('hourglass', { size: '4em' }));

		const look = async () => {
			const id = await pickGame(null).catch(() => null);

			if (id) window.location.href = `#/tv/${id}`;
		};

		look();
		this.timer = setInterval(look, LOOK_EVERY);
		this.addCleanup('look', () => clearInterval(this.timer));
	}
}

/**
 * A TV watching a game for everyone in the room: the game as a watcher sees it, everything bigger, the join code up while
 * people are drawing, a tournament's bracket in the corner. It moves on by itself: to a tournament when one starts, or
 * to whatever's on when this game is over and left.
 */
export class TvWatch extends Play {
	constructor(options, ...children) {
		super({ ...options, watch: true, tv: true }, ...children);
	}

	build() {
		super.build();
		document.documentElement.classList.add('tv');
		this.addCleanup('tv', () => document.documentElement.classList.remove('tv'));

		const look = async () => {
			const id = await pickGame(this.options.gameId).catch(() => this.options.gameId);

			if (id !== this.options.gameId) window.location.href = id ? `#/tv/${id}` : '#/tv';
		};

		this.timer = setInterval(look, LOOK_EVERY);
		this.addCleanup('look', () => clearInterval(this.timer));
	}
}
