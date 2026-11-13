// The game's look goes on first, before any view draws its styles
import './theme.js';

import { Page, Router } from '@vanilla-bean/components';
import { Create, Hub } from '@fatlard1993/web-game-framework/ui';

import '@fatlard1993/web-game-framework/client/socket';
import '@vanilla-bean/components/app/reloadOnBuild';

import Armory from './Armory.js';
import Crowd from './Crowd.js';
import Hall from './Hall.js';
import JoinNow from './JoinNow.js';
import Play from './Play.js';
import Start from './Start.js';

// The start screen and the game are this game's own, in pictures. The framework's lobby stays at #/hub: every game,
// joining one by name, and watching one.
// Watching shows the game without playing it: the same view as a player's, without controls
class Watch extends Play {
	constructor(options, ...children) {
		super({ ...options, watch: true }, ...children);
	}
}

const views = {
	'/': Start,
	'/hall': Hall,
	'/armory': Armory,
	'/crowd': Crowd,
	'/play/:gameId': Play,
	'/watch/:gameId': Watch,
	'/hub': Hub,
	'/create': Create,
	// An invite's code: seated at once, no form
	'/join/:gameId': JoinNow,
};

new Page({ appendTo: document.body, append: new Router({ views, defaultPath: '/' }) });
