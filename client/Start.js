import { Component, Notify, styled } from '@vanilla-bean/components';
import { createGame, getGames, joinGame } from '@fatlard1993/web-game-framework/client';
import { View } from '@fatlard1993/web-game-framework/ui';

import { MODES } from '../rules.js';
import icon from './favicon.svg';
import { PENCIL } from './theme.js';
import { Heading, doodle, lined } from './ui.js';

// The first screen: fight the computer, or a friend. A game you're already in is where either button takes you back
// to; a friend's game waiting for its second player is joined before a new one is made. The lobby at #/hub lists every
// game, to watch one.
const Screen = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: ${space.xl};
		min-height: 100%;
		padding: ${space.xl};
		text-align: center;
		${lined}

		& img { width: 120px; height: 120px; transform: rotate(-6deg); }
		& .title { font-size: 4.2em; transform: rotate(-2deg); color: ${PENCIL}; }
		& .modes { display: flex; flex-wrap: wrap; justify-content: center; gap: ${space.xl}; }
		& .modes button { flex-direction: column; min-width: 190px; }
	`,
);

export default class Start extends View {
	build() {
		const screen = new Screen({ appendTo: this });
		const modes = new Component({ addClass: 'modes' });

		screen.elem.append(Object.assign(document.createElement('img'), { src: icon, alt: '' }));
		new Heading({ appendTo: screen, addClass: 'title', textContent: 'Stick Men Wars' });
		screen.append(modes);
		modes.append(
			doodle('robot', { big: true, size: '3em', label: 'vs computer', onPress: () => this.play('cpu') }),
			doodle('twoPlayers', { big: true, size: '3em', label: 'two players', onPress: () => this.play('duo') }),
		);
	}

	async play(mode) {
		try {
			const { body: games = [] } = await getGames({ invalidateAfter: 0 });
			const mine = games.find(
				game => game.state?.mode === mode && game.players.some(({ id }) => id === localStorage.getItem(game.id)),
			);

			if (mine) {
				window.location.href = `#/play/${mine.id}`;

				return;
			}

			// A friend's game with a free side, whose waiting player is here now: an empty seat at a table left long ago isn't one
			const open =
				mode === 'duo'
					? games.find(
							game =>
								game.state?.mode === 'duo' && game.state.seats.includes(null) && game.players.some(({ online }) => online),
						)
					: null;
			const game = open ?? (await createGame({ body: { name: `${MODES[mode]} ${new Date().toLocaleTimeString()}`, mode } })).body;
			const joined = await joinGame(game.id, { body: { name: 'player' } });

			if (!joined.body?.id) throw new Error(`could not join: ${JSON.stringify(joined.body)}`);
			localStorage.setItem(game.id, joined.body.id);
			window.location.href = `#/play/${game.id}`;
		} catch (error) {
			console.error('Could not start playing', error);
			new Notify({ x: window.innerWidth / 2, y: 120, intent: 'warning', content: 'That did not work. Try again?', timeout: 3000 });
		}
	}
}
