# Stick Men Wars

Draw your own army of stick men, stones, catapults and weapons, then watch them hack each other to bits. Play the computer or a friend.

![A battle: hand-drawn stick men with axes and swords swarming a stone wall, catapults behind each wall, blood on the ground](screenshot.png)

## Playing

Pick an animal, then **⚔️🤖** to fight the computer or **⚔️👫** to fight a friend on their own device (the ➕👫 button shows a code for their phone).

### Drawing your army

Five pages, each against the clock. Draw as many as you like on each: **✅** (or Enter) keeps a drawing if it passes a quick shape check, and says what's missing if it doesn't. **↩️** undoes a line, **🗑️** clears, **⏭️** moves on. A page left with nothing kept gets the defaults. The dashed drawing shows what's wanted.

| | What | Time | The check |
| --- | --- | --- | --- |
| 🧍 | Stick men | 45s | a roundish closed head on top, a body hanging from it, arms and legs sticking out both sides, not a scribble |
| 🪨 | Stones | 25s | one closed, lumpy outline |
| 🪵 | Beams | 25s | long and thin, at least three times as long as it is wide |
| ☄️ | Ammo | 25s | a closed, round-ish lump: bigger hits harder, spikier tears more |
| 🗡️ | Weapons | 40s | longer than it is wide; handle at the bottom |

A weapon's shape is its stats, shown while you draw it: length is reach (📏), width and ink are weight (🏋️, slower and harder hitting), jagged edges are shredding and bleeding (🪚), a thin blade cuts cleaner (🔪). Each gets a name: Shredder, Bone Crusher, Skewer, Shiv or Blade. Skewers stab.

Against the computer, both armies are made from your drawings. Against a friend, each fights with their own.

### The battle

Each side has a wall of its stones, two catapults of its beams with 6 shots each, and 12 stick men. Each stick man is one of the side's drawings, carrying one of its weapons.

- **🏃** (or Space) sends a stick man out through your wall.
- **⚔️ / 🛡️** (or H) switches between charging and holding by your own wall.
- **Drag back** from one of your catapults and let go to fling. The dotted line shows where it goes. ⏳ is reloading; 🚫 is out of ammo.

Stick men march at the nearest enemy and fight. A wall stops them unless the next column is at most one brick higher than where they stand, so they hack it down; behind it, they smash the catapults. Blades cut where they actually pass: arms, legs, heads, or a torso in half. A head or a torso cut off kills; a lost leg leaves a man crawling until he bleeds out, and he no longer counts. Cut-off parts fly, stumps spurt, and a boulder landing on someone flattens them. Blades fall from dead hands and get bloodier as they're used.

The last side with anyone standing (fighting or still in reserve) wins: 🏆 or 💀. Then **🔁** fights again with the same armies, **✏️** draws new ones.

If a player's page closes, their drawing clock and the battle wait for them (⏸️). If they leave the game (🚪), their side is free for the next person to join, who draws their own army.

## Running it

A multiplayer web game on [web-game-framework](https://github.com/fatlard1993/web-game-framework) and [@vanilla-bean/components](https://github.com/fatlard1993/vanilla-bean-components).

```sh
bun install
bun run dev
```

Then open http://localhost:3000. Anyone on the network can join from the ➕👫 code, and the lobby at `#/hub` lists every game to watch.

- `rules.js` is what the game is (the steps, the sides, the modes); `art.js` judges drawings and fits stick men with skeletons; `battle.js` is the battle. All three are shared by the server and the page.
- `Game.js` runs a game on the server: seats, drawing clocks, the battle loop, and what each page is sent.
- `client/` is the page: `Start`, `Play`, the drawing screen and the battle screen.
- `data/games.json` holds the games and their art between restarts.
