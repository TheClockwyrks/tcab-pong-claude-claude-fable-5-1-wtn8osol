# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off the
top and bottom walls, and off a pair of glowing posts in mid-field. A player
scores when the ball passes the far edge behind their opponent's paddle. First
to 11 wins, by a margin of two.

Carom's defining mechanic is spin: the motion of a paddle at the moment it
strikes the ball curves the ball's flight afterward. The posts turn the open
field into a bank-shot puzzle.

Play Solo against an AI opponent, or Versus with a friend on the same keyboard.
Everything is drawn in code on a single canvas; there are no art or audio files,
no backend, and nothing fetched at runtime.

## Install

Carom is a TypeScript project built with [Vite](https://vite.dev). It needs
Node.js 20 or later.

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Vite prints a local URL (by default `http://localhost:5173`). Open it in a
browser; edits under `src/` reload live.

## Build for production

```sh
npm run build
```

This type-checks the project and emits a self-contained static site into
`dist/`, with `index.html` at its root. Serve that directory from any static
file server, or preview it locally with:

```sh
npm run preview
```

## Controls

| Action                 | Keys                                         |
| ---------------------- | -------------------------------------------- |
| Player one (left) up   | `W`                                          |
| Player one (left) down | `S`                                          |
| Player two (right) up  | `↑`                                          |
| Player two (right) down| `↓`                                          |
| Confirm a menu item    | `Enter`, `Space`                             |
| Back                   | `Esc`                                        |
| Pause / resume         | `P`, `Esc`                                   |
| Mute / unmute          | `M`                                          |
| Debug overlay          | `` ` `` (backtick)                           |

In Solo, both sets of movement keys move your paddle on the left; the AI holds
the right. In Versus, each set moves its own paddle. The menus also take the
mouse and touch: move over an item to highlight it, click or tap to confirm.
On a touchscreen the engine draws a slider along each edge of the field for the
paddles.

## How a match plays

- The ball waits at the center for a second, then serves toward the player who
  was last scored on (player one at the start).
- Every paddle hit adds a little speed, up to a cap. Where the ball meets the
  paddle sets its outgoing angle: the center sends it straight, the ends send it
  steeply.
- A paddle moving at contact puts spin on the ball, bending its flight. Spin
  fades by half every 0.8 seconds and survives wall and post bounces.
- The posts bounce the ball without changing its speed or spin.

## Project layout

| Path                     | Holds                                                   |
| ------------------------ | ------------------------------------------------------- |
| `src/game.ts`            | The state and debug-surface types and the `Game` object |
| `src/update.ts`          | One frame: input, menus, paddles, the ball, scoring     |
| `src/physics.ts`         | Sub-stepped flight, spin, collisions, serve, win rule   |
| `src/ai.ts`              | The Solo opponent                                       |
| `src/menus.ts`           | Menu items, hit regions, and what confirming does       |
| `src/debug.ts`           | The debug and automation surface                        |
| `src/render.ts`          | Everything drawn on the canvas                          |
| `src/constants.ts`       | Every figure the specification fixes                    |
| `src/testing/harness.ts` | A Node test harness over a native canvas                |
| `specs/`                 | The specification the build follows                     |
| `engine/`                | The Simple 2D engine's documentation                    |
| `showcase/`              | The store-page description, carousel, and media         |

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run format      # prettier --check
npm test            # vitest, with coverage over src/
```

The tests stand the engine up over a native canvas and a constant clock, drive
the game through its registered actions, synthetic pointer events, and the
debug surface, and advance it a counted number of frames, so they need no
browser.
