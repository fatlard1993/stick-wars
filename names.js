// Names, earned: a gladiator gets one after a few wins in the hall, a weapon after a few kills, each made from what it is
// (its build, its gear, its shape) and always the same for the same drawing, so nothing about it is stored.

/** How many wins earn a gladiator its name, and how many kills a weapon its name */
export const NAMED_AT_WINS = 3, NAMED_AT_KILLS = 5;

const FIRSTS = [
	'Grubnak', 'Bonzo', 'Mungo', 'Scrunk', 'Gristle', 'Brutus', 'Lumpkin', 'Snarl', 'Big Kev', 'Fizzwick', 'Ogg', 'Stabatha',
	'Pencilius', 'Knuckles', 'Dorf', 'Zog', 'Margaret', 'Clonk', 'Squigg', 'Barbara', 'Thudd', 'Noodle', 'Grim Pete', 'Doodlebeard',
];

// A gladiator's title, by its strongest trait: each with a couple of ways to say it
const TITLES = {
	armored: ['the Tin Can', 'Iron-Belly'],
	shielded: ['Shield-Wall', 'the Turtle'],
	spindly: ['Stick-Legs', 'the Lanky'],
	stubby: ['the Squat', 'Stumpy'],
	crusher: ['Bonecruncher', 'the Mallet'],
	shredder: ['the Shredder', 'Saw-Hand'],
	skewer: ['the Poker', 'Long-Reach'],
	shiv: ['Quick-Knife', 'the Stabby'],
	bare: ['the Naked', 'the Bold'],
	plain: ['the Scribbled', 'the Inky'],
};

// What a weapon is called, by what its shape makes it (art.js weaponStats' name), and what it's "of", by its strongest trait
const NOUNS = {
	Shredder: ['Cheese Grater', 'Flesh Comb', 'Ripper'],
	'Bone Crusher': ['Mallet', 'Knee Knocker', 'Skull Smoosher'],
	Skewer: ['Pokey Stick', 'Kebabber', 'Olive Fork'],
	Shiv: ['Toothpick', 'Paper Cut', 'Pencil Sharpener'],
	Blade: ['Slicer', 'Butter Knife', 'Chopper'],
};
const OFS = {
	heavy: ['of Crushing', 'of Great Heft'],
	long: ['of Far Poking', 'of Long Arms'],
	jagged: ['of Shredding', 'of Splatter'],
	light: ['of Quickness', 'of Little Cuts'],
	plain: ['of Doom', 'of Regret'],
};

// A number from a drawing's first points: the same drawing, the same number
const seedOf = raw => {
	let h = 2166136261;

	for (const p of (raw ?? []).flat().slice(0, 48)) h = Math.imul(h ^ (Math.round(p.x) * 31 + Math.round(p.y)), 16777619);

	return h >>> 0;
};
const by = (list, n) => list[n % list.length];

// A gladiator's strongest trait, from its art: gear first, then build, then what it swings
const traitOf = art => {
	const armor = art.armor?.[0], shield = art.shield?.[0], weapon = art.swords?.[0]?.stats, L = art.stickmen?.[0]?.rig?.lens;
	const spindly = L ? (L[6] + L[7] + L[8] + L[9]) / 2 / 0.42 - 1 + ((L[2] + L[3] + L[4] + L[5]) / 2 / 0.28 - 1) : 0;

	if (armor?.weight > 1.1) return 'armored';
	if (shield?.stats?.rel > 0.65) return 'shielded';
	if (spindly > 0.25) return 'spindly';
	if (spindly < -0.15) return 'stubby';
	if (weapon?.name === 'Bone Crusher') return 'crusher';
	if (weapon?.name === 'Shredder') return 'shredder';
	if (weapon?.name === 'Skewer') return 'skewer';
	if (weapon?.name === 'Shiv') return 'shiv';
	if (!armor && !shield) return 'bare';

	return 'plain';
};

/** A gladiator's name, from its art (warrior, weapon, armor, shield): a first name, and a title for what it is */
export const gladiatorName = art => {
	const h = seedOf(art?.stickmen?.[0]?.raw);

	return `${by(FIRSTS, h)} ${by(TITLES[traitOf(art ?? {})], h >>> 9)}`;
};

/** A weapon's name, from its drawing: what its shape makes it, and what it's "of" */
export const weaponName = item => {
	const h = seedOf(item?.raw), s = item?.stats ?? {};
	const trait = s.weight > 2 ? 'heavy' : s.lr > 0.9 ? 'long' : s.serr > 0.5 ? 'jagged' : s.weight < 0.7 ? 'light' : 'plain';

	return `the ${by(NOUNS[s.name] ?? NOUNS.Blade, h)} ${by(OFS[trait], h >>> 9)}`;
};
