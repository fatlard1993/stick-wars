import { existsSync, readFileSync } from 'node:fs';

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
// And the crowd with the stick men drawn before it
CROWD.stockOnce(drawnBefore('stickmen'));

// Each shelf players vote on, by its address
const SHELVES = { armory: ARMORY, crowd: CROWD };

// The game's own pages' data, beside the games': the hall of gladiators, and the armory with its votes
const extras = request => {
	const url = new URL(request.url);

	if (request.method === 'GET' && url.pathname === '/hall') return Response.json(HALL.standings());

	const list = request.method === 'GET' && url.pathname.match(/^\/(armory|crowd)$/);

	if (list) return Response.json(SHELVES[list[1]].listing(url.searchParams.get('sort'), url.searchParams.get('voter')));

	const vote = request.method === 'POST' && url.pathname.match(/^\/(armory|crowd)\/(\w+)\/vote$/);

	if (!vote) return null;

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
