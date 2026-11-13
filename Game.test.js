import { expect, test } from 'bun:test';

import { DEFAULT_RAW, blobS, cpuArmy, cpuGladiator, judge, lineS, ringS } from './art.js';
import { AMMO, DT, FADE, GLADIATOR_HP, GROUND, LINGER, MERCY_WAIT, PLANS, STANCE_FOR, World } from './battle.js';
import Game from './Game.js';
import Roster from './roster.js';
import { BASE_ARMY, CPU_SIZE, GLADIATOR_STEPS, STEPS, emptyArt } from './rules.js';

const quiet = { info() {}, debug() {}, warning() {}, error() {} };
const server = () => ({ games: {}, publish() {}, socketBroadcast() {} });
const newGame = (mode, style, roster = new Roster()) => {
	const game = new Game({ mode, style, roster, server: server(), logger: quiet });

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
	expect(game.act(owl.id, 'send').error).toBe('You are watching this one');
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

	for (const { kind } of STEPS) {
		const many = { stickmen: 3, swords: 3, stones: 5 }[kind] ?? 1;

		for (let k = 0; k < many; k++) expect(game.act(fox.id, 'keep', { strokes: DEFAULT_RAW[kind]()[k % DEFAULT_RAW[kind]().length] }).ok).toBe(true);
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

	expect(save.version).toBe(4);
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
	expect(mine.hp).toBe(GLADIATOR_HP);
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
