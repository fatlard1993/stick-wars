import { expect, test } from 'bun:test';

import { DEFAULT_RAW, judge, lineS } from './art.js';
import { ARMY, DT, World } from './battle.js';
import Game from './Game.js';
import { STEPS, emptyArt } from './rules.js';

const quiet = { info() {}, debug() {}, warning() {}, error() {} };
const server = () => ({ games: {}, publish() {}, socketBroadcast() {} });
const newGame = mode => {
	const game = new Game({ mode, server: server(), logger: quiet });

	game.dispose();

	return game;
};
// Every step drawn with the first default drawing of its kind, kept, then moved on
const drawEverything = (game, id) => {
	for (const { kind } of STEPS) {
		expect(game.act(id, 'keep', { strokes: DEFAULT_RAW[kind]()[0] }).ok).toBe(true);
		expect(game.act(id, 'next').ok).toBe(true);
	}
};

test('every default drawing passes its own check', () => {
	for (const { kind } of STEPS) for (const raw of DEFAULT_RAW[kind]()) expect(judge(kind, raw).ok).toBe(true);
});

test('a drawing that is not the thing asked for is turned down, saying why', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');
	const said = game.act(fox.id, 'keep', { strokes: [lineS(240, 50, 240, 400)] });

	expect(said.ok).toBe(false);
	expect(said.error).toContain('head');
	expect(game.act(fox.id, 'keep', { strokes: 'nonsense' }).ok).toBe(false);
	expect(game.state.art[0].stickmen).toHaveLength(0);
});

test('against the computer, the battle starts once the one player has drawn everything', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	expect(game.state.seats).toEqual([fox.id, null]);
	drawEverything(game, fox.id);
	expect(game.state.phase).toBe('battle');
	expect(game.world.auto).toEqual([false, true]);
	expect(game.world.artOf).toEqual([0, 0]);
});

test('a step left with nothing kept gets the defaults', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	game.act(fox.id, 'next');
	expect(game.state.art[0].stickmen.length).toBeGreaterThan(0);
	expect(game.state.drawing[0].step).toBe(1);
});

test('the clock runs a step out on its own, and stops while the player is away', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	game.state.drawing[0].left = 0.01;
	game.tick();
	expect(game.state.drawing[0].step).toBe(1);

	const left = game.state.drawing[0].left;

	game.online.delete(fox.id);
	game.tick();
	expect(game.state.drawing[0].left).toBe(left);
});

test('two players each draw their own army, and fight once both are done', () => {
	const game = newGame('duo');
	const fox = game.addPlayer('🦊');
	const frog = game.addPlayer('🐸');
	const owl = game.addPlayer('🦉');

	expect(game.state.seats).toEqual([fox.id, frog.id]);
	drawEverything(game, fox.id);
	expect(game.state.phase).toBe('draw');
	drawEverything(game, frog.id);
	expect(game.state.phase).toBe('battle');
	expect(game.world.auto).toEqual([false, false]);
	expect(game.world.artOf).toEqual([0, 1]);
	expect(game.act(owl.id, 'send').error).toBe('You are watching this one');
});

test('every man stands at home from the start, one crewing each catapult', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);

	const mine = game.world.stickmen.filter(s => s.team === 0);

	expect(game.world.stickmen).toHaveLength(ARMY * 2);
	expect(mine.filter(s => s.order === 'crew')).toHaveLength(2);
	expect(mine.filter(s => s.order === 'idle')).toHaveLength(ARMY - 2);
	expect(game.viewFor(fox.id).battle.bodies.filter(b => b.t === 0 && b.u)).toHaveLength(ARMY);
});

test('in battle a player sends men out, orders the ones they picked, and crews their catapults', () => {
	const game = newGame('duo');
	const fox = game.addPlayer('🦊');
	const frog = game.addPlayer('🐸');

	drawEverything(game, fox.id);
	drawEverything(game, frog.id);

	const world = game.world;
	const frogs = () => world.stickmen.filter(s => s.team === 1);
	const foxes = () => world.stickmen.filter(s => s.team === 0);

	expect(game.act(frog.id, 'send')).toEqual({ ok: true, result: { sent: true } });
	expect(frogs().filter(s => s.order === 'charge')).toHaveLength(1);
	expect(game.act(frog.id, 'send')).toEqual({ ok: true, result: { sent: false } });

	const picked = foxes()
		.filter(s => s.order === 'idle')
		.slice(0, 3)
		.map(s => s.body.id);

	expect(game.act(fox.id, 'order', { ids: picked, order: 'hold' }).result).toEqual({ count: 3 });
	expect(foxes().filter(s => s.order === 'hold')).toHaveLength(3);
	// Someone else's men don't take your orders
	expect(game.act(frog.id, 'order', { ids: picked, order: 'charge' }).result).toEqual({ count: 0 });
	expect(game.act(fox.id, 'order', { ids: picked, order: 'march' }).ok).toBe(false);

	// A catapult takes three at most: the one already there and two more
	expect(game.act(fox.id, 'order', { ids: picked, order: 'crew', which: 0 }).result).toEqual({ count: 2 });
	expect(game.act(fox.id, 'order', { ids: picked, order: 'crew', which: 0 }).ok).toBe(true);
	expect(world.cats[0].crewing()).toHaveLength(3);

	// Crew in place, it flings; with nobody at it, it doesn't
	// Long enough to walk back from holding the wall
	for (let i = 0; i < 60 * 8; i++) world.step(DT);
	for (const cat of world.cats) cat.cd = 0;
	expect(world.cats[0].crew()).toBe(3);
	expect(game.act(fox.id, 'fling', { which: 0, vx: 500, vy: -600 }).ok).toBe(true);
	expect(world.cats[0].ammo).toBe(5);

	const crew1 = world.cats[1].crewing().map(s => s.body.id);

	game.act(fox.id, 'order', { ids: crew1, order: 'idle' });
	for (let i = 0; i < 60 * 3; i++) world.step(DT);
	world.cats[1].cd = 0;
	expect(game.act(fox.id, 'fling', { which: 1, vx: 500, vy: -600 }).error).toBe('Not ready');
	expect(game.act(fox.id, 'fling', { which: 7, vx: 1, vy: 1 }).ok).toBe(false);
});

test('a page sees the art once, then the battle every tick with what just happened', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);

	const first = game.viewFor(fox.id, { first: true });
	const later = game.viewFor(fox.id, { first: false });

	expect(first.art.art[0].stickmen).toHaveLength(1);
	expect(later.art).toBeUndefined();
	expect(later.state.art).toBeUndefined();
	expect(later.state.kept[0].stickmen).toBe(1);
	expect(later.battle.walls).toHaveLength(2);
	game.tick();
	expect(game.viewFor(fox.id).battle.bodies).toHaveLength(ARMY * 2);
});

test('a whole battle runs to a winner, cutting people apart on the way', () => {
	const arts = [emptyArt(), emptyArt()];

	for (const { kind } of STEPS) arts[0][kind] = DEFAULT_RAW[kind]().map(raw => judge(kind, raw).item);

	const world = new World({ arts, artOf: [0, 0], auto: [true, true] });
	let steps = 0;

	while (!world.over && steps < 60 * 240) {
		world.step(DT);
		steps++;
	}
	expect(world.over).not.toBeNull();
	expect(world.stats.limbs).toBeGreaterThan(0);
	// A tick's picture stays small enough to send twenty times a second
	expect(JSON.stringify(world.snapshot()).length).toBeLessThan(70_000);
});

test('the art is saved and the battle is not; a game saved mid-battle comes back fighting with the same art', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);

	const save = JSON.parse(JSON.stringify(game.toSaveState()));

	expect(save.version).toBe(1);
	expect(save.state.art[0].swords).toHaveLength(1);

	const back = new Game({ saveState: save, server: server(), logger: quiet });

	back.dispose();
	expect(back.state.phase).toBe('battle');
	expect(back.world).not.toBeNull();
	expect(back.state.art[0].swords).toEqual(game.state.art[0].swords);
});

test('when the opponent leaves, their side is free and the next one to come draws their own army', () => {
	const game = newGame('duo');
	const fox = game.addPlayer('🦊');
	const frog = game.addPlayer('🐸');

	drawEverything(game, fox.id);
	drawEverything(game, frog.id);
	game.removePlayer(frog.id);
	expect(game.state.phase).toBe('draw');
	expect(game.state.seats).toEqual([fox.id, null]);
	expect(game.state.art[1].stickmen).toHaveLength(0);

	const owl = game.addPlayer('🦉');

	expect(game.state.seats[1]).toBe(owl.id);
	drawEverything(game, owl.id);
	expect(game.state.phase).toBe('battle');
});
