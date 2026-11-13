import Armory from './Armory.js';

/** The crowd: every stick man players have drawn, who watch from the arena's stands; voted on with thumbs, the loved ones
 * seen in the stands more often */
export default class Crowd extends Armory {
	static shelf = 'crowd';
	static mark = 'crowd';
	static sorts = ['loved', 'hated', 'controversial'];
	static kills = false;
}
