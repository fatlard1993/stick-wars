import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** How long after a change a store is written: changes in between are written together, off the request that made them */
export const SAVE_AFTER = 1000;

// Every store with a file, to write what's waiting before the server stops
const stores = new Set();

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stores.forEach(store => store.flush()));

/**
 * A list of entries kept in a JSON file of its own (or only in memory, with none), outliving any one game: read the first
 * time it's wanted, written soon after it changes. The hall of gladiators (roster.js) and the shelves (shelf.js) are ones.
 */
export default class Store {
	constructor(file = null) {
		this.file = file;
		this.list = null;
		this.pending = null;
		if (file) stores.add(this);
	}

	load() {
		if (this.list) return this.list;
		try {
			this.list = this.file && existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : [];
		} catch {
			this.list = [];
		}

		return this.list;
	}

	/** Written soon, with whatever else changes meanwhile */
	save() {
		if (!this.file || !this.list || this.pending) return;
		this.pending = setTimeout(() => this.flush(), SAVE_AFTER);
	}

	/** Written now, if anything's waiting. A list never loaded is never written over the one in the file. */
	flush() {
		clearTimeout(this.pending);
		this.pending = null;
		if (!this.file || !this.list) return;
		mkdirSync(dirname(this.file), { recursive: true });
		writeFileSync(this.file, JSON.stringify(this.list));
	}

	get(id) {
		return id ? this.load().find(entry => entry.id === id) : undefined;
	}

	/** A new entry's id */
	static id() {
		return Math.random().toString(36).slice(2, 10);
	}
}
