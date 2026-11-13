import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** How long after a change a store is written: changes in between are written together, off the request that made them */
export const SAVE_AFTER = 1000;

// Every store with a file, to write what's waiting before the server stops
const stores = new Set();

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stores.forEach(store => store.flush()));

// When a file was last written, by anyone (0 for none)
const writtenAt = file => {
	try {
		return statSync(file).mtimeMs;
	} catch {
		return 0;
	}
};

/**
 * A list of entries kept in a JSON file of its own (or only in memory, with none), outliving any one game: read the first
 * time it's wanted, written soon after it changes. The hall of gladiators (roster.js) and the shelves (shelf.js) are ones.
 * Another server may share the file (the house's and a preview, run from one folder): written by it since, it's read
 * again before it's used, unless changes of this one's are still waiting to be written.
 */
export default class Store {
	constructor(file = null) {
		this.file = file;
		this.list = null;
		this.pending = null;
		if (file) stores.add(this);
	}

	load() {
		if (this.list && (this.pending || !this.file || writtenAt(this.file) === this.readAt)) return this.list;
		this.readAt = this.file ? writtenAt(this.file) : 0;
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
		this.readAt = writtenAt(this.file);
	}

	get(id) {
		return id ? this.load().find(entry => entry.id === id) : undefined;
	}

	/** A new entry's id */
	static id() {
		return Math.random().toString(36).slice(2, 10);
	}
}
