// The game's controls and marks, drawn as pencil doodles: each a path on a 24 by 24 page, stroked in the ink around it.
// The same paths go on buttons (icon) and on the battlefield's canvas (drawIcon), so a control and what it shows match.

const head = (x, y, r = 2.2) => `M${x + r} ${y}a${r} ${r} 0 1 1-${r * 2} 0a${r} ${r} 0 1 1 ${r * 2} 0`;
const figure = x => `${head(x, 5.5)} M${x} 7.7v6.3 M${x} 10l-2.8 2.4 M${x} 10l2.8 2.4 M${x} 14l-2.4 5.5 M${x} 14l2.4 5.5`;

export const ICONS = {
	home: 'M3 11.5 12 4l9 7.5 M5.5 10v9.5h13V10 M10 19.5v-5h4v5',
	soundOn: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z M15.5 9c1.2 1.6 1.2 4.4 0 6 M18 6.5c2.6 3 2.6 8 0 11',
	soundOff: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4z M15.5 9.5l5 5 M20.5 9.5l-5 5',
	invite: `${figure(7)} M17.5 7.5v8 M13.5 11.5h8`,
	leave: 'M5 3.5h9v17H5z M11.5 12h.01 M14.5 12h6.5 M18 9l3 3-3 3',
	keep: 'M4.5 12.5l5 5L19.5 6',
	undo: 'M9 5.5 4.5 10 9 14.5 M4.5 10h9.5a5 5 0 0 1 0 10H11',
	clear: 'M14.5 4.5l5 5-9 9h-6l-2-2 12-12z M8.5 10.5l5 5 M10.5 18.5H21',
	next: 'M3.5 12h14 M12.5 6.5 18 12l-5.5 5.5 M20.5 6v12',
	charge: `${head(15, 4.5, 2)} M14 7 11.5 13 M11.5 13l3.5 3-1 4.5 M11.5 13l-4 2.5-1.5 3.5 M13.3 8.5l-4 1.5 M13.3 8.5l3.5 2.5 M16.8 11l4-6.5`,
	hold: 'M12 3 19.5 6v5.5c0 4.6-3.2 8-7.5 9.5C7.7 19.5 4.5 16.1 4.5 11.5V6z M12 7v10',
	base: 'M12 3v6 M12 3.5l5 2-5 2 M3.5 21 12 12.5l8.5 8.5 M9.5 21l2.5-4.5 2.5 4.5',
	all: `M3.5 7.5v-4h4 M16.5 3.5h4v4 M20.5 16.5v4h-4 M7.5 20.5h-4v-4 M10 3.5h4 M10 20.5h4 M3.5 10v4 M20.5 10v4 ${head(12, 8, 1.6)} M12 9.6v4 M12 13.6l-2 3 M12 13.6l2 3 M12 11.2l-2 1.2 M12 11.2l2 1.2`,
	trophy: 'M7 4h10v4a5 5 0 0 1-10 0z M7 6H4.5a2.5 2.5 0 0 0 2.5 4 M17 6h2.5a2.5 2.5 0 0 1-2.5 4 M12 13v4 M9.5 17h5v3.5h-5z',
	skull: 'M12 3.5c4.4 0 7.5 3 7.5 7 0 2.5-1.3 4.2-3 5v3.5h-9v-3.5c-1.7-.8-3-2.5-3-5 0-4 3.1-7 7.5-7z M8 10.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M13 10.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M10 19v-2 M12 19v-2 M14 19v-2',
	draw: 'M12 3.5 7 8.5 M12 3.5l5 5 M3.5 20.5h17 M6.5 17l5.5-8.5 5.5 8.5',
	again: 'M19.5 9A8 8 0 0 0 5 8 M4.5 3.5V8H9 M4.5 15A8 8 0 0 0 19 16 M19.5 20.5V16H15',
	redraw: 'M15.5 4.5l4 4L9 19H5v-4z M13.5 6.5l4 4',
	robot: 'M6.5 8h11v9.5h-11z M10 12h.01 M14 12h.01 M10 15h4 M12 8V5.5 M13 4.5a1 1 0 1 1-2 0a1 1 0 1 1 2 0 M4.5 11v3.5 M19.5 11v3.5',
	person: figure(12),
	twoPlayers: `${figure(7)} ${figure(17)}`,
	pause: 'M8.5 5v14 M15.5 5v14',
	hourglass: 'M6 3.5h12 M6 20.5h12 M7.5 3.5c0 5 9 6 9 8.5s-9 3.5-9 8.5 M16.5 3.5c0 5-9 6-9 8.5s9 3.5 9 8.5',
	ruler: 'M3.5 15.5 15.5 3.5l5 5-12 12z M7 12l2 2 M10 9l2 2 M13 6l2 2',
	weight: 'M8.5 9a3.5 3.5 0 1 1 7 0 M6 20.5l1.5-11h9l1.5 11z',
	saw: 'M3.5 9.5h17v4 M3.5 9.5v4l2 3 2-3 2 3 2-3 2 3 2-3 2 3 2-3',
	knife: 'M4 20 13.5 10.5 M13.5 10.5l6-6.5.5 4-5.5 5.5 M4 20l2.5-.5',
	bolt: 'M13 3 6 13.5h5.5L10.5 21 18 10h-5.5z',
	sword: 'M4 20l3-3 M5.5 15l3.5 3.5 M8 16 19.5 4.5v3.5L10 17.5',
	flag: 'M6 21V4 M6 4.5h11l-2.5 3.5 2.5 3.5H6',
	rock: 'M4.5 14.5c0-4 3-8 7.5-8s7.5 3.5 7.5 7-3 5.5-7.5 5.5-7.5-1-7.5-4.5z M9 11.5l2 1',
	blood: 'M12 3.5c3 4 6 7.5 6 10.5a6 6 0 0 1-12 0c0-3 3-6.5 6-10.5z',
	bone: 'M6.5 9.5 14.5 17.5 M6.5 9.5a2 2 0 1 1-2.5-2.5 2 2 0 1 1 2.5-2.5l1 1a2 2 0 0 1 0 1z M14.5 17.5a2 2 0 1 0 2.5 2.5 2 2 0 1 0 2.5-2.5',
	empty: 'M5 5l14 14 M19 5 5 19',
	reload: 'M12 4a8 8 0 1 0 8 8 M12 4V1 M12 4l3 2',
	target: 'M12 3.5a8.5 8.5 0 1 0 .01 0 M12 8a4 4 0 1 0 .01 0 M12 1.5v4 M12 18.5v4 M1.5 12h4 M18.5 12h4',
	rotate: 'M7.5 3.5h9v17h-9z M10.5 17.5h3 M19.5 8.5a8 8 0 0 1 1 7 M20.5 15.5l1-3 M20.5 15.5l-3-.5',
	hammer: 'M13.5 4.5l6 6-2.5 2.5-6-6z M12 8.5 3.5 17a1.8 1.8 0 0 0 2.5 2.5l8.5-8.5',
	back: 'M15 5.5a2 2 0 1 1 .01 0 M14.5 8.5 16 14l2.5 5.5 M16 14l-3 5.5 M14.8 10l3 2 M14.8 10l-2.5 2.5 M9.5 12H2.5 M5.5 9l-3 3 3 3',
	thumbUp: 'M4 11h3v9H4z M7 11 10.5 4.5Q12.5 4.5 12 7.5L11.5 10H17.5Q19.5 10.2 19 12.5L17.8 18Q17.4 20 15.5 20H7',
	thumbDown: 'M4 13h3V4H4z M7 13 10.5 19.5Q12.5 19.5 12 16.5L11.5 14H17.5Q19.5 13.8 19 11.5L17.8 6Q17.4 4 15.5 4H7',
	rack: 'M3.5 20.5h17 M5 20.5V7.5 M19 20.5V7.5 M3.5 7.5h17 M8.5 7.5v10l-1 2 M12 7.5v9.5 M10.5 10h3 M15.5 7.5l1.5 9-2 1z',
	split: 'M2.5 9.5h2.5v6H2.5z M5 9.5l2.5-4.5q1.5 0 1.2 2.2L8.5 9h3.3q1.4.2 1 1.8l-.8 3.6q-.3 1.1-1.5 1.1H5 M21.5 14.5H19v-6h2.5z M19 14.5l-2.5 4.5q-1.5 0-1.2-2.2l.2-1.8h-3.3q-1.4-.2-1-1.8l.8-3.6q.3-1.1 1.5-1.1H19',
	crowd: `${head(6, 8, 2)} M6 10v4 M3.5 12l2.5-1 2.5 1 ${head(12, 6, 2.2)} M12 8.2v5 M9 9.5 12 11l3-1.5 ${head(18, 8, 2)} M18 10v4 M15.5 12l2.5-1 2.5 1 M3 20.5h18`,
	bracket: 'M3.5 4.5h5v4h4 M3.5 12.5h5v-4 M3.5 15.5h5v4h4 M8.5 15.5v4 M12.5 8.5v11 M12.5 14h5 M17.5 11.5v5 M17.5 14h3',
	helmet: 'M5 16a7 7 0 0 1 14 0v3.5h-4.5V15h-5v4.5H5z M12 15v4.5 M7 6.5c2-3.5 8-3.5 10 0 M12 3.5V9',
	catapult: 'M3.5 19.5h17 M6 19.5l4-8 4 8 M10 11.5 18.5 5 M18.5 5a2 2 0 1 1 1.5 2.5',
};

const SVG = 'http://www.w3.org/2000/svg';

/**
 * A doodle as an element, in the color of the text around it
 * @param {string} name - Which (a key of ICONS)
 * @param {object} [options] - { size } in CSS pixels (default 1.6em), { color } to ink it otherwise
 * @returns {SVGElement} The icon
 */
export const icon = (name, { size = '1.6em', color = 'currentColor' } = {}) => {
	const svg = document.createElementNS(SVG, 'svg');
	const path = document.createElementNS(SVG, 'path');

	svg.setAttribute('viewBox', '0 0 24 24');
	svg.setAttribute('width', size);
	svg.setAttribute('height', size);
	svg.setAttribute('aria-hidden', 'true');
	svg.style.verticalAlign = 'middle';
	svg.style.flex = 'none';
	path.setAttribute('d', ICONS[name] ?? '');
	path.setAttribute('fill', 'none');
	path.setAttribute('stroke', color);
	path.setAttribute('stroke-width', '2.1');
	path.setAttribute('stroke-linecap', 'round');
	path.setAttribute('stroke-linejoin', 'round');
	svg.append(path);

	return svg;
};

const paths = {};

/**
 * A doodle on a canvas, centered on x, y
 * @param {CanvasRenderingContext2D} g - Where
 * @param {string} name - Which
 * @param {number} x - Center
 * @param {number} y - Center
 * @param {number} size - How big, in the canvas's units
 * @param {string} color - Its ink
 */
export const drawIcon = (g, name, x, y, size, color) => {
	paths[name] ??= new Path2D(ICONS[name]);
	g.save();
	g.translate(x - size / 2, y - size / 2);
	g.scale(size / 24, size / 24);
	g.strokeStyle = color;
	g.lineWidth = 2.1;
	g.lineCap = 'round';
	g.lineJoin = 'round';
	g.stroke(paths[name]);
	g.restore();
};
