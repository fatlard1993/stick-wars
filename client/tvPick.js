import { getGames } from '@fatlard1993/web-game-framework/client';

// Which game a TV follows: one with someone at it, a tournament first (it's game night), then a battle being fought,
// then one being drawn for; the newest of a kind. The one it's on stays while it still has someone at it, unless a
// tournament comes along.
const rank = game => (game.state?.mode === 'tournament' ? 3 : game.state?.phase === 'battle' || game.state?.phase === 'over' ? 2 : 1);

/** The game a TV should be showing (its id), or null with nothing on */
export const pickGame = async currentId => {
	const { body: games = [] } = await getGames({ invalidateAfter: 0 });
	const live = games.filter(game => game.players?.some(({ online }) => online));
	const current = live.find(game => game.id === currentId);
	const best = [...live].reverse().sort((a, b) => rank(b) - rank(a))[0] ?? null;

	if (current && !(best && best.state?.mode === 'tournament' && current.state?.mode !== 'tournament')) return current.id;

	return best?.id ?? null;
};
