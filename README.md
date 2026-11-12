# Stick Men Wars

Draw your own army of stick men, stones, catapults and weapons, then watch them hack each other to bits. Play the computer or a friend.

![A battle: hand-drawn stick men with axes and swords swarming a stone wall, catapults behind each wall, blood on the ground](screenshot.png)

## Playing

Pick **vs computer**, or **two players** to fight a friend on their own device (the invite button in the bar shows a code for their phone).

### Drawing your army

Five pages, each against the clock. Draw as many as you like on each: the check mark (or Enter) keeps a drawing if it passes a quick shape check, and says what's missing if it doesn't. The curly arrow undoes a line (Z), the eraser clears the page (C), the arrow to the bar moves on (N). A page left with nothing kept gets the defaults. The dashed drawing shows what's wanted. A pen that slides off the page lifts there, and draws on again where it comes back.

| What | Time | The check |
| --- | --- | --- |
| Stick men | 45s | a roundish closed head on top, a body hanging from it, arms and legs sticking out both sides, not a scribble |
| Stones | 25s | one closed, lumpy outline |
| Beams | 25s | long and thin, at least three times as long as it is wide |
| Ammo | 25s | a closed, round-ish lump: bigger hits harder, spikier tears more |
| Weapons | 40s | anything with some size to it; handle at the bottom |

A weapon's shape is its stats, shown while you draw it: length is reach (the ruler), width and ink are weight (the kettlebell), jagged edges are shredding and bleeding (the saw), a thin blade cuts cleaner (the knife). Any shape will do: a big clunky one hits hard but swings slowly (the bolt) and slows the man carrying it. Each gets a name: Shredder, Bone Crusher, Skewer, Shiv or Blade. Skewers stab.

Against the computer, both armies are made from your drawings. Against a friend, each fights with their own.

### The battle

The field runs back into the page: men, catapults and rubble stand nearer or further, and men cross the field to meet whoever they fight. Each side has a wall of its stones, two catapults of its beams with 6 shots each (one forward, one back), and 12 stick men standing in rows at home behind the wall from the start, one crewing each catapult. Each man is one of the side's drawings, carrying one of its weapons.

Every man has a job, and choosing them is the game:

- **Fight**: the running man (Space) sends them charging; the shield (H) has them hold just outside your wall; the tent (B) brings them home.
- **Shoot**: the catapult button (C), then tap a catapult; or with men picked, just tap it. A catapult only fires with crew at it, loads faster with up to three, and sends its crew home when its ammo runs out. Over each catapult: its ammo, its crew (red when nobody's at it), and a hammer while it's being repaired.
- **Repair**: the hammer button (R), then tap a catapult or your wall; or with men picked, tap your wall. Repairers patch cracked stones and set new ones into the wall's gaps, mend a damaged catapult, and even rebuild a smashed one from its wreck, slowly, to fight on with whatever ammo it had.

**Picking men**: tap one, or drag a box around several (the dashed box button, A, picks everyone; Esc lets go). The count of who's picked sits by the buttons. With nobody picked, fight orders go to everyone not crewing or repairing. Tapping past your wall with men picked sends them charging.

**Flinging**: drag from one of your catapults, any way, and let go: it flings the other way, harder the further you pull (full strength is a short drag). The dotted line shows where it goes.

The walls are real stones: each block is one of the side's stone drawings, its outline its shape, stacked and resting. A boulder knocks stones loose, and whatever loses its support falls the way its shape makes it fall. A stone takes as much battering as its drawn size gives it, then cracks into rubble. Men climb rubble a stone high at a time, and hack at what's taller.

Men charging march at the nearest enemy and fight; the rest fight whoever comes close. Blades only reach men in about the same lane, and cut where they actually pass: arms, legs, heads, or a torso in half. A head or a torso cut off kills; a lost leg leaves a man crawling until he bleeds out, and he no longer counts. Cut-off parts fly, stumps spurt, and a boulder landing on someone flattens them. Blades fall from dead hands and get bloodier as they're used.

The last side with anyone standing wins. Then fight again with the same armies (the circling arrows), or draw new ones (the pencil).

If a player's page closes, their drawing clock and the battle wait for them. If they leave the game (the door), their side is free for the next person to join, who draws their own army.

## Running it

A multiplayer web game on [web-game-framework](https://github.com/fatlard1993/web-game-framework) and [@vanilla-bean/components](https://github.com/fatlard1993/vanilla-bean-components).

```sh
bun install
bun run dev
```

Then open http://localhost:3000. Anyone on the network can join from the ➕👫 code, and the lobby at `#/hub` lists every game to watch.

- `rules.js` is what the game is (the steps, the sides, the modes); `art.js` judges drawings and fits stick men with skeletons; `field.js` is the field's geometry. All three are shared by the server and the page. `battle.js` is the battle and `masonry.js` its walls of stones (on [planck.js](https://github.com/piqnt/planck.js)), both run on the server.
- `Game.js` runs a game on the server: seats, drawing clocks, the battle loop, and what each page is sent.
- `client/` is the page: `Start`, `Play`, the drawing screen and the battle screen.
- `data/games.json` holds the games and their art between restarts.
