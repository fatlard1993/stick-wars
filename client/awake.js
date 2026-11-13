import NoSleep from 'nosleep.js';

/**
 * Keep the screen awake while a game's open: the browser's wake lock where it's had (a secure page), and elsewhere (a
 * phone on the house's plain address) a tiny silent video looping out of sight. Either needs a tap first, and is let go
 * when the page is hidden, so every tap takes it again if it's gone.
 * @returns {Function} Lets the screen sleep again
 */
export const stayAwake = () => {
	const noSleep = new NoSleep();
	const wake = () => {
		if (!noSleep.isEnabled) noSleep.enable().catch(() => {});
	};

	for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, wake, { capture: true });

	return () => {
		for (const type of ['pointerdown', 'keydown']) document.removeEventListener(type, wake, { capture: true });
		noSleep.disable();
	};
};
