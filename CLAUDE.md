# stick-wars

A web game on `@fatlard1993/web-game-framework` and `@vanilla-bean/components`: a war of drawn armies, or a duel of two drawn gladiators. One Bun server (`server.js`) serves the page and holds every game's state; each player's page draws that state and sends what its player does. Anyone with the address can open the lobby, make a game, and join one from their phone.

## Running it

- `bun run dev`: the server at http://localhost:3000 (or `PORT`), rebuilding the page and reloading open browsers as files change. Under paude it's already running as the project's `dev` task and its page is shared: don't start a second one.
- `bun run build` then `bun start`: production.
- `bun test`

## Where things are

- `rules.js`: what the game is: the drawing steps and their clocks (rocks kept on the ammo page start on the catapult's pile; more are drawn in battle), the sides, the modes (🤖 against the computer, 👫 two players), the styles (`STYLES`: a war's pages, `STEPS`, or a gladiator's, `GLADIATOR_STEPS`, armor and shield `optional`; `stepsOf`), a new game's `state`, the bonus for drawing more (`armySize`, `wallSize`, counting only kept drawings marked `drawn`) and the computer's own sizes (`CPU_SIZE`). Shared by server and page.
- `art.js`: geometry, the shape checks a drawing has to pass (`judge(kind, strokes)`, which also cleans what a page sent), the skeleton fitted to a stick man (`buildRig`, each point bound to a bone as `{ b, u, v }`), weapon stats from shape (`weaponStats`), and the defaults, a gladiator's gear (`checkArmor`: drawn over the warrior, bound to its bones through `rig.raw`, its `cover` of each part and `weight`; `checkShield`: its size against the warrior's), the computer's gladiator (`cpuGladiator`), and the computer's own army (`cpuArmy`: generated drawings of every kind, redrawn by a shaky hand (`scrawl`), each passing the same checks). Shared.
- `field.js`: the field's geometry, shared by server and page: its size, where things stand (`homeOf`, `CAT_X`, `CAT_Z`, `WALL_X`), its depth and how it's drawn (`DEPTH`, `project`, `depthScale`), catapults' shape, a fling's path and what a throw is held to (`holdFling`, `flingFor`: forward, between `FLING_ANGLES`, never past `reachOf`, the enemy's wall), the orders men take. The page imports this, never `battle.js`, which would bundle the physics engine.
- `battle.js`: the battle (`World`), on the server: stick men skinned onto 11-joint skeletons, kinematic while alive and verlet ragdolls once dead or cut apart, each standing somewhere along the field (`x`) and across its depth (`z`); each side's whole army (its size given) standing at home from the start, behind a wall of its given size, each man with an order (`idle`, `crew` a catapult, `repair` a catapult or the wall, `hold` the wall, `charge`) given by `command`; a catapult of drawn beams per side that throws only rocks its side drew (`rocks`, its pile: those drawn before the battle, then each drawn in it, `addRock`, `AMMO` a battle in all; the computer draws its own), only with crew at it, at the aim a player set (`aim`, fired by itself whenever it's ready) or the computer's own each shot, mended and rebuilt by repairers; flung ammo; the computer's side, playing by the same orders, by a plan picked each battle (`PLANS`: balanced, rush, turtle, siege, waves). Blades reach only within a `LANE` of depth. The dead (`deadAt`), props (`born`) and loose stones (`looseAt`) lie for `LINGER`, fade over `FADE` (snapshots carry how much is left), and are removed. With `arena`, a gladiators' fight: one man a side (`gladiate`: his gear, speed from his legs, reach from his arms, a `style` from what he carries), no walls or catapults, blows slipped or caught on a shield (`fends`), armor taking its share (`takeHit`), a shout from his side for `STANCE_FOR` seconds (`shout`: `STANCES` charge, back, guard; `fury` for charging and ripostes; the computer shouts at its own), and over only on a death. It never draws: `snapshot()` is what pages draw, and blood, dust, sounds and shakes go out as events (`takeEvents()`), each with its depth. Art is referenced as `{ k: kind, a: whose art, i: which }`.
- `roster.js`: the hall of gladiators, in `data/gladiators.json` (memory only under test): every gladiator that wins, with its record, picked by the computer to fight; one `MOST_BEHIND` more losses than wins is retired.
- `masonry.js`: the walls as real stones in a planck rigid-body world: each block a stone drawing whose outline (pushed most of the way to its box, so walls stack) is its shape, settled before the battle and left asleep until disturbed; boulders as heavy bodies among them; harm from contact impulses, a stone's toughness from its drawn size; stones cracked into rubble; a height map of everything piled up (men stand on and are stopped by the enemy's stones, walk through their own); hacking and repair.
- `Game.js`: one running game. `state` holds the mode, style (`war`, `gladiator`), which saved gladiator each side is (`fame`), phase (`draw`, `battle`, `over`), seats, each side's art and drawing clock, stance and the last result; the `World` itself is never saved (a restart mid-battle fights again with the same art). `actions`: keep, next, rock (a rock drawn in battle onto the catapult's pile, marked `inBattle` so a rematch drops it), send (one man out), order (the picked men: an order, and for crewing 0, for repairing 0 or 'wall'), aim (the catapult's aim, or { hold } to stop it firing), shout (a gladiator's stance), again, redraw. The loop steps the battle and publishes every `TICK_MS`; the art goes to pages on their first view and by `broadcast('art')` when it changes, never every tick. A seated player whose page closed pauses their clock and the battle.
- `Game.test.js`: the rules, actions and a whole battle, without a browser.
- `server.js`: the `Server`, a few lines.
- `client/index.js`: routes: `Start`, `Play`, watch, and the framework's lobby at `#/hub`.
- `client/Start.js`: war or gladiators (remembered), then a mode: back into a game you're in, into a two-player game with a free side, or a new one.
- `client/Play.js`: `enterGame`, the bar, sound and music, and which screen shows for the phase.
- `client/DrawScreen.js`: the drawing page: a `Pad` (`client/Pad.js`, which measures the pen against itself and lifts it where it leaves the page, or a weapon's box, `WEAPON_AREA`) in pad units (`PAD`), the dashed example, the clock, keeping, the gallery. No stats are shown: a weapon's shape speaks in battle.
- `client/BattleScreen.js`: the battle on a `Stage`, drawn back to front through the field's depth (`atDepth`): snapshots eased between ticks, the walls' stones as their wall's thickness (a loose one where it lies), local blood and dust with pools on a decal layer; picking men out (tap, or drag a box: everything is picked as drawn, through `project`) and ordering them (charge, hold, home: Space, H, B; crew and repair, C and R, wait for the tap on their target), tapping the catapult for the aiming pad (`client/AimPad.js`: pulled back from its centre and let go, it sets the catapult's aim), or dragging straight from it; its aim drawn as an arc in both views (`drawArcs`); its pile of rocks in front of it (`drawPile`); the end card; the camera (`fitting`, `cam`): a small screen zoomed in so men stay `READABLE`, panned with two fingers or the arrow keys and zoomed by pinch or wheel; an upright phone gets an overview strip of the whole field over a main view that fills the rest (`UPRIGHT_SPAN`), the scene built once (`scene`) and drawn in both. Weapons are drawn from their own strokes (`drawBlade`), never a hull fill.
- `client/Pad.js`: the drawing pad both drawing screens use (`Pad`, `offPad`, `inkStrokes`).
- `client/RockPad.js`: the rock button in the field's corner (away from its side) and the small pad a rock is drawn on mid-battle.
- `client/AimPad.js`: the aiming pad, in the middle of the screen while the catapult is picked: a slingshot pull, its edge the catapult's reach and its shaded wedge the angles it throws at, released to set its aim; a pause to hold its fire.
- `client/paint.js`: how art goes on a canvas: shapes, thumbnails, a stick man skinned onto its joints, the paper.
- `client/theme.js`: the game's look over the library's: paper for its ground, pencil for its text, a hand-drawn font, set before any view draws, so the library's own bar, dialogs and toasts wear it too.
- `client/icons.js`: every control and mark as a pencil doodle (an SVG path), for buttons (`icon`) and the battlefield's canvas (`drawIcon`).
- `client/ui.js`: the game's pieces: `doodle` buttons (paper inked round a wobbly edge), the lined page, the sound switch, counts.
- `client/sounds/`: effects and two music loops (drawing, battle), made by paude's sound service.

## The libraries, by their docs

Read these before building anything the framework or the component library might already do:

- `node_modules/@fatlard1993/web-game-framework/README.md`, then `docs/GETTING_STARTED.md`; `ui/README.md` for the lobby views and how to customize them.
- `node_modules/@vanilla-bean/components/README.md` and `docs/GETTING_STARTED.md`; every component's folder holds a `<Name>.lld.md` stating what it does and why (`components/Button/Button.lld.md`, `components/Dialog/Dialog.lld.md`, ...); the server helpers are in `app/README.md`.
- A `Component` subclass must not name a method after the library's own lifecycle (`render`, `build`, `content`, `empty`, `destroy`, ...): the constructor calls them.

## Who plays it

Anyone, including people who don't read: every control is a picture with few or no words, big enough for a thumb, and the game explains itself by being played, not by text. The pictures are the game's own pencil doodles (`client/icons.js`), never emoji: the whole page is the game's notebook, paper and pencil, in the hand-drawn font. Keep it that way as the game grows: a new thing to do is a new doodle to tap, a new thing to see is drawn, not described. The shape checks' refusals are the one place words carry the game: keep them short.

## How this project is written

- Views and controls are the library's components, styled with `styled()`. The game's colors and font are its theme (`client/theme.js`), set over the library's tokens; the battlefield and the drawings are drawn on canvas in the same paper-and-ink colors (`client/paint.js`).
- The truth of a game lives in its `Game` on the server. A page never changes what it shows on its own: it calls `act(name, data)` and draws the view that comes back, so every player sees the same thing. Never trust a player id a page sends; the action already knows its player. What's only for show (blood flying, dust) runs on each page from the events.
- A new thing a player can do is a new entry in `actions`, new state in `state`, and the screens showing it. A rule both sides need goes in `rules.js`, `art.js` or `battle.js`.
- One file per view, each small.
- A change that can be seen is checked by looking: the page reloads itself on every save.

## What makes it feel good

What players asked for over and over in the first games built this way, so start there rather than waiting to be told:

- The game takes the whole screen. The play area grows to fill everything below the top bar (the `Stage` does); the score, level and buttons that aren't part of playing live in the top bar, and the tools a player plays with sit right beside the play area.
- A press or drag that starts just outside the play area still counts, held to its edge: fingers miss. `input.pointer(stage.elem)` does it.
- On a computer, the keyboard plays it and the mouse aims; on-screen touch controls show only on touch devices. `createInput` does all of this.
- Everything that acts on the game is seen acting: a reload drains, ammo counts down, a paused battle says who it waits for.
- A player whose page closed is gone from the table (`online` is false on them, and `onPresence` hears it).
- Saved games (`data/games.json`) outlive changes to the game: when `state` changes shape, raise `version` and add a migration so a game saved the old way still loads.
- The README says what the game is and how to play it, its rules as they are now: when a rule changes, so does the README.
- Sounds and music play through `createSound`; the game's sound switch in the bar (`soundSwitch`) mutes it.
