import { Game as BaseGame, refuse } from '@fatlard1993/web-game-framework';

import { defaultsFor, judge } from './art.js';
import { DT, SEND_EVERY, World } from './battle.js';
import { MOST_KEPT, STEPS, TICK_MS, artOf, emptyArt, humanTeams, newDrawing, newState } from './rules.js';

// How long a won battle plays on before its end is called, in battle seconds
const END_AFTER = 2.2;

// One running game, on the server: who sits on each side, the art each side has drawn, and once both are done, the
// battle (battle.js), stepped here and sent to every page many times a second. Drawings are judged here too, so what
// a page keeps is what passed.
export default class Game extends BaseGame {
	static version = 1;
	static migrations = {};

	constructor(options) {
		super(options);

		// Back from the save file after a restart, or new
		this.state = options.saveState?.state ?? newState(this.options.mode);
		this.outEvents = [];
		this.sendAt = [-Infinity, -Infinity];
		this.world = null;
		this.shown = '';
		// A battle isn't saved: after a restart it starts again, with the same art
		if (this.state.phase === 'battle' || this.state.phase === 'over') this.startBattle();

		this.every(TICK_MS, () => this.tick());
	}

	// What a player can do, from their page. Each runs as the page's own player, the game is published after, and
	// refuse('why') turns one down with the reason shown on their page.
	actions = {
		// A drawing kept as the current step's art, if it passes that kind's check
		keep(player, { strokes } = {}) {
			const team = this.teamOf(player.id);
			const drawing = this.state.drawing[team];

			if (this.state.phase !== 'draw' || !drawing || drawing.done) refuse('Not drawing now');

			const { kind } = STEPS[drawing.step];
			const kept = this.state.art[team][kind];

			if (kept.length >= MOST_KEPT) refuse(`That's plenty: ${MOST_KEPT} is the most.`);

			const verdict = judge(kind, strokes);

			if (!verdict.ok) refuse(verdict.msg);
			kept.push(verdict.item);
			this.artChanged();

			return { kind, kept: kept.length, stats: verdict.item.stats ?? null };
		},

		// Done with this step before the clock runs out
		next(player) {
			const team = this.teamOf(player.id);

			if (this.state.phase !== 'draw' || this.state.drawing[team]?.done !== false) refuse('Not drawing now');
			this.finishStep(team);
		},

		// One more stick man from the reserve, out through the wall
		send(player) {
			const team = this.teamOf(player.id);

			if (this.state.phase !== 'battle' || !this.world) refuse('No battle on');
			if (this.world.time - this.sendAt[team] < SEND_EVERY) return { sent: false };
			if (!this.world.deploy(team)) refuse('Nobody left to send');
			this.sendAt[team] = this.world.time;

			return { sent: true };
		},

		// Charge, or hold by our own wall
		stance(player) {
			const team = this.teamOf(player.id);

			if (!this.world) refuse('No battle on');
			this.state.hold[team] = !this.state.hold[team];
		},

		// One of our two catapults flung: which, and how hard which way
		fling(player, { which, vx, vy } = {}) {
			const team = this.teamOf(player.id);

			if (this.state.phase !== 'battle' || !this.world) refuse('No battle on');
			if (![0, 1].includes(which) || !Number.isFinite(vx) || !Number.isFinite(vy)) refuse('Fling with a direction');
			if (!this.world.fling(team, which, vx, vy)) refuse('Not ready');
		},

		// The same armies again
		again(player) {
			this.teamOf(player.id);
			if (this.state.phase !== 'over') refuse('The battle is still on');
			this.startBattle();
		},

		// Everyone draws a new army
		redraw(player) {
			this.teamOf(player.id);
			if (this.state.phase !== 'over') refuse('The battle is still on');
			for (const team of humanTeams(this.state)) this.resetArt(team);
			this.world = null;
			this.state.phase = 'draw';
		},
	};

	// The side a player sits on; anyone else is only watching
	teamOf(playerId) {
		const team = this.state.seats.indexOf(playerId);

		if (team < 0) refuse('You are watching this one');

		return team;
	}

	resetArt(team) {
		this.state.art[team] = emptyArt();
		this.state.drawing[team] = newDrawing();
		this.artChanged();
	}

	// Sides whose player's page is closed: their clock stops, and so does a battle
	away() {
		return humanTeams(this.state).filter(team => {
			const id = this.state.seats[team];

			return id && !this.online.has(id);
		});
	}

	finishStep(team) {
		const drawing = this.state.drawing[team];
		const { kind } = STEPS[drawing.step];

		if (!this.state.art[team][kind].length) {
			this.state.art[team][kind] = defaultsFor(kind);
			this.artChanged();
		}
		drawing.step++;
		if (drawing.step >= STEPS.length) drawing.done = true;
		else drawing.left = STEPS[drawing.step].seconds;
		this.startWhenReady();
	}

	// The battle starts once every side played by a person is seated and done drawing
	startWhenReady() {
		const { state } = this;

		if (state.phase !== 'draw') return;
		if (humanTeams(state).every(team => state.seats[team] && state.drawing[team].done)) this.startBattle();
	}

	startBattle() {
		const { state } = this;
		const uses = new Set(artOf(state));

		// Every army fights with something: anything missing (an old save, a side left half drawn) is the defaults
		for (const team of uses) {
			for (const { kind } of STEPS) if (!state.art[team][kind]?.length) state.art[team][kind] = defaultsFor(kind);
		}
		this.world = new World({ arts: state.art, artOf: artOf(state), auto: [false, state.mode === 'cpu'] });
		this.world.hold = state.hold = [false, false];
		this.sendAt = [-Infinity, -Infinity];
		state.phase = 'battle';
		state.result = null;
		state.battles++;
		this.artChanged();
	}

	tick() {
		const { state } = this;
		const away = this.away();
		const seconds = TICK_MS / 1000;

		if (state.phase === 'draw') {
			for (const team of humanTeams(state)) {
				const drawing = state.drawing[team];

				if (!state.seats[team] || drawing.done || away.includes(team)) continue;
				drawing.left -= seconds;
				if (drawing.left <= 0) this.finishStep(team);
			}

			// Sent when the clocks show something new, not every tick
			const shown = JSON.stringify([state.phase, state.drawing.map(({ step, left }) => [step, Math.ceil(left)]), away]);

			if (shown !== this.shown) {
				this.shown = shown;
				this.publish();
			}

			return;
		}
		if (!this.world) return;
		if (state.phase === 'battle' && away.length) {
			if (this.shown !== 'paused') {
				this.shown = 'paused';
				this.publish();
			}

			return;
		}
		this.shown = '';

		// A big moment plays out slower: one step a tick instead of three
		const world = this.world;
		const steps = world.slow > 0 ? 1 : Math.round(seconds / DT);

		world.slow -= seconds;
		for (let i = 0; i < steps; i++) world.step(DT);
		if (state.phase === 'battle' && world.over && world.overT > END_AFTER) {
			state.result = { winner: world.over.winner, stats: structuredClone(world.stats) };
			state.phase = 'over';
		}
		this.outEvents = world.takeEvents();
		this.snap = world.snapshot();
		this.publish();
		this.outEvents = [];
	}

	// What each page is sent: the game's state (the art itself goes once, on a page's first view and when it changes,
	// by artChanged), the battle as it is now, and what just happened in it
	viewFor(_playerId, how) {
		const { art, ...rest } = this.savedState();

		return {
			state: { ...rest, kept: art.map(byKind => Object.fromEntries(Object.entries(byKind).map(([kind, items]) => [kind, items.length]))) },
			players: this.toClient().players,
			away: this.away(),
			battle: this.world ? (this.snap ?? this.world.snapshot()) : null,
			events: this.outEvents,
			...(how?.first && { art: this.artView() }),
		};
	}

	artView() {
		return { art: this.state.art, artOf: artOf(this.state) };
	}

	// Every page here gets the art again: a drawing kept, the defaults filled in, a new battle's armies
	artChanged() {
		this.broadcast('art', this.artView());
	}

	// What the lobby lists: who, which mode, how far along; never the art
	toClient() {
		const { mode, phase, seats } = this.state ?? {};

		return { ...super.toClient(), state: { mode, phase, seats } };
	}

	toSaveState() {
		return { ...super.toSaveState(), state: this.savedState() };
	}

	// A new player takes the first free side a person plays; anyone after that watches
	onPlayerAdded(player) {
		const free = humanTeams(this.state).find(team => !this.state.seats[team]);

		if (free !== undefined) this.state.seats[free] = player.id;
		this.startWhenReady();
		this.publish();
	}

	onPresence() {
		this.shown = '';
		this.publish();
	}

	// A player gone for good: their side is free for someone new, who draws their own army. A battle they were in ends.
	onPlayerRemoved(id) {
		const team = this.state.seats.indexOf(id);

		if (team < 0) return this.publish();
		this.state.seats[team] = null;
		this.resetArt(team);
		if (this.state.phase !== 'draw') {
			this.world = null;
			this.state.phase = 'draw';
		}
		this.publish();
	}
}
