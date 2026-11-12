import { expect, test } from 'bun:test';

import { DEFAULT_RAW, blobS, cpuArmy, judge, lineS } from './art.js';
import { AMMO, DT, FADE, GROUND, LINGER, World } from './battle.js';
import Game from './Game.js';
import { BASE_ARMY, CPU_SIZE, STEPS, emptyArt } from './rules.js';

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

test('the catapult starts empty: each rock is drawn in battle, up to the most a battle allows, and the computer draws its own', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);

	const cat = game.world.cats[0];
	const rock = DEFAULT_RAW.ammo()[0];

	expect(cat.ammo).toBe(0);
	expect(game.act(fox.id, 'rock', { strokes: [lineS(240, 50, 240, 400)] }).ok).toBe(false);
	expect(game.act(fox.id, 'rock', { strokes: rock }).result).toEqual({ left: AMMO - 1 });
	expect(cat.ammo).toBe(1);
	expect(cat.snapshot().l).toEqual([0, 0]);
	for (let k = 1; k < AMMO; k++) game.act(fox.id, 'rock', { strokes: rock });
	expect(game.act(fox.id, 'rock', { strokes: rock }).error).toBe('No more rocks this battle');
	expect(cat.ammo).toBe(AMMO);
	for (let i = 0; i < 60 * 10; i++) game.world.step(DT);
	expect(game.world.drawnRocks[1]).toBeGreaterThan(0);
	// A rematch starts empty again
	game.state.phase = 'over';
	game.act(fox.id, 'again');
	expect(game.world.cats[0].ammo).toBe(0);
	expect(game.state.art[0].ammo).toHaveLength(0);
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

	// Aimed, with its crew in place, it fires by itself as often as it can; told to hold, it stops
	for (let i = 0; i < 60 * 8; i++) world.step(DT);
	expect(world.cats[0].crew()).toBe(3);
	expect(game.act(fox.id, 'aim', { vx: 500, vy: -600 }).ok).toBe(true);
	for (let i = 0; i < 60 * 8; i++) world.step(DT);
	expect(5 - world.cats[0].ammo).toBeGreaterThan(1);
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

test('the art is saved and the battle is not; a game saved mid-battle comes back fighting with the same art', () => {
	const game = newGame('cpu');
	const fox = game.addPlayer('🦊');

	drawEverything(game, fox.id);

	const save = JSON.parse(JSON.stringify(game.toSaveState()));

	expect(save.version).toBe(2);
	expect(save.state.art[0].swords).toHaveLength(1);

	const back = new Game({ saveState: save, server: server(), logger: quiet });

	back.dispose();
	expect(back.state.phase).toBe('battle');
	expect(back.world).not.toBeNull();
	expect(back.state.art[0].swords).toEqual(game.state.art[0].swords);
});

test('a game saved when ammo was still a drawing step loads, each side on the step it was drawing', () => {
	const game = newGame('duo');
	const save = JSON.parse(JSON.stringify(game.toSaveState()));

	save.version = 1;
	save.state.drawing = [
		{ step: 3, left: 4, done: false },
		{ step: 4, left: 30, done: false },
	];

	const back = new Game({ saveState: Game.migrate(save), server: server(), logger: quiet });

	back.dispose();
	expect(back.state.drawing.map(({ step }) => STEPS[step].kind)).toEqual(['swords', 'swords']);
	expect(back.state.drawing[0].left).toBe(STEPS[3].seconds);
	expect(back.state.drawing[1].left).toBe(30);
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
	expect(cat.ammo).toBe(0);
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
