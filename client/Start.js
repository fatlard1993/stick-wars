import { Button, Component, Notify, styled } from '@vanilla-bean/components';
import { createGame, getGames, joinGame } from '@fatlard1993/web-game-framework/client';
import { View } from '@fatlard1993/web-game-framework/ui';

import { MODES } from '../rules.js';
import icon from './favicon.svg';

// The first screen, in pictures: pick who you are (an animal), then fight the computer or a friend. A game you're
// already in is where either button takes you back to; a friend's game waiting for a second player is joined before a
// new one is made. The lobby at #/hub lists every game, to watch one.
const AVATARS = ['🦊', '🐸', '🐼', '🦄', '🐙', '🐯', '🐧', '🐝'];

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
	`,
);

const Title = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: ${space.sm};
		font-size: 2.6rem;
		line-height: 1.1;

		& img { width: 96px; height: 96px; }
	`,
);

const Avatars = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: ${space.md};
		max-width: 420px;
	`,
);

const Avatar = styled(
	Button,
	({ colors, radius }) => `
		width: 72px;
		height: 72px;
		border-radius: ${radius.pill};
		font-size: 2.4rem;
		background: ${colors.alpha(colors.white, 0.08)};

		&[aria-pressed='true'] {
			background: ${colors.blue};
			transform: scale(1.1);
		}
	`,
);

const Modes = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: ${space.lg};
	`,
);

const ModeButton = styled(
	Button,
	({ colors, radius }) => `
		min-width: 180px;
		padding: 18px 28px;
		border-radius: ${radius.pill};
		background: ${colors.red};
		font-size: 2.4rem;
	`,
);

export default class Start extends View {
	build() {
		const screen = new Screen({ appendTo: this });
		let picked = localStorage.getItem('avatar') || AVATARS[0];
		const avatars = new Avatars();
		const buttons = AVATARS.map(
			avatar =>
				new Avatar({
					textContent: avatar,
					attributes: { 'aria-pressed': String(avatar === picked) },
					appendTo: avatars,
					onPointerPress: () => {
						picked = avatar;
						for (const button of buttons) button.elem.setAttribute('aria-pressed', String(button.elem.textContent === avatar));
					},
				}),
		);
		const title = new Title({ appendTo: screen });

		title.elem.append(Object.assign(document.createElement('img'), { src: icon, alt: '' }), 'Stick Men Wars');
		screen.append(avatars);

		const modes = new Modes({ appendTo: screen });

		for (const mode of Object.keys(MODES)) {
			new ModeButton({
				textContent: `⚔️ ${MODES[mode]}`,
				title: mode === 'cpu' ? 'Against the computer' : 'Against a friend',
				appendTo: modes,
				onPointerPress: () => this.play(mode, picked),
			});
		}
	}

	async play(mode, avatar) {
		try {
			const { body: games = [] } = await getGames({ invalidateAfter: 0 });
			const mine = games.find(game => game.state?.mode === mode && game.players.some(({ id }) => id === localStorage.getItem(game.id)));

			localStorage.setItem('avatar', avatar);
			if (mine) {
				window.location.href = `#/play/${mine.id}`;

				return;
			}

			// A friend's game with a free side, whose waiting player is here now: an empty seat at a table left long ago isn't one
			const open =
				mode === 'duo'
					? games.find(game => game.state?.mode === 'duo' && game.state.seats.includes(null) && game.players.some(({ online }) => online))
					: null;
			const game = open ?? (await createGame({ body: { name: `${MODES[mode]} ${avatar}`, mode } })).body;
			const joined = await joinGame(game.id, { body: { name: avatar } });

			if (!joined.body?.id) throw new Error(`could not join: ${JSON.stringify(joined.body)}`);
			localStorage.setItem(game.id, joined.body.id);
			window.location.href = `#/play/${game.id}`;
		} catch (error) {
			// Said where it happened, in a picture and two words, and kept for whoever looks at the console
			console.error('Could not start playing', error);
			new Notify({ x: window.innerWidth / 2, y: 120, intent: 'warning', content: '😕 Try again', timeout: 3000 });
		}
	}
}
