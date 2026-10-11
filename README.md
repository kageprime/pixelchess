# Pixel Arcade

Retro arcade lobby plus pixel-art games. Static site, no build step: deploy the repo root (Vercel needs nothing else).

```
/index.html            the hub (lobby): game cards, profile chip, sound toggle
/chess/index.html      Pixel Chess (playable)
/pool/index.html       Pixel Pool 3D: 8-ball vs CPU or 2 players (playable)
/scrabble/index.html   Pixel Words: scrabble-style tiles for 2 players (playable)
/scrabble/words.txt    ENABLE word list, public domain (see WORDS-SOURCE.txt)
/shared/arcade.css     shared look: theme vars, .px / .sm / .big, scanlines
/shared/shared.js      Shared.addXP(game, n), Shared.profile(), Shared.sound, Shared.blip()
/shared/vendor/        vendored files (font, planck.js): see vendor/README.txt
/sw.js                 service worker: precaches everything for offline play
/api/scores.js         world leaderboards + ladder (Vercel serverless + Upstash)
/api/signal.js         P2P matchmaking signalling (Vercel serverless + Upstash)
```

Chess used to live at the site root. `/` is now the hub and chess is at `/chess`. Old links to `/` land on the hub, one tap from Chess.

## Adding a game

1. Put it at `/<game>/index.html` (self-contained, optional `/<game>/assets/`).
2. Link `../shared/arcade.css` and `../shared/shared.js` (relative paths, so it also works from `file://`).
3. Award XP only through `Shared.addXP('<game>', n)`. Never write your own XP.
4. Add `<game>/index.html` to `PRECACHE` in `sw.js` and bump `CACHE`.
5. In the hub, change that card from `SOON` to `PLAYABLE` (give it an `href`, drop `role`, `aria-disabled` and `tabindex`, remove the `soon` class).
6. No external CDN at runtime: vendor anything you need under `/shared/vendor/` with its licence.

## Pixel Chess

Ladder vs Mossback, Lady Vex, Old Dune and secret Nox; daily mate-in-1 puzzles with streaks; blitz clocks; post-game review with evals and blunder marks; tutor mode with verdicts and refutation previews; themes; local + world leaderboards; share cards; YouTube world music; P2P online matches. Carries the arcade profile fields (`xp`, `byGame`, `name`) through its own saves.

## Pool

8-ball on a perspective table drawn at 160x224 and scaled up (own 2D physics, no library, so there is nothing to vendor). Vs CPU (3 levels) or 2 players on one device. Wins against the CPU award hub XP through `Shared.addXP('pool', Shared.XP.win)` and are counted with `Shared.recordGame('pool', won)`; 2-player games award nothing. The XP amounts in `Shared.XP` are placeholders. Not modelled: cue-ball spin, jump or masse shots.

## Scrabble (Pixel Words)

15x15 board with standard bonus squares, 100 tiles, blanks with a letter picker, 50-point bingo, pass-and-play for 2 players on one device. The ENABLE list (`words.txt`, public domain, attribution in `WORDS-SOURCE.txt`) loads automatically and checks every word; uploading a list overrides it, and with no list words are on the honour system. Decisive games award hub XP through `Shared.addXP('scrabble', ...)` and are counted with `Shared.recordGame('scrabble', won)`. No CPU opponent yet.

## Profile

Key `pixelchess.v1`, shared by every game. Chess owns its own fields (`unlocked`, `rec`, `streak`, `bestStreak`, `games`, `total`, `theme`, `top`). The arcade adds `xp`, `byGame` and `name`. Pixel Chess ignores any save whose `v` is not 1, so `v` must stay 1 until chess is updated to read a newer version. Chess carries the arcade fields through its own saves.

## Tests

```
npm install
npx playwright install chromium
npm test
```

## Notes

```
Open index.html in a browser (or serve the repo root; the hub is index.html).
node hub-test.js      lobby: cards, links, layout at 3 sizes, profile chip, XP, sound, offline
node pool-test.js     pool: rules, physics, CPU, 3D drawing, layout, XP
node scrabble-test.js words: board, scoring, blanks, bingo, word list, swap/pass/end, XP, layout
node engine-test.js   rules (perft), SAN, CPU picks and personalities, music tables
node api-test.js      world leaderboard + signalling API (mocked store)
node smoke-test.js    phone-size browser smoke test
node ladder-test.js   ladder, unlocks, undo limit, saving (blocked storage too)
node themes-test.js   themes, profile and leaderboard screens
node layout-test.js   wide-screen layout test
```
