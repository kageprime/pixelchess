# Pixel Arcade menu design contract

Taste, written down so every screen in every game obeys it. Distilled from:
Pixeli UI rules (pixel kit discipline), abratabia menu patterns (numbers),
the game-ui-ux skill (architecture), Levrault's pixel menu template (feature
checklist), and our own Naija Bus Runners + brainstorming guides (flavour).

## 1. One kit, one language

- Panels, buttons, badges and icons share outline weight, corner shape
  (square — never rounded), light direction (top-left) and one accent per
  screen. Frames stay neutral so text and state carry the colour.
- Text on UI gets a shadow or outline plus 3+ value steps of contrast
  with its panel. Headings Press Start 2P; body copyable at same.
- Icons: one focal feature, authored at native size, scaled by integers
  only. Disabled = desaturated, never a different shape.

## 2. Structure

- 3–5 options per menu, never deeper than 3 levels, every action reachable
  in ≤3 clicks. One primary CTA per screen; secondary actions in a row.
- Screens are a stack (push/pop/replace), never flag soup: opening a screen
  focuses its primary action; closing returns focus where it was; a modal
  traps focus until resolved.
- Every screen answers in 3 seconds: where am I, what can I do, how do I
  go back. Footer hint bar on menu screens (`↑↓ SELECT · ENTER CONFIRM`).

## 3. Input

- Semantic actions, not keys: navigate / confirm / back work identically
  from keyboard, pointer and touch. Arrows move focus, Enter/Space confirms,
  Escape goes back. Focus highlight is unmistakable (accent outline, not a
  tint). Mouse hover never steals keyboard focus.
- Touch targets ≥44px. Press feedback fires on pointerdown, not click.
- No time-limited menu interactions; no input during transitions.

## 4. Motion and sound

- Transitions 150–300ms (pause screens faster): one pattern per
  relationship — slide for hierarchy, fade for context switches. All motion
  off under `prefers-reduced-motion`.
- Sounds: tick (focus move), confirm (blip), back (low blip), error
  (buzz). 50–200ms each, quiet, through the shared sound toggle. Never
  overlap confirmations.
- Micro-animation only as communication: press shifts 1px down-right,
  toggles snap, success flashes once. Nothing loops except a single
  "press start" blink.

## 5. Value and restraint (anti-slop)

- 70% shadow/neutral, 20% local material, 10% accent maximum per screen.
- State by shape + colour, never colour alone (lock icons, badges, text).
- No gradient soup, no glow except the single lit-cabinet marquee, no
  generated-looking ornament. If an element doesn't serve navigation or
  state, remove it.

## 6. Acceptance (every menu ships with this)

- Keyboard-only walkthrough passes; focus always visible; footer hints
  present; no console errors; layout holds at 360×640, 740×360, 1280×800;
  reduced-motion kills all animation; 44px targets verified in tests.
