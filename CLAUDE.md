# stick-wars

A web game on `@fatlard1993/web-game-framework` and `@vanilla-bean/components`: a war of drawn armies, or a duel of two drawn gladiators. One Bun server (`server.js`) serves the page and holds every game's state; each player's page draws that state and sends what its player does. Anyone with the address can open the lobby, make a game, and join one from their phone.

## Running it

- `bun run dev`: the server at http://localhost:3000 (or `PORT`), rebuilding the page and reloading open browsers as files change. Under paude it's already running as the project's `dev` task and its page is shared: don't start a second one.
- `bun run build` then `bun start`: production (the house runs it as `bun-server@stick-wars`, its port from the mother hub).
- **Every restart of the house's copy drops every player's connection** ("Connection lost" on every phone). It serves the page's build from disk on each request, so a change to the page needs only `bun run build`, never a restart; restart it only for a change to the server, once, at the end of the work. Check things in a browser against a throwaway copy (its own folder, `data/` and port), never the house's.
- `bun test`: the rules, actions, battles and stores, without a browser. `test-setup.js` (preloaded by `bunfig.toml`) marks every run a test, so the shared stores stay in memory and never touch `data/`.

## Rules of the house

- **Who plays it**: anyone, including people who don't read. Every control is a picture with few or no words, big enough for a thumb, and the game explains itself by being played. The pictures are the game's own pencil doodles (`client/icons.js`), never emoji: the whole page is the game's notebook, paper and pencil, in the hand-drawn font. A new thing to do is a new doodle to tap; a new thing to see is drawn, not described. The shape checks' refusals are the one place words carry the game: keep them short.
- **The server holds the truth.** A page never changes what it shows on its own: it calls `act(name, data)` and draws the view that comes back, so every player sees the same thing. Never trust a player id a page sends; the action already knows its player. What's only for show (blood flying, dust, the crowd) runs on each page from the events.
- **A new thing a player can do** is a new entry in `actions`, new state in `state`, and the screens showing it. A rule both sides need goes in `rules.js`, `art.js` or `field.js`. The page imports `field.js`, never `battle.js` (it would bundle the physics engine).
- **Views** are the library's components, styled with `styled()`, one file per view. The colors and font are the theme (`client/theme.js`); the battlefield and drawings are drawn on canvas in the same paper-and-ink colors (`client/paint.js`). A `Component` subclass must not name a method after the library's lifecycle (`render`, `build`, `content`, `empty`, `destroy`, ...): the constructor calls them.
- **Saves outlive changes**: when `state` changes shape, raise `Game.version` and add a migration. The stores in `data/` (below) keep art in today's shape with no version yet: a change to the shape of art or rigs needs a migration for them too.
- **The README** says what the game is and how to play it, its rules as they are now: when a rule changes, so does the README, in the same commit. Its first paragraph is the game's card in the house: keep `client/manifest.json`'s and `client/index.html`'s descriptions the same words.
- **Feel**: the game takes the whole screen (the `Stage` grows below the bar; the tools sit beside the play area); a press just outside the play area still counts (`input.pointer(stage.elem)`); the keyboard plays it on a computer, touch controls show only on touch devices (`createInput`); everything acting on the game is seen acting (a reload drains, rocks count down, a paused battle shows who it waits for); a player whose page closed is gone from the table (`onPresence`); sounds play through `createSound`, muted by the bar's `soundSwitch`; the screen stays on while a game's open (`client/awake.js`: the wake lock on a secure page, a silent looping video on the house's plain address, from the first tap).
- **A change that can be seen is checked by looking**: the page reloads itself on every save. The suite tests the server; nothing tests the page, so look at both a war and a duel after touching `client/BattleScreen.js`.

## Words in the code

- **Art kinds**: `stickmen`, `stones`, `beams`, `ammo` (rocks), `swords` (weapons, any shape), `wheels` (the catapult's: drawn in the time saved, `banked`; without them it doesn't roll), `armor`, `shield`. These names are in saved data: rename only with a migration.
- **Art ref**: `{ k: kind, a: whose art, i: which }`, how the battle and snapshots point at a drawing.
- **Style**: a game is a `war` or a `gladiator` fight (`state.style`). On a Stickman, `style` is a gladiator's fighting profile, and its presence is how the battle tells a gladiator.
- **Orders**: `idle` (home, the tent doodle), `crew`, `repair`, `hold`, `charge`. **Stances** (a gladiator's shouts): `charge`, `back` (back off), `guard` (shield up).
- **Shelf**: a voted store of drawings (`shelf.js`): the armory (weapons) and the crowd (stick men). **Hall**: winning gladiators (`roster.js`); `fame`, `rival` and a champion are a hall entry's id.

## Data and routes

- `data/games.json`: the framework's saved games (versioned, migrated by `Game.migrations`).
- `data/gladiators.json`: the hall. `data/weapons.json`: the armory. `data/crowd.json`: the crowd. Each a `Store` (`store.js`), written a second after a change and on shutdown, and read again when another server (the house's, a preview) has written it; stocked once, the first time, from drawings made before it (`stockOnce` in `server.js`).
- Routes beside the framework's (`server.js`): `GET /hall`; `GET /fallen` (champions given the thumbs down, `fallenAt` on their hall entry); `GET /armory` and `GET /crowd` (`?sort=loved|hated|controversial|deadliest&voter=&take=`); `POST /armory/:id/vote` and `POST /crowd/:id/vote` with `{ voter, thumb }` (a small body only). The voter id is the browser's own: there are no accounts, so votes are a show of hands, not a ballot.

## Where things are

Shared by the server and the page:

- `rules.js`: the drawing pages and their clocks per style (`STEPS`, `GLADIATOR_STEPS`, `stepsOf`), the sides and modes, a new game's `state`, the bonus for drawing more (`armySize`, `wallSize`) and the computer's sizes (`CPU_SIZE`).
- `art.js`: geometry; the shape checks (`judge(kind, strokes, context)`, which cleans and caps what a page sent: `MOST_POINTS`, `MOST_INK`); how beefy its limbs are drawn (`beefOf`: ink against limb length); a stick man's skeleton (`buildRig`, each point bound to a bone as `{ b, u, v }`, its page position in `rig.raw`); weapon stats from shape (`weaponStats`); gladiator gear (`checkArmor`, `checkShield`); telling drawings apart (`freshOf`, `samePose`, `sameWeapon`: a weapon by look and handling, `unlike`); the computer's war weapons and the defaults for the armory (`cpuWeapons`, `stockWeapons`); the defaults; the computer's art (`cpuArmy`, `cpuGladiator`, drawn by a shaky hand, `scrawl`).
- `field.js`: the field's geometry: size, where things stand (`homeOf`, `CAT_X`, `WALL_X`, `ARENA_GATE`), depth and its drawing (`DEPTH`, `project`), the catapult's shape, a throw's path and limits (`flingPath`, `holdFling`, `flingFor`, `reachOf`, `rockThrow`).

On the server:

- `server.js`: the framework's `Server`, the routes above, and the stores' first stocking.
- `Game.js`: one running game. `state` holds the mode, style, `fame`, phase (`draw`, `battle`, `over`), seats, each side's art and drawing clock, and the last result; the `World` is never saved (a restart mid-battle fights again with the same art; a game over stays over, `showEnded`). `actions`: keep, sketch (the page as it's drawn, passed on by `broadcast('sketch')` for the waiting to watch, never kept), borrow, roll (our catapult, `rollCat`, between home and halfway, `catRange`), enlist (a hall gladiator as yours, its gear with it, its weapon still to choose), next, start (a tournament), rock, order, aim, shout, again, redraw. The loop steps the battle and publishes every `TICK_MS`, and leaves a finished one still after it settles; art goes to pages on their first view and by `broadcast('art')` when it changes. `honour` settles a duel in the hall; `armoryAfter` counts a battle's weapons, each by its armory entry (`match`: a copy is the entry it copies).
- `battle.js`: the battle (`World`). It never draws: pages draw `snapshot()`, and blood, dust, sounds, shakes and the crowd go out as `takeEvents()`.
  - Bodies: stick men on 11-joint skeletons, kinematic alive, verlet ragdolls dead or cut; each at `x` along the field and `z` across it; blades reach within a `LANE` of depth.
  - War: each side's army at home behind its wall, taking orders (`command`); a catapult of drawn beams throwing its side's drawn rocks (`rocks`, `addRock`) at a player's `aim` while crewed, mended by repairers; the computer playing a plan (`PLANS`).
  - Fading: the dead, props and loose stones lie `LINGER`, fade over `FADE`, then go.
  - Arena (`arena`): one gladiator a side (`gladiate`: gear, speed from legs, reach from arms, paid in `maxHp`, `limbFrailty` and a slower swing); blows slipped or blocked (`fends`), armor's share (`takeHit`); shouts (`shout`, `STANCES`, `fury`); the crowd (`crowd`). No blow kills: beaten past `YIELD_AT` he yields (`yieldBy`), the medics fetch his limbs and slap them on (`medicPlans`, `medicsWork`, `attach`, `mend`), and after `MERCY_WAIT` the crowd judges (`judgeYielded`): spared, or drawn and quartered.
- `masonry.js`: the walls as stones in a planck rigid-body world, each outline pushed most of the way to its box so walls stack, settled then asleep; boulders among them; harm from contact impulses, toughness from a stone's shape; rubble; a height map (men stand on the enemy's stones and walk through their own); hacking and repair.
- `names.js`: earned names, made from what a gladiator or weapon is (`gladiatorName`, `weaponName`), after `NAMED_AT_WINS` wins or `NAMED_AT_KILLS` kills; nothing stored, the same drawing always the same name. The hall's listing, the armory's (`named`) and a game's view of its sides (`fame`) carry them.
- `tournament.js`: a tournament's bookkeeping: entrants (`newEntrant`, each with its own art and clock), the bracket (`newBracket`, `currentPair`, `advance`). `Game.js` runs it: entrants draw through `sideOf`, the first player's `start`, each duel's pair put into the seats (`nextDuel`) and moved on after its end card (`duelDone`), walkovers for the gone (`leaveTournament`).
- `store.js`: a list kept in a JSON file. `roster.js` (the hall: records, `pick`, `record`, `standings`) and `shelf.js` (`offer`, `lend`, `vote`, `fought`, `listing`, sorted by `SORTS`) are stores.
- `Game.test.js`: the suite.

The page (`client/`):

- `index.js`: routes: `Start`, `Play`, watch, the hall, armory and crowd (`#/hall`, `#/armory`, `#/crowd`: tabs of one page), `JoinNow` (an invite's code: seated at once), `#/tv` and `#/tv/:gameId` (`Tv.js`), and the framework's lobby at `#/hub`.
- `GamesOn.js`: the start page's list of the games on now, as pictures; tapped, back in, joined (a free side) or watched.
- `Start.js`: war or gladiators (remembered), then a mode, the games on now (`GamesOn`), and under them the tabbed page of what's been made and the TV. A mode: back into a game you're in, a two-player game with a free side, or a new one (`sitDown`).
- `Play.js`: `enterGame`, the bar, sound and music, and which screen shows for the phase; leaving asks first (`LeavePrompt.js`).
- `DrawScreen.js`: a drawing page on a `Pad` (`Pad.js`: measures the pen against itself, lifts it off the page or a weapon's box, `WEAPON_AREA`), the dashed example (or the warrior under armor and shield), the clock, keeping, the gallery (copies faded), and `BorrowPicker.js` on a weapon page.
- `BattleScreen.js`: the battle on a `Stage`, drawn back to front through the depth (`atDepth`, `scene`), snapshots eased between ticks. War: picking and ordering men, the catapult (`AimPad.js` to aim it, its arc `drawArcs`, its pile `drawPile`), `RockPad.js` for rocks mid-battle. Arena: `arenaBackground` (in `paint.js`) with its crowd drawn live (`seatCrowd`, `drawCrowd`), medics (`drawMedic`), the verdict (`drawMercy`), the shouts (`armShouts`). The camera (`fitting`, `cam`): zoomed so men stay `READABLE`, panned and pinched, an overview strip on an upright phone, following the fighters in the arena. The end card.
- `Bracket.js`: a tournament's bracket, drawn, for the end card (and pinned on a TV).
- `Tv.js`, `tvPick.js`: the TV: a watcher's `Play` with `tv` set (bigger, the join code while there's room, the bracket pinned), following the game `pickGame` chooses (a tournament first, then a battle, then a drawing).
- `Shelves.js`: one page, a tab each in the bar for the hall (`Hall.js`, `HallList`), the armory and the crowd (`Armory.js`, `ShelfList`, the same list for both shelves), scrolling in the framework's `Body`; `armoryPicks.js` fetches the shelves and votes. `BorrowPicker.js` (the armory's weapons, on a weapon page) and `HallPicker.js` (the hall's gladiators, on a warrior page) are the same overlay.
- `paint.js` (art on canvas: shapes, thumbnails, a skinned stick man, the paper and the arena), `theme.js` (the look over the library's, set before any view draws), `icons.js` (every doodle, for buttons and canvas), `ui.js` (doodle buttons, the lined page, the sound switch, counts), `sounds/` (effects and two music loops, made by paude's sound service).

## The libraries, by their docs

Read these before building anything the framework or the component library might already do:

- `node_modules/@fatlard1993/web-game-framework/README.md`, then `docs/GETTING_STARTED.md`; `ui/README.md` for the lobby views and how to customize them.
- `node_modules/@vanilla-bean/components/README.md` and `docs/GETTING_STARTED.md`; every component's folder holds a `<Name>.lld.md` stating what it does and why (`components/Button/Button.lld.md`, `components/Dialog/Dialog.lld.md`, ...); the server helpers are in `app/README.md`.
