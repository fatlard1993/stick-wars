import { Game as BaseGame, refuse } from '@fatlard1993/web-game-framework';

import { cpuArmy, cpuGladiator, defaultsFor, freshOf, judge } from './art.js';
import { AMMO, ARMY, DT, ORDERS, World } from './battle.js';
import {
	CPU_SIZE,
	MOST_KEPT,
	TICK_MS,
	armySize,
	artOf,
	emptyArt,
	humanTeams,
	newDrawing,
	newState,
	stepsOf,
	wallSize,
} from './rules.js';
import Armory from './armory.js';
import Roster from './roster.js';

// The hall of gladiators every game shares: winners kept and fought again (only in memory while testing)
export const HALL = new Roster(process.env.NODE_ENV === 'test' ? null : 'data/gladiators.json');

// The armory every game shares: weapons players drew, borrowed, voted on and counted (only in memory while testing)
export const ARMORY = new Armory(process.env.NODE_ENV === 'test' ? null : 'data/weapons.json');

// How long a won battle plays on before its end is called, in battle seconds
const END_AFTER = 2.2;

// One running game, on the server: who sits on each side, the art each side has drawn, and once both are done, the
// battle (battle.js), stepped here and sent to every page many times a second. Drawings are judged here too, so what
// a page keeps is what passed.
export default class Game extends BaseGame {
	static version = 4;
	static migrations = {
		// Version 2 drew without an ammo page (weapons were step 3); version 3 has it back, as version 1 did. A save made
		// with version 2 (save.version is what it was saved as, while migrating) and part way past beams moves on a step.
		3: save => {
			if (save.version !== 2) return;
			for (const drawing of save.state?.drawing ?? []) if (!drawing.done && drawing.step >= 3) drawing.step++;
		},
		// Version 4 added gladiators: a game saved before is a war, with no saved gladiators in it
		4: save => {
			if (!save.state) return;
			save.state.style ??= 'war';
			save.state.fame ??= [null, null];
		},
	};

	constructor(options) {
		super(options);

		// Back from the save file after a restart, or new
		this.state = options.saveState?.state ?? newState(this.options.mode, this.options.style);
		this.roster = options.roster ?? HALL;
		this.armory = options.armory ?? ARMORY;
		this.outEvents = [];
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

			const { kind } = stepsOf(this.state)[drawing.step];
			const kept = this.state.art[team][kind];
			const gladiator = this.state.style === 'gladiator';

			// Rocks are the catapult's whole pile for a battle, so no more than it may throw
			const most = kind === 'ammo' ? AMMO : MOST_KEPT;

			if (!gladiator && kept.length >= most) refuse(`That's plenty: ${most} is the most.`);

			// Armor and a shield are drawn for the warrior already drawn, and sized by it
			const verdict = judge(kind, strokes, { warrior: this.state.art[team].stickmen?.[0] });

			if (!verdict.ok) refuse(verdict.msg);
			// Drawn by a person, so it counts toward a bigger army or wall (the defaults never do); a new weapon goes into
			// the armory, for anyone to borrow
			const item = { ...verdict.item, drawn: true };
			const shelved = kind === 'swords' && this.armory.offer(item);

			if (shelved) item.armory = shelved;
			kept.push(item);
			this.artChanged();
			// A gladiator has one of each: kept, and on to the next page
			if (gladiator) this.finishStep(team);

			// Whether it's a new one, or too like one kept already to earn another man (stick men and weapons, in a war)
			const fresh = gladiator || !['stickmen', 'swords'].includes(kind) || freshOf(kind, kept.filter(item => item.drawn)).at(-1);

			return { kind, kept: kept.length, stats: verdict.item.stats ?? null, fresh };
		},

		// A rock drawn mid-battle, onto our catapult's pile, if it passes the ammo check and we may still draw one
		rock(player, { strokes } = {}) {
			const team = this.teamOf(player.id);

			if (this.state.phase !== 'battle' || !this.world) refuse('No battle on');
			if (this.world.arena) refuse('No catapult in the arena');
			if (this.world.drawnRocks[team] >= AMMO) refuse('No more rocks this battle');

			const verdict = judge('ammo', strokes);

			if (!verdict.ok) refuse(verdict.msg);

			const rocks = this.state.art[team].ammo;

			// Drawn in battle: on the pile for this one only, not for a rematch
			rocks.push({ ...verdict.item, inBattle: true });
			this.world.addRock(team, rocks.length - 1);
			this.artChanged();

			return { left: AMMO - this.world.drawnRocks[team] };
		},

		// A weapon borrowed from the armory instead of drawn: it fights the same, but earns no extra man
		borrow(player, { id } = {}) {
			const team = this.teamOf(player.id);
			const drawing = this.state.drawing[team];

			if (this.state.phase !== 'draw' || !drawing || drawing.done) refuse('Not drawing now');
			if (stepsOf(this.state)[drawing.step].kind !== 'swords') refuse('Only weapons are borrowed');

			const entry = this.armory.get(id);

			if (!entry) refuse('That one is gone');

			const kept = this.state.art[team].swords;
			const gladiator = this.state.style === 'gladiator';

			if (!gladiator && kept.length >= MOST_KEPT) refuse(`That's plenty: ${MOST_KEPT} is the most.`);
			kept.push({ ...structuredClone(entry.item), armory: entry.id });
			this.artChanged();
			if (gladiator) this.finishStep(team);

			return { kept: kept.length };
		},

		// Done with this step before the clock runs out
		next(player) {
			const team = this.teamOf(player.id);

			if (this.state.phase !== 'draw' || this.state.drawing[team]?.done !== false) refuse('Not drawing now');
			this.finishStep(team);
		},

		// One man from home out to the fight
		send(player) {
			const team = this.teamOf(player.id);

			if (this.state.phase !== 'battle' || !this.world) refuse('No battle on');

			return { sent: this.world.send(team) };
		},

		// Some of our men (their ids, as the page picked them out) told what to do: stay home, hold the wall, charge, crew
		// our catapult, or repair it or our wall
		order(player, { ids, order, which } = {}) {
			const team = this.teamOf(player.id);

			if (this.state.phase !== 'battle' || !this.world) refuse('No battle on');
			if (!Array.isArray(ids) || ids.length > ARMY * 4 || !ids.every(Number.isInteger)) refuse('Pick some men first');
			if (!ORDERS.includes(order)) refuse('No such order');
			if (order === 'crew' && which !== 0) refuse('Which catapult?');
			if (order === 'repair' && ![0, 'wall'].includes(which)) refuse('Repair what?');

			const count = this.world.command(team, ids, order, which);

			if (!count && order === 'crew') refuse('That catapult has all the crew it can take');

			return { count };
		},

		// Our catapult aimed: it flings that way by itself whenever it's ready, until aimed again or told to hold its fire
		aim(player, { vx, vy, hold } = {}) {
			const team = this.teamOf(player.id);

			if (this.state.phase !== 'battle' || !this.world) refuse('No battle on');
			if (hold) return void this.world.setAim(team, null);
			if (!Number.isFinite(vx) || !Number.isFinite(vy)) refuse('Aim with a direction');
			this.world.setAim(team, [vx, vy]);
		},

		// Our gladiator told what to do for a few seconds: charge, back off, or guard
		shout(player, { stance } = {}) {
			const team = this.teamOf(player.id);

			if (this.state.phase !== 'battle' || !this.world?.arena) refuse('No duel on');
			if (!this.world.shout(team, stance)) refuse('Not now');
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
			// And the computer draws itself a new one too (or picks another gladiator to send)
			if (this.state.mode === 'cpu') {
				this.state.art[1] = emptyArt(this.state.style);
				this.state.fame[1] = null;
			}
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
		this.state.art[team] = emptyArt(this.state.style);
		this.state.drawing[team] = newDrawing(this.state.style);
		// A new drawing is a new gladiator, not the saved one it was
		this.state.fame[team] = null;
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
		const steps = stepsOf(this.state);
		const { kind, optional } = steps[drawing.step];

		// Left empty, a page gets the defaults; armor and a shield are only had if drawn
		if (!optional && !this.state.art[team][kind].length) {
			this.state.art[team][kind] = this.defaults(kind);
			this.artChanged();
		}
		drawing.step++;
		if (drawing.step >= steps.length) drawing.done = true;
		else drawing.left = steps[drawing.step].seconds;
		this.startWhenReady();
	}

	// A kind's defaults, for a page left empty: all of them for an army, the first for a gladiator, who has one of each
	defaults(kind) {
		const all = defaultsFor(kind);

		return this.state.style === 'gladiator' ? all.slice(0, 1) : all;
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
		const steps = stepsOf(state), gladiator = state.style === 'gladiator';

		// The computer's side is its own, made when it's first needed and kept for rematches: against a gladiator, one from
		// the hall of them if there are any, or one it draws
		if (state.mode === 'cpu' && steps.some(({ kind, optional }) => !optional && !state.art[1][kind]?.length)) {
			// The one picked from the hall to fight, if it's still there; or one the hall sends
			const champion = gladiator ? (this.roster.get(this.options.rival) ?? this.roster.pick()) : null;

			state.art[1] = champion ? structuredClone(champion.art) : gladiator ? cpuGladiator() : cpuArmy();
			state.fame[1] = champion?.id ?? null;
			// The computer arms itself partly from the armory: a couple of an army's weapons, now and then a gladiator's
			if (!champion) {
				const borrowed = this.armory.lend(gladiator ? (Math.random() < 0.4 ? 1 : 0) : 2).map(entry => ({ ...structuredClone(entry.item), armory: entry.id }));

				state.art[1].swords.splice(0, borrowed.length, ...borrowed);
			}
		}
		// Every army fights with something: anything missing (an old save, a side left half drawn) is the defaults
		for (const team of uses) {
			for (const { kind, optional } of steps) {
				if (!state.art[team][kind]) state.art[team][kind] = [];
				if (!optional && !state.art[team][kind].length) state.art[team][kind] = this.defaults(kind);
			}
		}
		if (gladiator) {
			// The computer cheers its own gladiator on, as a player does theirs
			const records = state.fame.map(id => this.roster.get(id) ?? null);

			this.world = new World({ arts: state.art, artOf: artOf(state), auto: [false, state.mode === 'cpu'], arena: true, records });
			this.snap = null;
			state.phase = 'battle';
			state.result = null;
			state.battles++;
			this.artChanged();

			return;
		}
		// Every battle a person's catapult starts with the rocks drawn before it; those drawn in the last one are gone
		for (const team of humanTeams(state)) state.art[team].ammo = state.art[team].ammo.filter(rock => !rock.inBattle);

		const auto = [false, state.mode === 'cpu'];
		const sides = artOf(state).map((a, team) =>
			auto[team] ? CPU_SIZE : { army: armySize(state.art[a]), wall: wallSize(state.art[a]) },
		);

		this.world = new World({
			arts: state.art,
			artOf: artOf(state),
			auto,
			armies: sides.map(side => side.army),
			walls: sides.map(side => side.wall),
		});
		this.snap = null;
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
			// A duel's loser was spared by the crowd, or not (one killed outright has no say)
			state.result = { winner: world.over.winner, stats: structuredClone(world.stats), ...(world.arena && { spared: Boolean(world.over.spared) }) };
			state.phase = 'over';
			this.honour(world.over.winner, Boolean(world.over.spared));
			this.armoryAfter(world);
		}
		this.outEvents = world.takeEvents();
		this.snap = world.snapshot();
		this.publish();
		this.outEvents = [];
	}

	// A gladiators' fight won: the winner into the hall (or its record up there); the loser, spared by the crowd, keeps
	// its place there or earns one, and if not, is struck from it
	honour(winner, spared) {
		const { state } = this;

		if (state.style !== 'gladiator' || (winner !== 0 && winner !== 1)) return;

		const loser = 1 - winner;
		const ids = this.roster.record({ id: state.fame[winner], art: state.art[winner] }, { id: state.fame[loser], art: state.art[loser], spared });

		state.fame[winner] = ids.winner;
		state.fame[loser] = ids.loser;
	}

	// A battle over: every armory weapon in it fought once more, and its kills counted
	armoryAfter(world) {
		const swordsOf = a => this.state.art[a]?.swords ?? [];
		const uses = [...new Set(world.artOf)].flatMap(a => swordsOf(a).map(item => item.armory)).filter(Boolean);
		const kills = {};

		for (const [key, count] of Object.entries(world.stats.weaponKills ?? {})) {
			const [a, i] = key.split(':').map(Number), id = swordsOf(a)[i]?.armory;

			if (id) kills[id] = (kills[id] ?? 0) + count;
		}
		this.armory.fought(uses, kills);
	}

	// What each page is sent: the game's state (the art itself goes once, on a page's first view and when it changes,
	// by artChanged), the battle as it is now, and what just happened in it
	viewFor(_playerId, how) {
		const { art, ...rest } = this.savedState();

		return {
			state: { ...rest, kept: art.map(byKind => Object.fromEntries(Object.entries(byKind).map(([kind, items]) => [kind, items.length]))) },
			players: this.toClient().players,
			away: this.away(),
			// Each side's record in the hall of gladiators, if it's one of them
			fame: (this.state.fame ?? []).map(id => {
				const entry = this.roster.get(id);

				return entry ? { wins: entry.wins, losses: entry.losses } : null;
			}),
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
		const { mode, style, phase, seats } = this.state ?? {};

		return { ...super.toClient(), state: { mode, style, phase, seats } };
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
