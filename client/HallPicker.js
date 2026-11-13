import { GET } from '@vanilla-bean/components';

import BorrowPicker from './BorrowPicker.js';
import { drawGladiator } from './Hall.js';
import { count, Doodle } from './ui.js';

/**
 * The hall opened on the warrior's page: its gladiators, best record first, drawn with their armor and shields and no
 * weapon; one tapped is enlisted, its record carried on, and its weapon chosen next
 */
export default class HallPicker extends BorrowPicker {
	static mark = 'trophy';

	async items() {
		const { body = [] } = await GET('/hall', { apiId: 'hall', invalidateAfter: 0 });

		return body;
	}

	card(gladiator) {
		const button = new Doodle({ title: 'Enlist this one', onPointerPress: () => this.take('enlist', gladiator) });
		const canvas = document.createElement('canvas');
		const row = document.createElement('span');

		drawGladiator(canvas, gladiator, 84, 104);
		canvas.style.cssText = 'width: 84px; height: 104px';
		row.style.cssText = 'display: inline-flex; gap: 6px';
		row.append(count('trophy', gladiator.wins), count('skull', gladiator.losses));
		button.elem.append(canvas, ...(gladiator.name ? [Object.assign(document.createElement('span'), { textContent: gladiator.name, style: 'font-size: 0.8em; max-width: 110px' })] : []), row);

		return button.elem;
	}
}
