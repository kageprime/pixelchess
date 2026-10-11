Pixel Chess

Open pixel-chess.html in a browser.
node engine-test.js   rules (perft), SAN, CPU picks and personalities, music tables
node smoke-test.js    phone-size browser smoke test
node ladder-test.js   ladder, unlocks, undo limit, saving (blocked storage too)
node themes-test.js   themes, profile and leaderboard screens
node layout-test.js   wide-screen layout test (needs: npm i playwright && npx playwright install chromium)
AUDIO-CHECKLIST.txt   what to listen for on a real device

Phase 0: event bus, history, SAN, undo, hint, trays, move ribbon
Phase 1: opponents (Mossback, Lady Vex, Old Dune) with portraits, speech bubbles, CPU personalities
Phase 2: scenes (garden, castle hall, desert) with day-to-night sky, particles and board colours
Phase 3: wide-screen split layout (board left, info panel right), scene music, tension layer, ambience, per-world move sounds
Phase 4: living pieces (breathing, knight blinks, trembling when in danger, victory hop after big captures, zoom-in checkmate with the king toppling)
Phase 5a/5b: saved profile (browser storage, safe when blocked), ladder (beat Mossback -> Lady Vex -> Old Dune), exhibition mode for locked opponents, 3 undos per ladder game, win streaks, best results, every finished ladder game stored with its full move list (ready for leaderboards)
Phase 5c/5d: themes (4 boards, 3 piece sets, unlocked by beating opponents or win streaks, picked under THEMES on the title screen, applied over scene colours), local leaderboards under PROFILE (best streaks, fastest wins of 10+ moves, fewest moves to mate, records), top 5 per list saved on the device
