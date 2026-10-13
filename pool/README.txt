PIXEL POOL
==========
Open index.html in any modern browser (needs WebGL). No install or server needed.
Fonts load from Google Fonts when online; the game falls back to a monospace font offline.

Controls
  Aim     drag on the table, or arrow keys (Shift = fine)
  Power   drag the power bar, or hold SPACE and release to shoot
  Spin    tap the cue-ball pad (double tap to reset)
  View    V or the camera button (3D / cue / top)
  Music   M     Menu  Esc

Tweak the look in src/game.js:
  resize():   the "/ 600" divisor sets pixel size (smaller number = chunkier pixels)
  E.levels:   colours per channel in the dither pass (lower = more retro)
src/ holds the editable parts: head.html (UI + CSS), engine.js (mini WebGL renderer), game.js (game).
