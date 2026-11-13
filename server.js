import { existsSync, readFileSync, statSync } from 'node:fs';

import { stockWeapons } from './art.js';

import { Server, basicGameRoutes } from '@fatlard1993/web-game-framework';

import Game, { ARMORY, CROWD, HALL } from './Game.js';

const routes = basicGameRoutes();

// The armory opens stocked with the weapons drawn before it existed: the hall's gladiators', and saved games' drawn ones
const savedGames = () => {
	try {
		return existsSync('./data/games.json') ? Object.values(JSON.parse(readFileSync('./data/games.json', 'utf8')).games ?? {}) : [];
	} catch {
		return [];
	}
};

const drawnBefore = kind => [
	...HALL.load().flatMap(entry => entry.art[kind] ?? []),
	...savedGames().flatMap(game => (game?.state?.art ?? []).flatMap(art => (art?.[kind] ?? []).filter(item => item.drawn))),
];

ARMORY.stockOnce(drawnBefore('swords'));
// And the computer's own war weapons and the defaults, there for anyone to borrow and their kills counted (each only
// once: one like it already there isn't added)
for (const weapon of stockWeapons()) ARMORY.offer(weapon);
// And the crowd with the stick men drawn before it
CROWD.stockOnce(drawnBefore('stickmen'));

// Each shelf players vote on, by its address
const SHELVES = { armory: ARMORY, crowd: CROWD };

// A vote is a few words: anything bigger isn't one
const MOST_BODY = 2048;

// The page's build, as when it was last built: its page's file time (it's rebuilt whole)
const buildOf = () => {
	try {
		return String(statSync('client/build/index.html').mtimeMs);
	} catch {
		return '';
	}
};

// The game's own pages' data, beside the games': the hall of gladiators, and the armory's and the crowd's shelves with
// their votes
const extras = request => {
	const url = new URL(request.url);

	if (request.method === 'GET' && url.pathname === '/hall') return Response.json(HALL.standings());
	if (request.method === 'GET' && url.pathname === '/fallen') return Response.json(HALL.fallen());
	// Which build of the page is out: an open page older than it reloads itself when it's safe to
	if (request.method === 'GET' && url.pathname === '/build') return Response.json({ build: buildOf() });

	const list = request.method === 'GET' && url.pathname.match(/^\/(armory|crowd)$/);

	if (list) return Response.json(SHELVES[list[1]].listing(url.searchParams.get('sort'), url.searchParams.get('voter'), url.searchParams.get('take') ?? undefined));

	const vote = request.method === 'POST' && url.pathname.match(/^\/(armory|crowd)\/(\w+)\/vote$/);

	if (!vote) return null;
	if (Number(request.headers.get('content-length') ?? MOST_BODY + 1) > MOST_BODY) return Response.json({ message: 'Too big for a vote' }, { status: 413 });

	return request
		.json()
		.catch(() => ({}))
		.then(({ voter, thumb } = {}) => {
			const entry = SHELVES[vote[1]].vote(vote[2], voter, thumb);

			return entry ? Response.json({ up: entry.up, down: entry.down }) : Response.json({ message: 'No such vote' }, { status: 400 });
		});
};

// One server for the page and every game: the games' routes (list, create, join, exit, delete), and the built page for
// the rest. Players act and are sent their view of the game over the socket; the framework ties each to its player.
// 'auto' port: PORT if set, else the one this game had last, else 3000, else any free one.
export const server = new Server({
	port: 'auto',
	Game,
	database: './data/games.json',
	router: running => request => extras(request) ?? routes(request, running),
	static: true,
});
