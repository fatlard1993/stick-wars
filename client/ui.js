import { Button, Component, styled } from '@vanilla-bean/components';

import { icon } from './icons.js';
import { BLUE_LINE, PAPER, PENCIL } from './theme.js';

/** The page every screen is drawn on: notebook paper, blue lines */
export const lined = `background: repeating-linear-gradient(transparent 0 31px, ${BLUE_LINE} 31px 32px), ${PAPER};`;

/** A button as a scrap of paper inked round a wobbly edge, sinking when pressed */
export const Doodle = styled(
	Button,
	() => `
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 6px 14px;
		font-size: 1.1em;
		color: ${PENCIL};
		background: #fffdf6;
		border: 2.5px solid ${PENCIL};
		border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
		box-shadow: 2px 3px 0 ${PENCIL};
		transition: transform 0.08s, box-shadow 0.08s;

		&:hover, &:focus-visible { filter: none; transform: translate(-1px, -1px); box-shadow: 3px 4px 0 ${PENCIL}; }
		&:active { filter: none; transform: translate(1px, 2px); box-shadow: none; }
		&[aria-pressed='true'] { background: #ffe36e; }
		&.big { font-size: 1.5em; padding: 10px 22px; background: #ffe36e; }
		&.red { background: #f4b9ad; }
	`,
);

/**
 * A doodle button: its icon, and a word or two in the hand when it needs one
 * @param {string} name - The icon
 * @param {object} options - { title, onPress, big, label, size, ...whatever else a Button takes }
 * @returns {Doodle} The button
 */
export const doodle = (name, { title, onPress, big, label, size, addClass, ...rest } = {}) => {
	const button = new Doodle({ title, onPointerPress: onPress, addClass: ['doodle', big && 'big', addClass].filter(Boolean), ...rest });

	button.elem.append(icon(name, { size }));
	if (label) button.elem.append(Object.assign(document.createElement('span'), { textContent: label }));

	return button;
};

/** The game's sound switch: a speaker, struck through while it's muted */
export const soundSwitch = sound => {
	const button = doodle(sound.settings.muted ? 'soundOff' : 'soundOn', { title: 'Sound', onPress: () => sound.toggleMute() });
	const off = sound.onChange(({ muted }) => button.elem.replaceChildren(icon(muted ? 'soundOff' : 'soundOn')));

	button.addCleanup?.('sound', off);

	return button;
};

/** A count: a small doodle and its number */
export const count = (name, value, color) => {
	const span = document.createElement('span');

	span.style.display = 'inline-flex';
	span.style.alignItems = 'center';
	span.style.gap = '2px';
	span.append(icon(name, { size: '1.2em', color }), String(value));

	return span;
};

/** A word or two in the hand, big */
export const Heading = styled(
	Component,
	() => `
		font-size: 2.2em;
		line-height: 1.05;
		color: ${PENCIL};
	`,
);
