# Stick Men Wars

Draw your own army of stick men, stones, catapults and weapons, then watch them hack each other to bits. Play the computer or a friend.

![A battle: hand-drawn stick men with axes and swords swarming a stone wall, catapults behind each wall, blood on the ground](screenshot.png)

## Playing

Pick **vs computer**, or **two players** to fight a friend on their own device (the invite button in the bar shows a code for their phone).

### Drawing your army

Four pages, each against the clock. Draw as many as you like on each: the check mark (or Enter) keeps a drawing if it passes a quick shape check, and says what's missing if it doesn't. The curly arrow undoes a line (Z), the eraser clears the page (C), the arrow to the bar moves on (N). A page left with nothing kept gets the defaults. The dashed drawing shows what's wanted. A pen that slides off the page lifts there, and draws on again where it comes back.

| What | Time | The check |
| --- | --- | --- |
| Stick men | 45s | a roundish closed head on top, a body hanging from it, arms and legs sticking out both sides, not a scribble |
| Stones | 25s | one closed, lumpy outline |
| Beams | 25s | long and thin, at least three times as long as it is wide |
| Weapons | 40s | anything with some size to it, inside the box on the page, handle at the bottom |

A weapon is drawn in the box on its page (the pen lifts at the box's edge), and its shape is how it fights: length is reach, width and ink are weight, jagged edges shred and bleed, a thin blade cuts cleaner. Any shape will do: a big clunky one hits hard but swings slowly and slows the man carrying it. Each gets a name: Shredder, Bone Crusher, Skewer, Shiv or Blade. Skewers stab.

Drawing more pays. Every army has 10 men, and each stick man and each weapon you draw past the first of each adds one more man (6 more at most). Each stone past the first raises your wall a row (6 rows, up to 9), and five stones or more make it a stone thicker. Only what you draw counts: the defaults earn nothing.

Every side fights with its own drawings. Against a friend, each draws their own; against the computer, it draws itself a different army (its own stick men, squarer stones, logs and planks, eggs and maces for its catapult, spears, maces, clubs, double axes and saw-toothed swords), a new one each time you draw yours.

### The battle

The field runs back into the page: men, catapults and rubble stand nearer or further, and men cross the field to meet whoever they fight. Each side has a wall of its stones, a catapult of its beams, and its army (10 men or more, as drawn for) standing in rows at home behind the wall from the start, one of them crewing the catapult. The computer fights with 13 men and a wall 7 rows high. Each man is one of the side's drawings, carrying one of its weapons.

Every man has a job, and choosing them is the game:

- **Fight**: the running man (Space) sends them charging; the shield (H) has them hold just outside your wall; the tent (B) brings them home.
- **Shoot**: crew the catapult with the catapult button (C) then a tap on it, or with men picked, just tap it. It only fires with crew at it, loads faster with up to three, and sends its crew home once its last rock is thrown. Over it: whether it's aimed (the target, red until it is), its rocks, its crew (red when nobody's at it), and a hammer while it's being repaired.
- **Repair**: the hammer button (R), then tap a catapult or your wall; or with men picked, tap your wall. Repairers patch cracked stones and set new ones into the wall's gaps, mend a damaged catapult, and even rebuild a smashed one from its wreck, slowly, to fight on with whatever rocks it had.

**Looking around**: on a small screen (a phone) the battle is zoomed in so the men stay readable, starting over your own side: two fingers pan along the field and pinch to zoom. On a computer, the scroll wheel zooms and the arrow keys pan. Held upright, a phone shows the whole battlefield in a strip across the top, with what the main view shows boxed on it: tap or drag along the strip to look there.

**Picking men**: tap one, or drag a box around several (the dashed box button, A, picks everyone; Esc lets go). The count of who's picked sits by the buttons. With nobody picked, fight orders go to everyone not crewing or repairing. Tapping past your wall with men picked sends them charging.

**Rocks**: the catapult starts empty. Every rock it throws is one you draw during the battle: the rock button in the corner of the field (D) opens a small pad; draw a closed, round-ish lump (bigger hits harder, spikier tears more) and keep it (the check mark, or Enter) to put it on the catapult's pile. You get 10 rocks a battle, and the button shows how many are left, wiggling when the catapult has nothing to throw. The computer draws its own as it goes.

**Aiming**: tap your catapult (with no men picked) and an aiming pad opens in the middle of the screen. Pull back from its centre like a slingshot: the further, the farther, and the field shows where it would land. It throws only forward, between a low and a steep angle (the shaded wedge on the pad), and at most into the enemy's wall, never over it: the edge of the pad is as far as it reaches, so men at home behind a wall are safe from rocks (one that rolls over the top drops dead behind it). Let go, and that's its aim: from then on it fires that way by itself as often as it can, its aim drawn as a dotted arc on the field (and the overview). Aim it again any time; the pause on the pad holds its fire. Dragging straight from the catapult aims it too.

The walls are real stones: each block is one of the side's stone drawings, its outline its shape, stacked and resting. A boulder knocks stones loose, and whatever loses its support falls the way its shape makes it fall. A stone takes as much battering as its drawn size gives it, then cracks into rubble. Men climb rubble a stone high at a time, and hack at what's taller.

Men charging march at the nearest enemy and fight; the rest fight whoever comes close. Blades only reach men in about the same lane, and cut where they actually pass: arms, legs, heads, or a torso in half. A head or a torso cut off kills; a lost leg leaves a man crawling until he bleeds out, and he no longer counts. Cut-off parts fly, stumps spurt, and a boulder landing on someone flattens them. Blades fall from dead hands and get bloodier as they're used.

So the field stays readable, the dead, cut-off parts, rubble, dropped weapons and fallen stones lie a while, then fade away (a fallen stone stops being in anyone's way as it goes). The blood stays.

The last side with anyone standing wins. A man with no arms left can't fight, and bleeds out. Then fight again with the same armies (the circling arrows), or draw new ones (the pencil).

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
