import { expect, test } from 'bun:test';

import { DEFAULT_RAW, blobS, cpuArmy, cpuGladiator, judge, lineS, ringS, samePose, sameWeapon, starS } from './art.js';
import { AMMO, DT, FADE, GLADIATOR_HP, GROUND, LINGER, MERCY_WAIT, PLANS, STANCE_FOR, World, rockThrow } from './battle.js';
import Game from './Game.js';
import Shelf from './shelf.js';
import Roster from './roster.js';
import { BASE_ARMY, CPU_SIZE, GLADIATOR_STEPS, STEPS, emptyArt } from './rules.js';

const quiet = { info() {}, debug() {}, warning() {}, error() {} };
const server = () => ({ games: {}, publish() {}, socketBroadcast() {} });
const newGame = (mode, style, roster = new Roster(), armory = new Shelf(null, { alike: sameWeapon }), crowd = new Shelf(null, { alike: samePose, show: item => ({ raw: item.raw, rig: item.rig }) })) => {
	const game = new Game({ mode, style, roster, armory, crowd, server: server(), logger: quiet });

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

test('any shape big enough is a weapon, and the bigger and clunkier it is, the slower it swings', () => {
	const dagger = judge('swords', [lineS(240, 300, 240, 160)]);
	const slab = judge('swords', [blobS(240, 300, 90, 90, 9)]);

	expect(dagger.ok).toBe(true);
	expect(slab.ok).toBe(true);
	expect(slab.item.stats.swing).toBeGreaterThan(dagger.item.stats.swing * 1.5);
	expect(slab.item.stats.dmg).toBeGreaterThan(dagger.item.stats.dmg);
	expect(judge('swords', [lineS(240, 240, 260, 260)]).ok).toBe(false);
	// It has to stay in the box drawn for it
	expect(judge('swords', [lineS(60, 400, 420, 60)]).msg).toBe('Keep the weapon inside the box.');
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
	// The computer fights with an army of its own, not the player's drawings
	expect(game.world.artOf).toEqual([0, 1]);
	expect(game.state.art[1].stickmen.length).toBeGreaterThan(2);
	expect(game.state.art[1].swords).not.toEqual(game.state.art[0].swords);
	expect(game.world.stickmen.filter(s => s.team === 1).every(s => s.body.ref.a === 1)).toBe(true);
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
	expect(game.act(owl.id, 'order', { ids: [], order: 'charge' }).error).toBe('You are watching this one');
});

test('every man stands at home from the start, one crewing the catapult', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);

	const mine = game.world.stickmen.filter(s => s.team === 0);

	// One of each drawn: no bonus. The computer fights with a middling army.
	expect(mine).toHaveLength(BASE_ARMY);
	expect(game.world.stickmen).toHaveLength(BASE_ARMY + CPU_SIZE.army);
	expect(mine.filter(s => s.order === 'crew')).toHaveLength(1);
	expect(mine.filter(s => s.order === 'idle')).toHaveLength(BASE_ARMY - 1);
	expect(game.viewFor(fox.id).battle.bodies.filter(b => b.t === 0 && b.u)).toHaveLength(BASE_ARMY);
});

test('drawing more stick men and weapons earns more men, and more stones a bigger wall; the defaults earn nothing', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	// Three different stick men (arms down, up and out) and three different weapons (a sword, an axe, a spiked ball)
	const men = [DEFAULT_RAW.stickmen()[0], DEFAULT_RAW.stickmen()[1], [ringS(240, 95, 36, 38), lineS(240, 133, 240, 285), lineS(240, 175, 140, 175), lineS(240, 175, 340, 175), lineS(240, 285, 150, 400), lineS(240, 285, 330, 400)]];
	const weapons = [DEFAULT_RAW.swords()[0], DEFAULT_RAW.swords()[1], [lineS(240, 450, 240, 200), starS(240, 140, 70, 45, 8)]];

	for (const { kind } of STEPS) {
		const drawings = { stickmen: men, swords: weapons, stones: Array.from({ length: 5 }, () => DEFAULT_RAW.stones()[0]) }[kind] ?? [DEFAULT_RAW[kind]()[0]];

		for (const strokes of drawings) expect(game.act(fox.id, 'keep', { strokes }).ok).toBe(true);
		game.act(fox.id, 'next');
	}

	const wall = game.world.walls[0];

	expect(game.world.stickmen.filter(s => s.team === 0)).toHaveLength(BASE_ARMY + 4);
	expect([wall.cols, wall.rows]).toEqual([4, 9]);
	expect(game.world.masonry.standing(0)).toHaveLength(36);
	// The wall's face toward home stays where it was: a thicker wall reaches further out
	expect(wall.x0).toBe(430);

	const lazy = newGame('cpu');
	const frog = lazy.addPlayer('🐸');

	for (const _ of STEPS) lazy.act(frog.id, 'next');
	expect(lazy.world.stickmen.filter(s => s.team === 0)).toHaveLength(BASE_ARMY);
	expect([lazy.world.walls[0].cols, lazy.world.walls[0].rows]).toEqual([3, 6]);
});

test('the catapult throws only drawn rocks: those drawn before the battle, and more drawn during it, up to the most a battle allows', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);

	const cat = game.world.cats[0];
	const rock = DEFAULT_RAW.ammo()[0];

	// The one drawn before the battle is on the pile; the computer's own are on its
	expect(cat.ammo).toBe(1);
	expect(game.world.cats[1].ammo).toBe(game.state.art[1].ammo.length);
	expect(game.act(fox.id, 'rock', { strokes: [lineS(240, 50, 240, 400)] }).ok).toBe(false);
	expect(game.act(fox.id, 'rock', { strokes: rock }).result).toEqual({ left: AMMO - 2 });
	expect(cat.ammo).toBe(2);
	expect(cat.snapshot().l).toEqual([0, 0]);
	for (let k = 2; k < AMMO; k++) game.act(fox.id, 'rock', { strokes: rock });
	expect(game.act(fox.id, 'rock', { strokes: rock }).error).toBe('No more rocks this battle');
	expect(cat.ammo).toBe(AMMO);

	const before = game.world.drawnRocks[1];

	for (let i = 0; i < 60 * 10; i++) game.world.step(DT);
	expect(game.world.drawnRocks[1]).toBeGreaterThan(before);
	// A rematch starts with the ones drawn before the battle, not those drawn in it
	game.state.phase = 'over';
	game.act(fox.id, 'again');
	expect(game.world.cats[0].ammo).toBe(1);
	expect(game.state.art[0].ammo).toHaveLength(1);
});

test('the rocks page keeps no more than a battle can throw, and left empty gives the default rocks', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	for (const { kind } of STEPS) {
		if (kind !== 'ammo') {
			game.act(fox.id, 'next');
			continue;
		}
		for (let k = 0; k < AMMO; k++) expect(game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.ammo()[0] }).ok).toBe(true);
		expect(game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.ammo()[0] }).ok).toBe(false);
		game.act(fox.id, 'next');
	}
	expect(game.world.cats[0].ammo).toBe(AMMO);

	const lazy = newGame('cpu');
	const frog = lazy.addPlayer('🐸');

	for (const _ of STEPS) lazy.act(frog.id, 'next');
	expect(lazy.world.cats[0].ammo).toBe(DEFAULT_RAW.ammo().length);
});

test('a catapult throws forward at a sensible angle, and never past the enemy wall', () => {
	const { game, fox, world } = soloBattle();
	const cat = world.cats[0];

	for (let k = 0; k < 4; k++) game.act(fox.id, 'rock', { strokes: DEFAULT_RAW.ammo()[0] });
	game.act(fox.id, 'order', { ids: world.stickmen.filter(s => s.team === 0 && s.order === 'idle').slice(0, 2).map(s => s.body.id), order: 'crew', which: 0 });
	for (let i = 0; i < 60 * 6; i++) world.step(DT);
	// As hard as can be, almost flat, even backwards: held to what it can do
	for (const [vx, vy] of [[5000, -100], [-900, -900], [3000, -3000]]) {
		game.act(fox.id, 'aim', { vx, vy });

		const [ax, ay] = cat.aim;

		expect(ax).toBeGreaterThan(0);
		expect(Math.atan2(-ay, ax)).toBeGreaterThan(0.34);
		expect(Math.atan2(-ay, ax)).toBeLessThan(1.21);
	}
	// Whatever lands, lands short of what's behind the enemy wall
	let farthest = 0;

	for (let i = 0; i < 60 * 25; i++) {
		world.step(DT);
		for (const proj of world.projs) farthest = Math.max(farthest, proj.x);
	}
	expect(farthest).toBeGreaterThan(900);
	// One that goes over the top drops dead just behind it
	expect(farthest).toBeLessThan(world.walls[1].x1 + 40);
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

	// One man sent out at a time (as the computer sends them), and not again straight away
	expect(world.send(1)).toBe(true);
	expect(frogs().filter(s => s.order === 'charge')).toHaveLength(1);
	expect(world.send(1)).toBe(false);

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
	for (let k = 0; k < 5; k++) game.act(fox.id, 'rock', { strokes: DEFAULT_RAW.ammo()[0] });

	const loaded = world.cats[0].ammo;

	// Aimed, with its crew in place, it fires by itself as often as it can; told to hold, it stops
	for (let i = 0; i < 60 * 8; i++) world.step(DT);
	expect(world.cats[0].crew()).toBe(3);
	expect(game.act(fox.id, 'aim', { vx: 500, vy: -600 }).ok).toBe(true);
	for (let i = 0; i < 60 * 8; i++) world.step(DT);
	expect(loaded - world.cats[0].ammo).toBeGreaterThan(1);
	game.act(fox.id, 'aim', { hold: true });

	const held = world.cats[0].ammo;

	for (let i = 0; i < 60 * 8; i++) world.step(DT);
	expect(world.cats[0].ammo).toBe(held);
	// With nobody at it, it doesn't fire however it's aimed
	game.act(fox.id, 'order', { ids: world.cats[0].crewing().map(s => s.body.id), order: 'idle' });
	game.act(fox.id, 'aim', { vx: 500, vy: -600 });
	for (let i = 0; i < 60 * 8; i++) world.step(DT);
	expect(world.cats[0].ammo).toBe(held);
	expect(game.act(fox.id, 'aim', { vx: 'up' }).ok).toBe(false);
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
	expect(game.viewFor(fox.id).battle.bodies).toHaveLength(BASE_ARMY + CPU_SIZE.army);
});

test('a whole battle runs to a winner, cutting people apart on the way', () => {
	const arts = [emptyArt(), emptyArt()];

	for (const { kind } of STEPS) arts[0][kind] = DEFAULT_RAW[kind]().map(raw => judge(kind, raw).item);

	const world = new World({ arts: [arts[0], cpuArmy()], artOf: [0, 1], auto: [true, true] });
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

test('the computer plays by a plan picked for each battle, and whichever it plays, the battle ends', () => {
	expect(new Set(Array.from({ length: 40 }, () => new World({ arts: [cpuArmy(), cpuArmy()] }).ai[1].plan)).size).toBeGreaterThan(2);
	for (const plan of Object.keys(PLANS)) {
		const world = new World({ arts: [cpuArmy(), cpuArmy()], auto: [true, true], plans: [plan, 'balanced'] });

		for (let steps = 0; !world.over && steps < 60 * 240; steps++) world.step(DT);
		expect([plan, world.over]).not.toEqual([plan, null]);
	}
});

test('the art is saved and the battle is not; a game saved mid-battle comes back fighting with the same art', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);

	const save = JSON.parse(JSON.stringify(game.toSaveState()));

	expect(save.version).toBe(Game.version);
	expect(save.state.art[0].swords).toHaveLength(1);

	const back = new Game({ saveState: save, server: server(), logger: quiet });

	back.dispose();
	expect(back.state.phase).toBe('battle');
	expect(back.world).not.toBeNull();
	expect(back.state.art[0].swords).toEqual(game.state.art[0].swords);
});

test('a game saved part way through drawing loads on the page it was on, whichever pages it was saved with', () => {
	const load = (version, drawing) => {
		const save = JSON.parse(JSON.stringify(newGame('duo').toSaveState()));

		Object.assign(save, { version });
		save.state.drawing = drawing.map(step => ({ step, left: 9, done: false }));

		const back = new Game({ saveState: Game.migrate(save), server: server(), logger: quiet });

		back.dispose();

		return back.state.drawing.map(({ step }) => STEPS[step].kind);
	};

	// Version 1 had the rocks page, as now; version 2 didn't
	expect(load(1, [3, 4])).toEqual(['ammo', 'swords']);
	expect(load(2, [2, 3])).toEqual(['beams', 'swords']);
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

const soloBattle = () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);
	// The computer sits this one out
	game.world.auto = [false, false];

	return { game, fox, world: game.world };
};

test('at home the army stands spread out in rows across the field, nobody on top of anybody', () => {
	const { world } = soloBattle();
	const mine = world.stickmen.filter(s => s.team === 0 && s.order === 'idle');

	for (let i = 0; i < 60 * 3; i++) world.step(DT);
	for (const a of mine) for (const b of mine) if (a !== b) expect(Math.hypot(a.x - b.x, (a.z - b.z) * 1.5)).toBeGreaterThan(12);
	expect(new Set(mine.map(s => Math.round(s.z / 25))).size).toBeGreaterThan(2);
});

test('a wall of drawn stones stands untouched, without settling or sliding', () => {
	const { world } = soloBattle();
	const before = world.masonry.snapshot();

	for (let i = 0; i < 60 * 5; i++) world.step(DT);

	const after = world.masonry.snapshot();

	expect(after).toHaveLength(before.length);
	after.forEach((brick, at) => {
		expect(Math.abs(brick[4] - before[at][4])).toBeLessThan(2);
		expect(Math.abs(brick[5] - before[at][5])).toBeLessThan(2);
		expect(brick[10]).toBe(before[at][10]);
	});
});

test('a boulder knocks stones out of the wall and breaks some, and what loses its support falls', () => {
	const { world } = soloBattle();
	const wall = world.walls[1];
	const before = world.masonry.standing(1).length;

	// Straight into the middle of the wall, low and hard
	const boulder = world.masonry.addBoulder(wall.x0 - 200, GROUND - 60, 1300, -60, 16, 2.5);

	for (let i = 0; i < 60 * 4; i++) world.step(DT);
	world.masonry.remove(boulder);
	expect(world.masonry.standing(1).length).toBeLessThan(before);
	expect(world.masonry.missing(1)).toBeGreaterThan(0);
});

test('a man hacks at the enemy wall in front of him, cracking and breaking its stones', () => {
	const { world } = soloBattle();
	// What's left of the wall: each stone standing, as much as it has left (a broken one has none)
	const health = () => world.masonry.standing(1).reduce((sum, b) => sum + b.hp, 0);
	const before = health();
	const man = world.stickmen.find(s => s.team === 0 && s.order === 'idle');

	man.x = world.walls[1].x0 - 30;
	man.z = 60;
	man.order = 'charge';
	// He may not live to see it fall: a stone knocked loose can come down on him
	for (let i = 0; i < 60 * 30; i++) world.step(DT);
	expect(health()).toBeLessThan(before);
});

test('repairers patch the wall and set new stones into its gaps until it stands whole again', () => {
	const { game, fox, world } = soloBattle();

	for (const brick of world.masonry.standing(0).slice(-3)) world.masonry.breakBrick(brick);
	world.masonry.standing(0)[0].hp = 1;
	expect(world.masonry.missing(0)).toBe(3);

	const ids = world.stickmen.filter(s => s.team === 0 && s.order === 'idle').slice(0, 3).map(s => s.body.id);

	expect(game.act(fox.id, 'order', { ids, order: 'repair', which: 'wall' }).result).toEqual({ count: 3 });
	expect(game.act(fox.id, 'order', { ids, order: 'repair', which: 'tower' }).ok).toBe(false);
	for (let i = 0; i < 60 * 40 && world.masonry.needsRepair(0); i++) world.step(DT);
	expect(world.masonry.missing(0)).toBe(0);
	expect(world.masonry.standing(0).every(b => b.hp >= b.max)).toBe(true);
});

test('a smashed catapult is rebuilt by its repairers, and fires again once its crew is back', () => {
	const { game, fox, world } = soloBattle();
	const cat = world.cats[0];

	cat.damage(500);
	expect(cat.dead).toBe(true);
	// Its crew leave it on their next step
	world.step(DT);
	expect(cat.crewing()).toHaveLength(0);

	const ids = world.stickmen.filter(s => s.team === 0 && s.order === 'idle').slice(0, 3).map(s => s.body.id);

	game.act(fox.id, 'order', { ids, order: 'repair', which: 0 });
	for (let i = 0; i < 60 * 40 && cat.dead; i++) world.step(DT);
	expect(cat.dead).toBe(false);
	// Back at half, or a little more if another repairer's blow mended it in the same moment
	expect(cat.hp).toBeGreaterThanOrEqual(50);
	expect(cat.hp).toBeLessThan(75);
	for (let i = 0; i < 60 * 15 && cat.hp < 100; i++) world.step(DT);
	expect(cat.hp).toBe(100);
	game.act(fox.id, 'order', { ids: ids.slice(0, 1), order: 'crew', which: 0 });
	game.act(fox.id, 'rock', { strokes: DEFAULT_RAW.ammo()[0] });
	for (let i = 0; i < 60 * 6; i++) world.step(DT);
	game.act(fox.id, 'aim', { vx: 500, vy: -600 });
	for (let i = 0; i < 60 * 6; i++) world.step(DT);
	expect(cat.ammo).toBeLessThan(2);
});

test('the dead and the wreckage lie a while, fade, and are gone', () => {
	const { world } = soloBattle();
	const man = world.stickmen.find(s => s.team === 1);

	man.die(0, 0);
	world.cats[0].damage(500);

	const body = man.body;
	const wreck = world.props.length;

	expect(wreck).toBeGreaterThan(0);
	for (let i = 0; i < 60 * (LINGER.body + FADE / 2); i++) world.step(DT);

	const fading = world.snapshot().bodies.find(b => b.id === body.id);

	expect(fading.fa).toBeGreaterThan(0);
	expect(fading.fa).toBeLessThan(1);
	expect(world.props).toHaveLength(0);
	for (let i = 0; i < 60 * FADE; i++) world.step(DT);
	expect(world.bodies.includes(body)).toBe(false);
});

test('a stone knocked out of the wall fades once it has lain loose a while, and is out of the way', () => {
	const { world } = soloBattle();
	// The top stone of the wall, knocked off it
	const top = world.masonry.standing(1).sort((a, b) => world.masonry.read(a.body).y - world.masonry.read(b.body).y)[0];

	world.masonry.setSpeed(top.body, -450, -350);
	top.body.setAwake(true);
	for (let i = 0; i < 60 * 2; i++) world.step(DT);
	expect(top.loose).toBe(true);
	for (let i = 0; i < 60 * (LINGER.brick + FADE + 4); i++) world.step(DT);
	expect(world.masonry.bricks).not.toContain(top);
	// Anything it knocked loose on the way goes the same way, in its own time
	expect(world.masonry.bricks.filter(b => b.loose && world.masonry.time - b.looseAt > LINGER.brick + FADE + 0.1)).toHaveLength(0);
});

// ---------------------------------------------------------------- gladiators

// A gladiator drawn: the default warrior and weapon, a helmet and breastplate over him, and a round shield
const helmetOn = warrior => {
	const { head } = warrior.rig.raw;

	return [ringS(head.cx, head.cy, head.r * 1.25, head.r * 1.25), ringS(head.cx, head.cy + head.r * 3, head.r * 0.9, head.r * 1.6)];
};
const drawGladiator = (game, id, { armor = true, shield = true } = {}) => {
	// Each page moves on by itself once its one drawing is kept; one left empty is moved on from
	expect(game.act(id, 'keep', { strokes: DEFAULT_RAW.stickmen()[0] }).ok).toBe(true);
	expect(game.act(id, 'keep', { strokes: DEFAULT_RAW.swords()[0] }).ok).toBe(true);
	if (armor) expect(game.act(id, 'keep', { strokes: helmetOn(game.state.art[game.state.seats.indexOf(id)].stickmen[0]) }).ok).toBe(true);
	else game.act(id, 'next');
	if (shield) expect(game.act(id, 'keep', { strokes: [blobS(240, 240, 90, 90, 10)] }).ok).toBe(true);
	else game.act(id, 'next');
};

test('a gladiator is one warrior and its weapon, with armor and a shield if drawn; each page takes one and moves on', () => {
	const game = newGame('cpu', 'gladiator');
	const fox = game.addPlayer('🦊');

	expect(game.state.style).toBe('gladiator');
	expect(game.state.drawing[0].left).toBe(GLADIATOR_STEPS[0].seconds);
	// One warrior kept, and it's on to the weapon page
	expect(game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.stickmen()[0] }).ok).toBe(true);
	expect(game.state.drawing[0].step).toBe(1);
	expect(game.state.art[0].stickmen).toHaveLength(1);
	// The weapon page skipped: one default weapon
	game.act(fox.id, 'next');
	// Armor has to be drawn on the warrior
	expect(game.act(fox.id, 'keep', { strokes: [lineS(10, 10, 60, 12)] }).error).toBe('Draw the armor on your warrior.');
	expect(game.act(fox.id, 'keep', { strokes: helmetOn(game.state.art[0].stickmen[0]) }).ok).toBe(true);
	expect(game.state.art[0].armor).toHaveLength(1);
	expect(game.state.art[0].armor[0].cover.head).toBeGreaterThan(0.5);
	// No shield drawn: none had, not a default
	game.act(fox.id, 'next');
	expect(game.state.phase).toBe('battle');
	expect(game.state.art[0].swords).toHaveLength(1);
	expect(game.state.art[0].shield).toHaveLength(0);
	expect(game.world.arena).toBe(true);
	expect(game.world.stickmen).toHaveLength(2);
	expect(game.world.cats).toHaveLength(0);

	const [mine] = game.world.stickmen;

	expect(mine.body.armor).not.toBeNull();
	expect(mine.body.shield).toBeNull();
	expect(mine.hp).toBe(mine.maxHp);
	expect(mine.maxHp).toBeGreaterThan(GLADIATOR_HP * 0.7);
	expect(game.act(fox.id, 'rock', { strokes: DEFAULT_RAW.ammo()[0] }).ok).toBe(false);
});

test('armor takes some of a blow where it covers, and a big shield blocks some blows', () => {
	const hits = gear => {
		const world = new World({ arts: [cpuGladiator(), { ...cpuGladiator(), ...gear }], auto: [false, false], arena: true });
		const [a, b] = world.stickmen;

		b.style.dodge = 0;
		for (let k = 0; k < 40; k++) {
			b.hp = GLADIATOR_HP;
			b.takeHit(1, { ...a.stats(), cut: 0 }, 1, b.x, b.y);
		}

		return GLADIATOR_HP - b.hp;
	};
	const warrior = judge('stickmen', DEFAULT_RAW.stickmen()[0]).item;
	const helmet = judge('armor', helmetOn(warrior), { warrior }).item;

	expect(hits({ stickmen: [warrior], armor: [helmet] })).toBeLessThan(hits({ stickmen: [warrior], armor: [] }));

	const shield = judge('shield', [blobS(240, 240, 160, 160, 10)], { warrior }).item;
	const world = new World({ arts: [cpuGladiator(), { ...cpuGladiator(), stickmen: [warrior], shield: [shield] }], auto: [false, false], arena: true });
	const [a, b] = world.stickmen;
	let blocked = 0;

	b.style.dodge = 0;
	for (let k = 0; k < 200; k++) {
		b.body.shield.hp = 999;
		if (b.fends(a)) blocked++;
	}
	expect(blocked).toBeGreaterThan(40);
	expect(blocked).toBeLessThan(160);
});

test('two gladiators fight it out to the death, and the winner goes into the hall to be fought again', () => {
	const roster = new Roster();
	const game = newGame('cpu', 'gladiator', roster);
	const fox = game.addPlayer('🦊');

	drawGladiator(game, fox.id);
	for (let i = 0; i < 60 * 120 && game.state.phase === 'battle'; i++) {
		game.world.step(DT);
		if (game.world.over && game.world.overT > 3) game.tick();
	}
	expect(game.state.phase).toBe('over');

	const { winner } = game.state.result;

	// The winner in the hall; the loser too only if the crowd spared it
	const { spared } = game.state.result;

	expect(roster.load()).toHaveLength(spared ? 2 : 1);
	expect(roster.get(game.state.fame[winner]).wins).toBe(1);
	expect(game.viewFor(fox.id).fame[winner]).toEqual({ wins: 1, losses: 0 });
	expect(Boolean(game.state.fame[1 - winner])).toBe(spared);

	// A new game against the computer sends a gladiator from the hall
	const next = newGame('cpu', 'gladiator', roster);
	const frog = next.addPlayer('🐸');

	drawGladiator(next, frog.id, { armor: false, shield: false });
	expect(roster.get(next.state.fame[1])).toBeDefined();
});

test('the crowd decides a beaten gladiator\'s place in the hall: spared, it keeps it or earns one; thumbs down, it\'s struck out', () => {
	const roster = new Roster();
	const champion = roster.record({ art: cpuGladiator() }, {}).winner;

	// Spared, it keeps its place, its loss counted
	expect(roster.record({ art: cpuGladiator() }, { id: champion, spared: true }).loser).toBe(champion);
	expect(roster.get(champion)).toMatchObject({ wins: 1, losses: 1 });
	// A newcomer spared earns a place
	const favourite = roster.record({ id: champion, art: null }, { art: cpuGladiator(), spared: true }).loser;

	expect(roster.get(favourite)).toMatchObject({ wins: 0, losses: 1 });
	// Thumbs down, and it's gone
	expect(roster.record({ art: cpuGladiator() }, { id: champion, spared: false }).loser).toBeNull();
	expect(roster.get(champion)).toBeUndefined();
});

// A duel fought until one yields: the world, and the crowd's pending verdict
const toYield = () => {
	for (let tries = 0; tries < 10; tries++) {
		const world = new World({ arts: [cpuGladiator(), cpuGladiator()], auto: [false, false], arena: true });

		for (let i = 0; i < 60 * 120 && !world.mercy && !world.over; i++) world.step(DT);
		if (world.mercy) return world;
	}

	return null;
};

test('a beaten gladiator yields and waits on the crowd: thumbs up, he lives', () => {
	const world = toYield();
	const m = world.mercy;

	expect(m.loser.yielded).toBe(true);
	expect(m.loser.dead).toBe(false);
	m.chance = 1;
	// Medics run out and slap him back together first, every limb back on, then the crowd's hush and its thumb
	for (let i = 0; i < 60 * (m.done + 0.3) && !world.over; i++) world.step(DT);
	expect(m.loser.body.owned.every(Boolean)).toBe(true);
	expect(world.over).toBeNull();
	for (let i = 0; i < 60 * (MERCY_WAIT + 1) && !world.over; i++) world.step(DT);
	expect(world.over).toEqual({ winner: m.winner.team, spared: true });
	expect(m.loser.dead).toBe(false);
	expect(world.snapshot().mercy.up).toBe(true);
});

test('thumbs down: the beaten gladiator is drawn and quartered, his arms and legs torn off', () => {
	const world = toYield();
	const m = world.mercy;

	Object.assign(m, { decided: true, up: false, next: 0 });
	for (let i = 0; i < 60 * 3 && !world.over; i++) world.step(DT);
	expect(world.over).toEqual({ winner: m.winner.team, spared: false });
	expect(m.loser.dead).toBe(true);
	expect([2, 4, 6, 8].map(b => m.loser.body.owned[b])).toEqual([false, false, false, false]);
});

test('a gladiator does what he is shouted at for a few seconds: charge in, back off, or guard', () => {
	const game = newGame('cpu', 'gladiator');
	const fox = game.addPlayer('🦊');

	drawGladiator(game, fox.id, { armor: false, shield: false });

	const world = game.world;
	const [mine, theirs] = world.stickmen;

	world.auto = [false, false];
	// Backing off from the middle, he walks away from his foe
	const gap = () => Math.abs(theirs.x - mine.x);

	theirs.x = mine.x + 100;
	expect(game.act(fox.id, 'shout', { stance: 'back' }).ok).toBe(true);
	expect(world.snapshot().bodies.find(b => b.t === 0).cs).toBe('b');

	const before = gap();

	theirs.speed = 0;
	for (let i = 0; i < 60; i++) world.step(DT);
	expect(gap()).toBeGreaterThan(before);
	// It wears off
	for (let i = 0; i < 60 * STANCE_FOR; i++) world.step(DT);
	expect(mine.stance()).toBeNull();
	expect(game.act(fox.id, 'shout', { stance: 'dance' }).ok).toBe(false);
});

test('the hall lists its gladiators best first, and one picked from it is the one fought', () => {
	const roster = new Roster();
	const first = roster.record({ art: cpuGladiator() }, {}).winner;
	const second = roster.record({ art: cpuGladiator() }, {}).winner;

	roster.record({ id: second, art: null }, {});
	expect(roster.standings().map(entry => entry.id)).toEqual([second, first]);
	expect(roster.standings()[0].warrior).toEqual(roster.get(second).art.stickmen[0].raw);

	const game = new Game({ mode: 'cpu', style: 'gladiator', rival: first, roster, server: server(), logger: quiet });

	game.dispose();

	const fox = game.addPlayer('🦊');

	drawGladiator(game, fox.id, { armor: false, shield: false });
	expect(game.state.fame[1]).toBe(first);
});

test('size has a price: a heavy rock flies shorter and loads slower; a spindly gladiator is frailer than a stubby one', () => {
	const small = judge('ammo', [blobS(240, 240, 40, 40, 10)]).item, big = judge('ammo', [starS(240, 240, 200, 120, 10)]).item;

	expect(rockThrow(big).speed).toBeLessThan(rockThrow(small).speed);
	expect(rockThrow(big).reload).toBeGreaterThan(rockThrow(small).reload);

	const man = (legs, arms) => {
		const warrior = judge('stickmen', [ringS(240, 70, 26, 26), lineS(240, 96, 240, 220), lineS(240, 130, 240 - arms, 160), lineS(240, 130, 240 + arms, 160), lineS(240, 220, 200, 220 + legs), lineS(240, 220, 280, 220 + legs)]).item;

		// The same weapon and no gear for both: only their bodies differ
		const kit = { stickmen: [warrior], swords: [judge('swords', DEFAULT_RAW.swords()[0]).item], armor: [], shield: [] };

		return new World({ arts: [kit, cpuGladiator()], auto: [false, false], arena: true }).stickmen[0];
	};
	const spindly = man(230, 120), stubby = man(90, 45);

	expect(spindly.speed).toBeGreaterThan(stubby.speed);
	expect(spindly.maxHp).toBeLessThan(stubby.maxHp);
	expect(spindly.limbFrailty).toBeGreaterThan(stubby.limbFrailty);
});

test('only different stick men and weapons earn more men: a copy fights, but earns nothing', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');
	const man = DEFAULT_RAW.stickmen()[0];

	expect(game.act(fox.id, 'keep', { strokes: man }).result.fresh).toBe(true);
	// The same stick man again, redrawn a little differently: a copy
	expect(game.act(fox.id, 'keep', { strokes: man.map(st => st.map(p => ({ x: p.x + 6, y: p.y + 3 }))) }).result.fresh).toBe(false);
	expect(game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.stickmen()[1] }).result.fresh).toBe(true);
	for (const _ of STEPS) game.act(fox.id, 'next');
	// Three kept, two different: one extra man
	expect(game.state.art[0].stickmen).toHaveLength(3);
	expect(game.world.stickmen.filter(s => s.team === 0)).toHaveLength(BASE_ARMY + 1);
});

// ---------------------------------------------------------------- the armory

test('every new weapon a player draws goes into the armory, a copy of one there doesn\'t, and it can be borrowed instead of drawn', () => {
	const armory = new Shelf();
	const game = newGame('cpu', 'war', new Roster(), armory);
	const fox = game.addPlayer('🦊');

	for (let k = 0; k < 4; k++) game.act(fox.id, 'next');
	game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.swords()[0] });
	// The same sword again: not shelved twice
	game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.swords()[0].map(st => st.map(p => ({ x: p.x + 4, y: p.y }))) });
	expect(armory.load()).toHaveLength(1);
	expect(game.state.art[0].swords[0].armory).toBe(armory.load()[0].id);

	// Another player borrows it, and it fights for them, with the armory's mark on it
	const other = newGame('cpu', 'gladiator', new Roster(), armory);
	const frog = other.addPlayer('🐸');

	other.act(frog.id, 'keep', { strokes: DEFAULT_RAW.stickmen()[0] });
	expect(other.act(frog.id, 'borrow', { id: 'nope' }).ok).toBe(false);
	expect(other.act(frog.id, 'borrow', { id: armory.load()[0].id }).ok).toBe(true);
	expect(other.state.art[0].swords[0].armory).toBe(armory.load()[0].id);
	// A gladiator's page moves on once its one weapon's had
	expect(other.state.drawing[0].step).toBe(2);
});

test('the computer arms itself partly from the armory, and a battle counts each weapon\'s uses and kills', () => {
	const armory = new Shelf();
	const id = armory.offer(judge('swords', DEFAULT_RAW.swords()[1]).item);
	const game = newGame('cpu', 'war', new Roster(), armory);
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);
	expect(game.state.art[1].swords.some(item => item.armory === id)).toBe(true);
	// The battle's kills by the computer's borrowed axe, as the world counted them
	const at = game.state.art[1].swords.findIndex(item => item.armory === id);

	game.world.stats.weaponKills = { [`1:${at}`]: 3 };
	game.armoryAfter(game.world);
	expect(armory.get(id)).toMatchObject({ uses: 1, kills: 3 });
});

test('players vote on weapons, one thumb each, and the armory sorts them loved, hated, controversial and deadliest', () => {
	const armory = new Shelf();
	const [a, b, c] = [DEFAULT_RAW.swords()[0], DEFAULT_RAW.swords()[1], [lineS(240, 450, 240, 200), starS(240, 140, 70, 45, 8)]].map(raw => armory.offer(judge('swords', raw).item));

	for (const voter of ['v1', 'v2', 'v3']) armory.vote(a, voter, 1);
	for (const voter of ['v1', 'v2', 'v3']) armory.vote(b, voter, -1);
	armory.vote(c, 'v1', 1);
	armory.vote(c, 'v2', -1);
	armory.vote(c, 'v3', 1);
	armory.vote(c, 'v4', -1);
	// Changing a vote, and a vote that isn't one
	armory.vote(a, 'v1', -1);
	armory.vote(a, 'v1', 1);
	expect(armory.vote(a, 'v1', 7)).toBeNull();
	expect(armory.get(a)).toMatchObject({ up: 3, down: 0 });
	armory.get(b).kills = 5;
	expect(armory.listing('loved')[0].id).toBe(a);
	expect(armory.listing('hated')[0].id).toBe(b);
	expect(armory.listing('controversial')[0].id).toBe(c);
	expect(armory.listing('deadliest')[0].id).toBe(b);
	expect(armory.listing('loved', 'v2').find(entry => entry.id === c).mine).toBe(-1);
});

test('every new stick man players draw joins the crowd in the arena\'s stands (not a copy by pose), voted on like the armory', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.stickmen()[0] });
	game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.stickmen()[0].map(st => st.map(p => ({ x: p.x + 5, y: p.y }))) });
	game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.stickmen()[1] });
	expect(game.crowd.load()).toHaveLength(2);

	const [first] = game.crowd.listing('loved');

	// Its skeleton goes with it, for the stands to draw it cheering
	expect(first.rig.joints).toHaveLength(11);
	game.crowd.vote(first.id, 'v1', -1);
	expect(game.crowd.listing('hated', 'v1')[0]).toMatchObject({ id: first.id, down: 1, mine: -1 });
});

test('the arena\'s crowd erupts when a limb flies off, drowning out the gasp at the blow', () => {
	const world = new World({ arts: [cpuGladiator(), cpuGladiator()], auto: [false, false], arena: true });
	const [man] = world.stickmen;

	world.takeEvents();
	world.crowd('ooh');
	man.sever(6, 1);
	expect(world.takeEvents().filter(event => event.e === 'crowd')).toEqual([{ e: 'crowd', n: 'erupt' }]);
	// And a quieter reaction never drowns out a louder one
	world.crowd('erupt');
	world.crowd('boo');
	expect(world.takeEvents().filter(event => event.e === 'crowd')).toEqual([{ e: 'crowd', n: 'erupt' }]);
});

test('the medics fetch a limb he lost, carry it back and slap it on before the verdict', () => {
	const world = new World({ arts: [cpuGladiator(), cpuGladiator()], auto: [false, false], arena: true });
	const [loser] = world.stickmen;

	// His leg off: down he goes, and yields
	loser.sever(6, 2);
	for (let i = 0; i < 60 && !world.mercy; i++) world.step(DT);

	const m = world.mercy;
	const piece = world.bodies.find(body => body.from === loser.body);

	expect(m.plans[0].map(leg => leg.what)).toEqual(expect.arrayContaining(['p', 'a']));
	expect(piece.owned[6]).toBe(true);
	// Brought back and slapped on: his again, and gone from the sand
	for (let i = 0; i < 60 * (m.done + 0.3) && !world.over; i++) world.step(DT);
	expect(loser.body.owned.every(Boolean)).toBe(true);
	expect(world.bodies).not.toContain(piece);
});

// ---------------------------------------------------------------- what the review found

// A duel fought to its end, the crowd's verdict forced
const duelTo = (game, spared) => {
	for (let i = 0; i < 60 * 150 && game.state.phase === 'battle'; i++) {
		// The verdict, as the crowd would give it, made the one wanted (its whim and all)
		const m = game.world.mercy;

		if (m && !m.decided && game.world.time >= m.judgeAt - DT * 2) Object.assign(m, { decided: true, up: spared, next: game.world.time + 1.8 });
		game.world.step(DT);
		if (game.world.over && game.world.overT > 3) game.tick();
	}
	expect(game.state.phase).toBe('over');
};

test('a game over when the server restarts stays over, its result counted once, and a finished battle holds still', () => {
	const roster = new Roster();
	const game = newGame('cpu', 'gladiator', roster);
	const fox = game.addPlayer('🦊');

	drawGladiator(game, fox.id);
	duelTo(game, true);

	const wins = roster.load().map(entry => entry.wins).sort();
	const back = new Game({ saveState: JSON.parse(JSON.stringify(game.toSaveState())), roster, server: server(), logger: quiet });

	back.dispose();
	for (let i = 0; i < 20; i++) back.tick();
	expect(back.state.phase).toBe('over');
	expect(back.state.result).toEqual(game.state.result);
	expect(roster.load().map(entry => entry.wins).sort()).toEqual(wins);
	// Still: nothing more is stepped or sent
	const time = back.world.time;

	back.tick();
	expect(back.world.time).toBe(time);
});

test('"again" after a thumbs down never brings the quartered gladiator back', () => {
	const game = newGame('cpu', 'gladiator');
	const fox = game.addPlayer('🦊');

	drawGladiator(game, fox.id);
	duelTo(game, false);

	const { winner } = game.state.result;
	const theirs = game.state.art[1].stickmen[0].raw;

	game.act(fox.id, 'again');
	if (winner === 0) {
		// The computer's gladiator fell: it sends another
		expect(game.state.phase).toBe('battle');
		expect(game.state.art[1].stickmen[0].raw).not.toEqual(theirs);
	} else {
		// Ours fell: draw a new one
		expect(game.state.phase).toBe('draw');
		expect(game.state.art[0].stickmen).toHaveLength(0);
	}
});

test('walking out of a duel loses it, and a new game\'s options can\'t stand in for the shared stores', () => {
	const roster = new Roster();
	const game = newGame('duo', 'gladiator', roster);
	const fox = game.addPlayer('🦊'), frog = game.addPlayer('🐸');

	drawGladiator(game, fox.id);
	drawGladiator(game, frog.id);
	expect(game.state.phase).toBe('battle');
	game.removePlayer(frog.id);
	expect(roster.load()).toHaveLength(1);
	expect(roster.get(game.state.fame[0]).wins).toBe(1);

	const sneaky = new Game({ mode: 'cpu', armory: {}, roster: { pick: 1 }, crowd: [], server: server(), logger: quiet });

	sneaky.dispose();
	expect(sneaky.armory).toBeInstanceOf(Shelf);
	expect(sneaky.roster).toBeInstanceOf(Roster);
	expect(sneaky.crowd).toBeInstanceOf(Shelf);
});

test('a shelf keeps so many thumbs a drawing, lists only as many as asked, and is written once a burst of changes is over', async () => {
	const { MOST_VOTERS } = await import('./shelf.js');
	const { SAVE_AFTER } = await import('./store.js');
	const shelf = new Shelf();
	const id = shelf.offer(judge('swords', DEFAULT_RAW.swords()[0]).item);

	for (let k = 0; k < MOST_VOTERS + 50; k++) shelf.vote(id, `v${k}`, 1);
	expect(shelf.get(id).up).toBe(MOST_VOTERS);
	// One already counted can still change their mind
	shelf.vote(id, 'v0', -1);
	expect(shelf.get(id)).toMatchObject({ up: MOST_VOTERS - 1, down: 1 });
	shelf.offer(judge('swords', DEFAULT_RAW.swords()[1]).item);
	expect(shelf.listing('loved', null, 1)).toHaveLength(1);

	// A store with a file: many changes, one write, soon after
	const { mkdtempSync, existsSync, readFileSync } = await import('node:fs');
	const file = `${mkdtempSync('/tmp/stick-wars-store-')}/hall.json`;
	const roster = new Roster(file);

	roster.record({ art: cpuGladiator() }, {});
	roster.record({ art: cpuGladiator() }, {});
	expect(existsSync(file)).toBe(false);
	await Bun.sleep(SAVE_AFTER + 100);
	expect(JSON.parse(readFileSync(file, 'utf8'))).toHaveLength(2);
});

test('a new shelf is stocked once from drawings made before it, and the server starts up for real', async () => {
	const { mkdtempSync, readFileSync } = await import('node:fs');
	const dir = mkdtempSync('/tmp/stick-wars-boot-');
	const shelf = new Shelf(`${dir}/weapons.json`);

	shelf.stockOnce([judge('swords', DEFAULT_RAW.swords()[0]).item, judge('swords', DEFAULT_RAW.swords()[1]).item]);
	expect(JSON.parse(readFileSync(`${dir}/weapons.json`, 'utf8'))).toHaveLength(2);
	// Once only: a second stocking leaves it be
	new Shelf(`${dir}/weapons.json`).stockOnce([judge('swords', [lineS(240, 450, 240, 200), starS(240, 140, 70, 45, 8)]).item]);
	expect(JSON.parse(readFileSync(`${dir}/weapons.json`, 'utf8'))).toHaveLength(2);

	// The server, in production, run from a scratch folder so its stores are made there and not in data/
	const port = 47000 + Math.floor(Math.random() * 900);
	const server = Bun.spawn(['bun', `${import.meta.dir}/server.js`], { cwd: dir, env: { ...process.env, NODE_ENV: 'production', PORT: String(port) }, stdout: 'pipe', stderr: 'pipe' });
	let answer = null;

	for (let tries = 0; tries < 40 && !answer; tries++) {
		await Bun.sleep(150);
		answer = await fetch(`http://127.0.0.1:${port}/hall`).catch(() => null);
	}
	server.kill();
	expect(answer?.status).toBe(200);
	expect(await answer.json()).toEqual([]);
}, 20_000);

test('a gladiator earns a name after a few wins, and a weapon after a few kills, each from what it is', async () => {
	const { NAMED_AT_WINS, NAMED_AT_KILLS, gladiatorName, weaponName } = await import('./names.js');
	const roster = new Roster();
	const warrior = judge('stickmen', DEFAULT_RAW.stickmen()[0]).item;
	const tin = { stickmen: [warrior], swords: [judge('swords', DEFAULT_RAW.swords()[0]).item], armor: [{ weight: 2, cover: {} }], shield: [] };
	const champion = roster.record({ art: tin }, {}).winner;

	expect(roster.standings()[0].name).toBeUndefined();
	for (let k = 1; k < NAMED_AT_WINS; k++) roster.record({ id: champion, art: tin }, {});
	// Heavily armored: a tin can, whatever it's first called; and always the same name for the same drawing
	expect(roster.standings()[0].name).toMatch(/the Tin Can|Iron-Belly/);
	expect(gladiatorName(tin)).toBe(roster.standings()[0].name);
	expect(gladiatorName({ ...tin, armor: [] })).not.toMatch(/Tin Can|Iron-Belly/);

	const armory = new Shelf(null, { named: entry => (entry.kills >= NAMED_AT_KILLS ? weaponName(entry.item) : null) });
	const id = armory.offer(judge('swords', DEFAULT_RAW.swords()[1]).item);

	armory.fought([id], { [id]: NAMED_AT_KILLS - 1 });
	expect(armory.listing('loved')[0].name).toBeUndefined();
	armory.fought([id], { [id]: 1 });
	expect(armory.listing('loved')[0].name).toMatch(/^the /);
});

// ---------------------------------------------------------------- tournaments

// A tournament's duels fought out, each verdict forced (spared), until its champion is crowned or `duels` are done
// A gladiator's pages got through quickly: its warrior drawn (never skipped), the rest left to the defaults
const drawnQuickly = (game, id) => {
	game.act(id, 'keep', { strokes: DEFAULT_RAW.stickmen()[0] });
	for (let k = 0; k < 3; k++) game.act(id, 'next');
};

const fightOut = (game, duels = 99) => {
	for (let k = 0; k < duels && game.state.bracket.champion === null; k++) {
		const pair = [...game.state.seats];

		duelTo(game, true);
		// Its end card stands a while, then the next duel
		for (let i = 0; i < 400 && game.state.bracket.champion === null && game.state.seats.join() === pair.join(); i++) {
			game.world.step(DT);
			game.tick();
		}
	}
};

test('a tournament: each player draws a gladiator, the first starts the bracket, duels one by one, one champion', () => {
	const game = newGame('tournament', 'gladiator');
	const [a, b, c] = ['🦊', '🐸', '🦉'].map(name => game.addPlayer(name));

	expect(game.state.entrants.map(e => e.id)).toEqual([a.id, b.id, c.id]);
	expect(game.state.host).toBe(a.id);
	// Each draws on their own pages, on their own clock
	expect(game.act(b.id, 'keep', { strokes: DEFAULT_RAW.stickmen()[1] }).ok).toBe(true);
	expect(game.state.entrants[1].drawing.step).toBe(1);
	expect(game.state.entrants[0].drawing.step).toBe(0);
	expect(game.viewFor(b.id).you.drawing.step).toBe(1);
	// Not started while anyone's still drawing, and only by the first player
	for (const player of [a, b]) drawnQuickly(game, player.id);
	expect(game.act(a.id, 'start').error).toBe('Someone is still drawing');
	drawnQuickly(game, c.id);
	expect(game.act(b.id, 'start').error).toBe('The first player starts it');
	expect(game.act(a.id, 'start').ok).toBe(true);
	expect(game.state.phase).toBe('battle');
	expect(game.world.arena).toBe(true);
	// Three: one pair fights, one has a bye
	expect(game.state.bracket.rounds[0].map(pair => pair.length).sort()).toEqual([1, 2]);
	// Someone coming late only watches
	const late = game.addPlayer('🐢');

	expect(game.state.entrants).toHaveLength(3);
	expect(game.act(late.id, 'shout', { stance: 'charge' }).ok).toBe(false);
	fightOut(game);
	expect(game.state.bracket.champion).not.toBeNull();
	expect(game.state.phase).toBe('over');
	expect(game.state.result.champion).toBe(game.state.entrants[game.state.bracket.champion].id);
	// A new bracket with the same gladiators
	expect(game.act(b.id, 'again').ok).toBe(true);
	expect(game.state.phase).toBe('battle');
});

test('a tournament fighter walking out loses the duel, and the bracket goes on without them', () => {
	const game = newGame('tournament', 'gladiator');
	const players = ['🦊', '🐸'].map(name => game.addPlayer(name));

	for (const player of players) drawnQuickly(game, player.id);
	game.act(players[0].id, 'start');
	game.removePlayer(game.state.seats[0]);
	expect(game.state.phase).toBe('over');
	expect(game.state.result.winner).toBe(1);
	for (let i = 0; i < 60 * 10 && game.state.bracket.champion === null; i++) {
		game.world.step(DT);
		game.tick();
	}
	expect(game.state.entrants[game.state.bracket.champion].id).toBe(game.state.seats[1]);
});

test('the computer\'s war weapons can go in the armory once each, for gladiators to borrow', async () => {
	const { cpuWeapons } = await import('./art.js');
	const armory = new Shelf(null, { alike: sameWeapon });

	for (let boot = 0; boot < 3; boot++) for (const weapon of cpuWeapons()) armory.offer(weapon);
	expect(cpuWeapons()).toHaveLength(5);
	expect(armory.load()).toHaveLength(5);
	// Borrowed on a gladiator's weapon page like any
	const game = newGame('cpu', 'gladiator', new Roster(), armory);
	const fox = game.addPlayer('🦊');

	game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.stickmen()[0] });
	expect(game.act(fox.id, 'borrow', { id: armory.load()[0].id }).ok).toBe(true);
});

test('every kill in a war is a weapon\'s in the armory: drawn copies, the computer\'s own and the defaults all count', async () => {
	const { stockWeapons } = await import('./art.js');
	const armory = new Shelf(null, { alike: sameWeapon });

	for (const weapon of stockWeapons()) armory.offer(weapon);

	const stocked = armory.load().length;
	const game = newGame('cpu', 'war', new Roster(), armory);
	const fox = game.addPlayer('🦊');

	// The player draws the default sword: a copy, so it's the armory's sword, not a new entry
	drawEverything(game, fox.id);
	expect(game.state.art[0].swords[0].armory).toBe(armory.match(game.state.art[0].swords[0]));
	expect(armory.load()).toHaveLength(stocked);

	// Fought until some die by the blade (a war can be won by rocks alone)
	let killed = 0;

	for (let battle = 0; battle < 4 && !killed; battle++) {
		const world = battle ? (game.startBattle(), game.world) : game.world;

		world.auto = [true, true];
		for (let steps = 0; !world.over && steps < 60 * 240; steps++) world.step(DT);
		game.armoryAfter(world);
		killed += Object.values(world.stats.weaponKills).reduce((sum, n) => sum + n, 0);
	}

	const counted = armory.load().reduce((sum, entry) => sum + entry.kills, 0);

	expect(killed).toBeGreaterThan(0);
	// Nearly all: now and then the computer's shaky redraw of a weapon is too far from its own to be known as it
	expect(counted).toBeGreaterThanOrEqual(killed * 0.75);
});

test('in the arena a duel won is one kill for the winner\'s weapon, spared or quartered', async () => {
	const { stockWeapons } = await import('./art.js');

	for (const spared of [true, false]) {
		const armory = new Shelf(null, { alike: sameWeapon });

		for (const weapon of stockWeapons()) armory.offer(weapon);

		const game = newGame('cpu', 'gladiator', new Roster(), armory);
		const fox = game.addPlayer('🦊');

		drawGladiator(game, fox.id);
		duelTo(game, spared);

		const winner = game.state.result.winner;
		const weapon = game.state.art[game.world.artOf[winner]].swords[0];

		expect(armory.load().reduce((sum, entry) => sum + entry.kills, 0)).toBe(1);
		expect(armory.get(weapon.armory ?? armory.match(weapon)).kills).toBe(1);
	}
});

test('two servers sharing a store\'s file each see what the other wrote, and neither writes over it', async () => {
	const { mkdtempSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');
	const file = join(mkdtempSync(join(tmpdir(), 'stick-wars-')), 'weapons.json');
	const [house, preview] = [new Shelf(file, { alike: sameWeapon }), new Shelf(file, { alike: sameWeapon })];

	house.offer(judge('swords', DEFAULT_RAW.swords()[0]).item);
	house.flush();
	// The file's time moves on in whole steps on some disks: the preview's write is a later one
	await Bun.sleep(20);
	expect(preview.load()).toHaveLength(1);
	preview.vote(preview.load()[0].id, 'v1', 1);
	preview.flush();
	await Bun.sleep(20);
	expect(house.load()[0].up).toBe(1);
	house.fought([house.load()[0].id], { [house.load()[0].id]: 2 });
	house.flush();
	await Bun.sleep(20);
	expect(preview.load()[0]).toMatchObject({ up: 1, kills: 2 });
});

test('a gladiator from the hall can be enlisted: its warrior and gear, a new weapon, its record carried on', () => {
	const roster = new Roster();
	const champion = roster.record({ art: cpuGladiator() }, { art: null, spared: false }).winner;
	const game = newGame('duo', 'gladiator', roster);
	const fox = game.addPlayer('🦊'), owl = game.addPlayer('🦉');

	// Only on the warrior's page
	expect(game.act(fox.id, 'keep', { strokes: DEFAULT_RAW.stickmen()[0] }).ok).toBe(true);
	expect(game.act(fox.id, 'enlist', { id: champion }).ok).toBe(false);

	expect(game.act(owl.id, 'enlist', { id: 'nobody' }).ok).toBe(false);
	expect(game.act(owl.id, 'enlist', { id: champion }).ok).toBe(true);
	expect(game.state.fame[1]).toBe(champion);
	expect(game.state.art[1].stickmen[0].raw).toEqual(roster.get(champion).art.stickmen[0].raw);
	// On to its weapon, and once that's chosen, done: its gear came with it
	expect(game.state.drawing[1].step).toBe(1);
	expect(game.act(owl.id, 'keep', { strokes: DEFAULT_RAW.swords()[1] }).ok).toBe(true);
	expect(game.state.drawing[1].done).toBe(true);
	// The same one can't fight itself
	game.act(fox.id, 'next');
	game.act(fox.id, 'next');
	game.act(fox.id, 'next');
	expect(game.state.phase).toBe('battle');

	const other = newGame('duo', 'gladiator', roster);
	const [a, b] = [other.addPlayer('🐸'), other.addPlayer('🐙')];

	expect(other.act(a.id, 'enlist', { id: champion }).ok).toBe(true);
	expect(other.act(b.id, 'enlist', { id: champion }).ok).toBe(false);

	// Won with its new weapon: its record up, kept with that weapon
	game.honour(1, true);
	expect(roster.get(champion)).toMatchObject({ wins: 2 });
	expect(roster.get(champion).art.swords[0].raw).toEqual(game.state.art[1].swords[0].raw);
});

test('a stick man with beefy arms (outlined, muscled) is a stick man, not a scribble', () => {
	const oval = (cx, cy, rx, ry, rot = 0) =>
		Array.from({ length: 29 }, (_, i) => {
			const t = (i / 28) * Math.PI * 2, x = Math.cos(t) * rx, y = Math.sin(t) * ry;

			return { x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) };
		});
	const arms = [oval(200, 200, 48, 24, 0.5), oval(158, 245, 40, 20, 1.2), oval(280, 200, 48, 24, -0.5), oval(322, 245, 40, 20, -1.2)];
	const short = [oval(240, 150, 28, 28), lineS(240, 178, 240, 260), lineS(240, 260, 205, 330), lineS(240, 260, 275, 330), ...arms];

	expect(judge('stickmen', short).ok).toBe(true);
	// A page of zigzags still isn't one
	expect(judge('stickmen', [oval(240, 90, 30, 30), Array.from({ length: 120 }, (_, i) => ({ x: 140 + (i % 2) * 200, y: 60 + i * 3 }))]).ok).toBe(false);
});

test('a small shield (a buckler) is a shield; one too small is told the smallest, and a tall tower shield passes', () => {
	expect(judge('shield', [blobS(240, 240, 20, 20, 10)]).ok).toBe(true);
	expect(judge('shield', [blobS(240, 240, 12, 12, 10)]).msg).toMatch(/red ring/);
	// A tall oval, four times as tall as it's wide
	const tower = [Array.from({ length: 41 }, (_, i) => ({ x: 240 + Math.cos((i / 40) * Math.PI * 2) * 25, y: 240 + Math.sin((i / 40) * Math.PI * 2) * 100 }))];

	expect(judge('shield', tower).ok).toBe(true);
	expect(judge('ammo', tower).ok).toBe(false);
});

test('a catapult rolls forward when its side sends it, pushed by its crew, held between home and halfway, and reaches further', async () => {
	const { CAT_X, catRange, reachOf } = await import('./field.js');
	const game = newGame('cpu', 'war');
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);

	const world = game.world, cat = world.cats.find(c => c.team === 0);
	const [home, far] = catRange(0);

	// Uncrewed it stays put; crewed it rolls, and no further than halfway
	expect(game.act(fox.id, 'roll', { x: 99999 }).ok).toBe(true);
	expect(cat.goal).toBe(far);
	for (let i = 0; i < 60 * 2; i++) world.step(DT);
	expect(cat.x).toBe(home);
	world.command(0, world.stickmen.filter(s => s.team === 0).slice(0, 2).map(s => s.id), 'crew', 0);
	for (let i = 0; i < 60 * 12; i++) world.step(DT);
	expect(cat.x).toBeGreaterThan(home + 40);
	expect(cat.x).toBeLessThanOrEqual(far);
	// Its reach goes forward with it
	expect(reachOf(0, cat.x) - reachOf(0)).toBeCloseTo(cat.x - CAT_X[0][0]);
	// And back home if told; never behind it
	game.act(fox.id, 'roll', { x: -500 });
	expect(cat.goal).toBe(home);
	expect(game.viewFor(fox.id).battle.cats.find(c => c.t === 0).g).toBe(home);
});

test('wheels are drawn last, in the time saved on the pages before: drawn, the catapult rolls; too slow, it sits on stones', () => {
	// Quick: every page finished early, time saved for the wheels
	const quick = newGame('cpu', 'war');
	const fox = quick.addPlayer('🦊');

	for (const { kind } of STEPS.filter(step => !step.banked)) {
		quick.act(fox.id, 'keep', { strokes: DEFAULT_RAW[kind]()[0] });
		quick.act(fox.id, 'next');
	}
	expect(STEPS[quick.state.drawing[0].step].kind).toBe('wheels');
	expect(quick.state.drawing[0].left).toBe(30);
	expect(quick.act(fox.id, 'keep', { strokes: DEFAULT_RAW.wheels()[0] }).ok).toBe(true);
	quick.act(fox.id, 'next');
	expect(quick.state.phase).toBe('battle');
	expect(quick.world.cats.find(c => c.team === 0).rolls).toBe(true);

	// Slow: every page's clock run out, nothing saved, no wheels page, a catapult that stays put
	const slow = newGame('cpu', 'war');
	const owl = slow.addPlayer('🦉');

	for (const { kind } of STEPS.filter(step => !step.banked)) {
		slow.act(owl.id, 'keep', { strokes: DEFAULT_RAW[kind]()[0] });
		slow.state.drawing[0].left = 0.01;
		slow.tick();
	}
	expect(slow.state.phase).toBe('battle');
	expect(slow.state.art[0].wheels).toHaveLength(0);
	expect(slow.world.cats.find(c => c.team === 0).rolls).toBe(false);
	expect(slow.act(owl.id, 'roll', { x: 600 }).error).toBe('No wheels: it stays put');
});

test('a war saved before wheels loads with none', () => {
	const save = { version: 5, state: { style: 'war', art: [{ stickmen: [] }, { stickmen: [] }] } };

	for (const v of [6]) Game.migrations[v](save);
	expect(save.state.art[0].wheels).toEqual([]);
});

test('a champion given the thumbs down leaves the hall for the fallen: remembered, never fought or enlisted again', () => {
	const roster = new Roster();
	const champion = roster.record({ art: cpuGladiator() }, { art: null, spared: false }).winner;

	roster.record({ art: cpuGladiator() }, { id: champion, art: null, spared: false });
	expect(roster.standings().some(entry => entry.id === champion)).toBe(false);
	expect(roster.fallen().map(entry => entry.id)).toEqual([champion]);
	expect(roster.fallen()[0]).toMatchObject({ wins: 1, losses: 0 });
	expect(roster.get(champion)).toBeUndefined();
	for (let i = 0; i < 20; i++) expect(roster.pick()?.id).not.toBe(champion);

	const game = newGame('duo', 'gladiator', roster);
	const fox = game.addPlayer('🦊');

	expect(game.act(fox.id, 'enlist', { id: champion }).ok).toBe(false);
});

test('a gladiator drawn beefy hits harder and swings slower; beefy legs stand firmer and walk slower', async () => {
	const { beefOf } = await import('./art.js');
	const oval = (cx, cy, rx, ry, rot = 0) =>
		Array.from({ length: 29 }, (_, i) => {
			const t = (i / 28) * Math.PI * 2, x = Math.cos(t) * rx, y = Math.sin(t) * ry;

			return { x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) };
		});
	const head = oval(240, 90, 32, 32), body = lineS(240, 122, 240, 280);
	const beefy = judge('stickmen', [head, body, oval(205, 165, 40, 18, 0.6), oval(170, 215, 34, 15, 1.1), oval(275, 165, 40, 18, -0.6), oval(310, 215, 34, 15, -1.1), oval(225, 315, 16, 40, 0.25), oval(255, 315, 16, 40, -0.25), oval(207, 385, 13, 36, 0.25), oval(273, 385, 13, 36, -0.25)]).item;
	const plain = judge('stickmen', DEFAULT_RAW.stickmen()[0]).item;

	expect(beefOf(plain.rig)).toEqual({ arms: 0, legs: 0 });
	expect(beefOf(beefy.rig).arms).toBeGreaterThan(0.5);
	expect(beefOf(beefy.rig).legs).toBeGreaterThan(0.5);

	const fighter = man => {
		const art = cpuGladiator();

		art.stickmen = [man];
		art.armor = [];
		art.shield = [];

		const world = new World({ arts: [art, cpuGladiator()], artOf: [0, 1], auto: [false, false], arena: true });

		return world.stickmen.find(s => s.team === 0);
	};
	const [big, thin] = [fighter(beefy), fighter(plain)];

	expect(big.maxHp).toBeGreaterThan(thin.maxHp * 0.95);
	expect(big.style.steady).toBeGreaterThan(thin.style.steady);
	expect(big.speed / thin.speed).toBeLessThan(1.3 * 0.95);
	expect(big.beef.arms).toBeGreaterThan(0.5);
});
