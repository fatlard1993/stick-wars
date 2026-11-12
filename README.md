# Stick Men Wars

Draw your own army of stick men, stones, catapults and weapons, then watch them hack each other to bits. Play the computer or a friend.

Built on [web-game-framework](https://github.com/fatlard1993/web-game-framework) and [@vanilla-bean/components](https://github.com/fatlard1993/vanilla-bean-components).

```sh
bun install
bun run dev
```

Then open http://localhost:3000, make a game, and join it from any device on the network.

- `rules.js` is what the game is, shared by the server and the page; `Game.js` runs it: its loop, what players can do, what each page is sent.
- `client/` is the page: the start screen, `Play.js` for the game, and the framework's lobby at `#/hub`.
- `data/games.json` holds the games between restarts.
