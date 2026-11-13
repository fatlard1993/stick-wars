import { Component, Dialog, styled } from '@vanilla-bean/components';
import { createSound, enterGame, exitGame } from '@fatlard1993/web-game-framework/client';
import { JoinCard, View } from '@fatlard1993/web-game-framework/ui';

import { TEAMS } from '../rules.js';
import { stayAwake } from './awake.js';
import BattleScreen from './BattleScreen.js';
import DrawScreen from './DrawScreen.js';
import LeavePrompt from './LeavePrompt.js';
import { icon } from './icons.js';
import { count, doodle, lined, soundSwitch } from './ui.js';
import battle from './sounds/battle.mp3';
import boo from './sounds/boo.mp3';
import crash from './sounds/crash.mp3';
import deploy from './sounds/deploy.mp3';
import drawing from './sounds/drawing.mp3';
import erupt from './sounds/erupt.mp3';
import hit from './sounds/hit.mp3';
import keep from './sounds/keep.mp3';
import kill from './sounds/kill.mp3';
import launch from './sounds/launch.mp3';
import lose from './sounds/lose.mp3';
import nope from './sounds/nope.mp3';
import ooh from './sounds/ooh.mp3';
import roar from './sounds/roar.mp3';
import sever from './sounds/sever.mp3';
import slap from './sounds/slap.mp3';
import squish from './sounds/squish.mp3';
import swing from './sounds/swing.mp3';
import thud from './sounds/thud.mp3';
import win from './sounds/win.mp3';

const Status = styled(
	Component,
	({ space }) => `
		display: flex;
		align-items: center;
		gap: ${space.xl};
		font-size: 1.15em;
		white-space: nowrap;
		overflow: hidden;

		& .side { display: inline-flex; align-items: center; gap: ${space.sm}; }
		& .me { border-bottom: 3px solid currentColor; }
	`,
);

const Body = styled(
	Component,
	() => `
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
		${lined}
	`,
);

// One player's screen, or a watcher's: drawing while the armies are drawn, then the battle. Everything shown comes
// from the server: the view it sends each tick, and the art, sent once and again whenever it changes.
export default class Play extends View {
	static schema = { gameId: {}, watch: { default: false }, tv: { default: false } };

	constructor(options, ...children) {
		const status = new Status();
		let inviteButton = null;
		const sound = createSound({
			effects: { hit, sever, squish, swing, launch, crash, thud, deploy, keep, nope, win, lose, roar, ooh, boo, kill, erupt, slap },
			music: { drawing, battle },
		});

		super(
			{
				...options,
				toolbar: {
					heading: '',
					// One row, even on a narrow phone: the game below gets the room
					wrap: false,
					left: [doodle('home', { title: 'Home', onPress: () => (window.location.href = '#/') }), status],
					// A TV only watches: its sound, and nothing to leave
					right: options.tv
						? [soundSwitch(sound)]
						: [
								soundSwitch(sound),
								(inviteButton = doodle('invite', { title: 'Someone else joins', onPress: () => this.invite() })),
								doodle('leave', { title: 'Leave this game', onPress: () => this.askToLeave() }),
							],
				},
			},
			...children,
		);
		this.status = status;
		this.sound = sound;
		this.inviteButton = inviteButton;
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
			onUpdate: message => (message.update === 'art' ? this.setArt(message) : message.update === 'sketch' && this.screen?.setSketch?.(message)),
			// A game gone (or never there): home, or for a TV, on to whatever else is on
			notMember: () => (window.location.href = this.options.tv ? '#/tv' : '#/'),
			gone: () => (window.location.href = this.options.tv ? '#/tv' : '#/'),
		});

		this.playerId = playerId;
		// The screen stays on while the game's open: no phone dozing off mid-battle
		const sleep = stayAwake();

		this.addCleanup('game', () => {
			leave();
			sleep();
			this.sound.destroy();
		});
		if (this.view) this.update(this.view);
	}

	setArt({ art, artOf, entrants }) {
		this.art = { art, artOf, entrants };
		this.screen?.setArt?.(this.art);
	}

	update(view) {
		if (view.art) this.setArt(view.art);
		this.view = view;
		if (this.playerId === undefined && !this.options.watch) return;

		const { state } = view;
		const team = state.seats.indexOf(this.playerId);
		const kind = state.phase === 'draw' ? 'draw' : 'battle';

		// A new screen for a new phase, or when this page's side changes (a tournament's duels change who's fighting)
		if (kind !== this.kind || (kind === 'battle' && team !== this.screenTeam)) {
			this.kind = kind;
			this.screenTeam = team;
			this.screen?.destroy();
			this.screen = kind === 'draw' ? new DrawScreen({ appendTo: this.body }) : new BattleScreen({ appendTo: this.body });
			if (this.art) this.screen.setArt?.(this.art);
			this.sound.music(kind === 'draw' ? 'drawing' : 'battle');
		}
		this.screen.update(view, { team, sound: this.sound, art: this.art, playerId: this.playerId, tv: this.options.tv, gameId: this.options.gameId });
		this.showStatus(view, team);
	}

	// The bar: each side's flag in its ink, who plays it (a person, the computer, or nobody yet), and in battle how many
	// it has left and how many it has killed
	showStatus(view, team) {
		const { state, battle } = view;

		// Waiting for a friend: the invite button lit up until they're here
		this.inviteButton?.elem.setAttribute('aria-pressed', String(state.mode === 'duo' && state.seats.includes(null)));

		this.status.elem.replaceChildren(
			...[0, 1].map(t => {
				const side = document.createElement('span');
				const ink = TEAMS[t].ink;
				const who = state.seats[t] ? 'person' : state.mode === 'cpu' && t === 1 ? 'robot' : 'hourglass';

				side.className = t === team ? 'side me' : 'side';
				side.style.color = ink;
				const whoIcon = icon(who, { color: ink });

				// Hidden on a narrow phone, except an empty seat: being alone at a game for two must show
				if (who !== 'hourglass') whoIcon.classList.add('side-who');
				side.append(icon('flag', { color: ink }), whoIcon);
				// A gladiator from the hall: its wins
				if (view.fame?.[t]) side.append(count('trophy', view.fame[t].wins, ink));
				if (battle && !battle.arena) {
					const kills = count('sword', battle.kills[t], ink);

					kills.classList.add('side-kills');
					side.append(count('person', battle.army[t], ink), kills);
				}

				return side;
			}),
		);
	}

	// A code a phone on the same network opens to join: the other side in a game for two, or to watch
	invite() {
		new Dialog({
			appendTo: document.body,
			size: 'fit',
			header: 'Scan to join',
			body: new JoinCard({ gameId: this.options.gameId }),
			buttons: ['Done'],
			onButtonPress: ({ closeDialog }) => closeDialog(),
		});
	}

	// A seated player is asked first (their drawings go, and a duel in progress is lost); a watcher just goes
	askToLeave() {
		const state = this.view?.state;

		if (this.options.watch || !this.playerId || !state?.seats.includes(this.playerId)) return this.leaveGame();
		new LeavePrompt({
			appendTo: document.body,
			forfeits: state.style === 'gladiator' && state.phase === 'battle',
			onLeave: () => this.leaveGame(),
		});
	}

	async leaveGame() {
		if (!this.options.watch && this.playerId) await exitGame();
		window.location.href = '#/';
	}
}
