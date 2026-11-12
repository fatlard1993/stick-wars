import { Button, Component, Dialog, Link, styled } from '@vanilla-bean/components';
import { createSound, enterGame, exitGame } from '@fatlard1993/web-game-framework/client';
import { JoinCard, SoundToggle, View } from '@fatlard1993/web-game-framework/ui';

import { MODES, TEAMS } from '../rules.js';
import BattleScreen from './BattleScreen.js';
import DrawScreen from './DrawScreen.js';
import battle from './sounds/battle.mp3';
import crash from './sounds/crash.mp3';
import deploy from './sounds/deploy.mp3';
import drawing from './sounds/drawing.mp3';
import hit from './sounds/hit.mp3';
import keep from './sounds/keep.mp3';
import launch from './sounds/launch.mp3';
import lose from './sounds/lose.mp3';
import nope from './sounds/nope.mp3';
import sever from './sounds/sever.mp3';
import squish from './sounds/squish.mp3';
import swing from './sounds/swing.mp3';
import thud from './sounds/thud.mp3';
import win from './sounds/win.mp3';

const Status = styled(
	Component,
	({ space }) => `
		display: flex;
		gap: ${space.lg};
		font-size: 1.3rem;
		white-space: nowrap;
		overflow: hidden;

		& .me { text-decoration: underline; }
	`,
);

const Body = styled(
	Component,
	() => `
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	`,
);

// One player's screen, or a watcher's: drawing while the armies are drawn, then the battle. Everything shown comes
// from the server: the view it sends each tick, and the art, sent once and again whenever it changes.
export default class Play extends View {
	static schema = { gameId: {}, watch: { default: false } };

	constructor(options, ...children) {
		const status = new Status();
		const sound = createSound({
			effects: { hit, sever, squish, swing, launch, crash, thud, deploy, keep, nope, win, lose },
			music: { drawing, battle },
		});

		super(
			{
				...options,
				toolbar: {
					heading: '',
					left: [new Link({ textContent: '🏠', href: '#/', variant: 'button' }), status],
					right: [
						new SoundToggle({ sound }),
						new Button({ textContent: '➕👫', title: 'Someone else joins', onPointerPress: () => this.invite() }),
						new Button({ textContent: '🚪', title: 'Leave this game', onPointerPress: () => this.leaveGame() }),
					],
				},
			},
			...children,
		);
		this.status = status;
		this.sound = sound;
	}

	build() {
		super.build();
		this._init();
	}

	async _init() {
		const { gameId, watch } = this.options;

		this.body = new Body({ appendTo: this._body });

		const { playerId, leave } = await enterGame(gameId, {
			watch,
			onState: view => this.update(view),
			onUpdate: message => message.update === 'art' && this.setArt(message),
			notMember: () => (window.location.href = '#/'),
			gone: () => (window.location.href = '#/'),
		});

		this.playerId = playerId;
		this.addCleanup('game', () => {
			leave();
			this.sound.destroy();
		});
		if (this.view) this.update(this.view);
	}

	setArt({ art, artOf }) {
		this.art = { art, artOf };
		this.screen?.setArt?.(this.art);
	}

	update(view) {
		if (view.art) this.setArt(view.art);
		this.view = view;
		if (this.playerId === undefined && !this.options.watch) return;

		const { state, players } = view;
		const team = state.seats.indexOf(this.playerId);
		const kind = state.phase === 'draw' ? 'draw' : 'battle';
		const avatars = Object.fromEntries(players.map(({ id, name }) => [id, name]));

		if (kind !== this.kind) {
			this.kind = kind;
			this.screen?.destroy();
			this.screen = kind === 'draw' ? new DrawScreen({ appendTo: this.body }) : new BattleScreen({ appendTo: this.body });
			if (this.art) this.screen.setArt?.(this.art);
			this.sound.music(kind === 'draw' ? 'drawing' : 'battle');
		}
		this.screen.update(view, { team, sound: this.sound, avatars, art: this.art });
		this.showStatus(view, team, avatars);
	}

	// The bar: each side, who plays it, and in battle how many are fighting, waiting and killed
	showStatus(view, team, avatars) {
		const { state, battle } = view;

		this.status.elem.replaceChildren(
			Object.assign(document.createElement('span'), { textContent: MODES[state.mode] }),
			...[0, 1].map(t => {
				const span = document.createElement('span');
				const who = state.seats[t] ? avatars[state.seats[t]] ?? '🙂' : state.mode === 'cpu' && t === 1 ? '🤖' : '…';
				const counts = battle ? ` ⚔️${battle.fighting[t]} ⏳${battle.reserve[t]} 🗡️${battle.kills[t]}` : '';

				span.textContent = `${TEAMS[t].emoji}${who}${counts}`;
				if (t === team) span.className = 'me';

				return span;
			}),
		);
	}

	// A code a phone on the same network opens to join: the other side in a game for two, or to watch
	invite() {
		new Dialog({
			appendTo: document.body,
			size: 'fit',
			header: '➕👫',
			body: new JoinCard({ gameId: this.options.gameId }),
			buttons: ['✅'],
			onButtonPress: ({ closeDialog }) => closeDialog(),
		});
	}

	async leaveGame() {
		if (!this.options.watch && this.playerId) await exitGame();
		window.location.href = '#/';
	}
}
