import { Component, styled } from '@vanilla-bean/components';
import { View } from '@fatlard1993/web-game-framework/ui';

import ShelfList from './Armory.js';
import HallList from './Hall.js';
import { PENCIL } from './theme.js';
import { doodle, lined } from './ui.js';

// The tabs, in the bar: the hall of gladiators, the armory of weapons, the crowd of stick men
const TABS = [
	['hall', 'trophy', 'Hall of gladiators', host => new HallList(host)],
	['fallen', 'skull', 'The fallen: champions given the thumbs down', host => new HallList(host, { fallen: true })],
	['armory', 'rack', 'Armory', host => new ShelfList(host, ShelfList.armory)],
	['crowd', 'crowd', 'Crowd', host => new ShelfList(host, ShelfList.crowd)],
];

const Screen = styled(
	Component,
	({ space }) => `
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: ${space.md};
		flex: 1 0 auto;
		padding: ${space.lg} ${space.md} ${space.xl};
		color: ${PENCIL};
		${lined}

		& .cards { display: flex; flex-wrap: wrap; justify-content: center; gap: ${space.md}; max-width: 1100px; }
		& .empty { opacity: 0.5; margin-top: ${space.xl}; }
	`,
);

/** What's been made: the hall, the armory and the crowd, a tab each on one page that scrolls */
export default class Shelves extends View {
	static schema = { tab: { default: 'hall' }, tabButtons: {} };

	constructor(options, ...children) {
		const tabs = Object.fromEntries(TABS.map(([id, name, title]) => [id, doodle(name, { title, size: '1.6em', onPress: () => this.open(id) })]));

		super(
			{
				...options,
				// Kept in the options: the constructor's build opens a tab before this constructor is done
				tabButtons: tabs,
				toolbar: {
					heading: '',
					wrap: false,
					left: [doodle('home', { title: 'Home', onPress: () => (window.location.href = '#/') })],
					right: Object.values(tabs),
				},
			},
			...children,
		);
	}

	build() {
		super.build();
		this.open(this.options.tab);
	}

	open(id) {
		const tab = TABS.find(([name]) => name === id) ?? TABS[0];

		for (const [name, button] of Object.entries(this.options.tabButtons)) button.elem.setAttribute('aria-pressed', String(name === tab[0]));
		// The address follows the tab (so back and a reload land on it), without going through the router again
		history.replaceState(null, '', `#/${tab[0]}`);
		this.screen?.elem.remove();
		this.screen = new Screen({ appendTo: this._body });
		this._body.elem.scrollTop = 0;
		tab[3](this.screen.elem);
	}
}

// One route per tab, so the old addresses still open the right one
const tabbed = tab =>
	class extends Shelves {
		constructor(options, ...children) {
			super({ ...options, tab }, ...children);
		}
	};

export const HallTab = tabbed('hall'), FallenTab = tabbed('fallen'), ArmoryTab = tabbed('armory'), CrowdTab = tabbed('crowd');
