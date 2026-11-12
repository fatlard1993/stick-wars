import { TinyColor } from '@ctrl/tinycolor';
import { appendStyles, theme } from '@vanilla-bean/components';

// The game's own look, over the component library's dark one: a notebook page, pencil ink, a hand-drawn font. Set here,
// before any view is built, so the library's own pieces (the bar, dialogs, toasts) wear it as well as the game's.

export const PAPER = '#f7f2e4';
export const PAPER_DARK = '#ece3cd';
export const PENCIL = '#2b2b2b';
export const RED_PENCIL = '#b3261e';
export const BLUE_LINE = 'rgba(90, 130, 210, 0.22)';
export const HAND = "'Patrick Hand', 'Comic Sans MS', 'Chalkboard SE', cursive";

const { colors } = theme;
const ink = new TinyColor(PENCIL);
const paper = new TinyColor(PAPER);

// The library draws its ground in black and its text in white, both worked out from gray: here they're the page and
// the pencil
Object.defineProperty(colors, 'white', { get: () => ink, configurable: true });
Object.defineProperty(colors, 'black', { get: () => paper, configurable: true });

colors.surface = new TinyColor(PAPER_DARK);
colors.raised = new TinyColor('rgba(43, 43, 43, 0.05)');
colors.border = new TinyColor('rgba(43, 43, 43, 0.25)');
colors.muted = new TinyColor('#6b6457');
colors.accent = ink;
colors.edge = new TinyColor('rgba(43, 43, 43, 0.6)');
colors.overlay = new TinyColor('rgba(43, 43, 43, 0.3)');
colors.selected = new TinyColor(RED_PENCIL);
// A plain button is a scrap of paper inked round its edge (Doodle, in ui.js, draws the edge)
colors.blue = new TinyColor('#fffdf6');

appendStyles(
	`
	body, body *:not(svg):not(svg *) {
		font-family: ${HAND} !important;
	}

	body {
		font-size: 19px;
		background: ${PAPER};
	}
	`,
	'stick-wars-theme',
);
