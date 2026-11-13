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
		/* War or gladiators: the one picked is inked in */
		& .styles { display: flex; gap: ${space.lg}; flex-wrap: wrap; justify-content: center; }
		& .styles button { flex-direction: column; min-width: 130px; font-size: 1.2em; }
	`,
);

/** A seat taken at a game (joined as a new player, kept in this browser) and off to play it */
export const sitDown = async game => {
	const joined = await joinGame(game.id, { body: { name: 'player' } });

	if (!joined.body?.id) throw new Error(`could not join: ${JSON.stringify(joined.body)}`);
	localStorage.setItem(game.id, joined.body.id);
	window.location.href = `#/play/${game.id}`;
};

export default class Start extends View {
	build() {
		const screen = new Screen({ appendTo: this });
		const modes = new Component({ addClass: 'modes' });

		screen.elem.append(Object.assign(document.createElement('img'), { src: icon, alt: '' }));
		new Heading({ appendTo: screen, addClass: 'title', textContent: 'Stick Men Wars' });
		// A war of armies, or two gladiators: remembered for next time
		const styles = new Component({ addClass: 'styles' });
		const pick = style => {
			this.style = style;
			try {
				localStorage.setItem('style', style);
			} catch {
				// Remembering it is only a convenience
			}
			for (const [name, button] of Object.entries(this.styleButtons)) button.elem.setAttribute('aria-pressed', String(name === style));
			// The hall of gladiators, and a tournament, for gladiators
			this.hallButton.elem.style.display = style === 'gladiator' ? '' : 'none';
			this.tournamentButton.elem.style.display = style === 'gladiator' ? '' : 'none';
		};

		this.tournamentButton = doodle('bracket', { big: true, size: '3em', label: 'tournament', onPress: () => this.play('tournament') });
		this.hallButton = doodle('trophy', { size: '2.4em', label: 'hall', onPress: () => (window.location.href = '#/hall') });

		this.styleButtons = {
			war: doodle('catapult', { size: '2.4em', label: 'war', onPress: () => pick('war') }),
			gladiator: doodle('helmet', { size: '2.4em', label: 'gladiators', onPress: () => pick('gladiator') }),
		};
		styles.append(
			...Object.values(this.styleButtons),
			this.hallButton,
			doodle('rack', { size: '2.4em', label: 'armory', onPress: () => (window.location.href = '#/armory') }),
			doodle('crowd', { size: '2.4em', label: 'crowd', onPress: () => (window.location.href = '#/crowd') }),
			doodle('tv', { size: '2.4em', label: 'tv', onPress: () => (window.location.href = '#/tv') }),
		);
		screen.append(styles, modes);
		let saved = 'war';

		try {
			saved = localStorage.getItem('style') === 'gladiator' ? 'gladiator' : 'war';
		} catch {
			// A fresh start is a war
		}
		pick(saved);
		modes.append(
			doodle('robot', { big: true, size: '3em', label: 'vs computer', onPress: () => this.play('cpu') }),
			doodle('twoPlayers', { big: true, size: '3em', label: 'two players', onPress: () => this.play('duo') }),
			this.tournamentButton,
		);
	}

	async play(mode) {
		try {
			const { body: games = [] } = await getGames({ invalidateAfter: 0 });
			const style = this.style ?? 'war';
			const sameKind = game => game.state?.mode === mode && (game.state.style ?? 'war') === style;
			const mine = games.find(game => sameKind(game) && game.players.some(({ id }) => id === localStorage.getItem(game.id)));

			if (mine) {
				window.location.href = `#/play/${mine.id}`;

				return;
			}

			// A friend's game with a free side, whose waiting player is here now: an empty seat at a table left long ago isn't one
			const someoneHere = game => game.players.some(({ online }) => online);
			const open =
				mode === 'duo'
					? games.find(game => sameKind(game) && game.state.seats.includes(null) && someoneHere(game))
					: mode === 'tournament'
						? games.find(game => sameKind(game) && game.state.open && someoneHere(game))
						: null;
			const name = `${style === 'gladiator' ? 'gladiators, ' : ''}${MODES[mode]} ${new Date().toLocaleTimeString()}`;
			await sitDown(open ?? (await createGame({ body: { name, mode, style } })).body);
		} catch (error) {
			console.error('Could not start playing', error);
			new Notify({ x: window.innerWidth / 2, y: 120, intent: 'warning', content: 'That did not work. Try again?', timeout: 3000 });
		}
	}
}
