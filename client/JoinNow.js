import { Component, styled } from '@vanilla-bean/components';
import { View } from '@fatlard1993/web-game-framework/ui';

import { icon } from './icons.js';
import { sitDown } from './Start.js';
import { PENCIL } from './theme.js';
import { doodle, lined } from './ui.js';

const Screen = styled(
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

/**
 * Where an invite's code lands: straight into the game, seated, no form to fill in. Already seated there (this browser
 * joined before), it's back to playing; a game that's gone shows the way home.
 */
export default class JoinNow extends View {
	static schema = { gameId: {} };

	build() {
		const screen = new Screen({ appendTo: this });
		const { gameId } = this.options;

		screen.elem.append(icon('hourglass', { size: '4em' }));
		if (localStorage.getItem(gameId)) {
			window.location.href = `#/play/${gameId}`;

			return;
		}
		sitDown({ id: gameId }).catch(() =>
			screen.elem.replaceChildren(icon('empty', { size: '4em' }), doodle('home', { size: '2.4em', onPress: () => (window.location.href = '#/') }).elem),
		);
	}
}
