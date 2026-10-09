// One frame of Carom: read the input, apply it to the screen the frame began
// on, then advance the screen it left the game on (specs/ui.md, specs/balls.md).

import type { PointerSample, UpdateApi } from "@clockwyrks/simple-2d";
import { CUES, HOLD_TIME, PADDLE_SPEED, TRAIL_TIME } from "./constants";
import type { ActionName } from "./constants";
import type {
  BallState,
  CaromState,
  PendingPress,
  ReadonlyState,
  Screen,
} from "./game";
import { aiVelocity } from "./ai";
import { confirmMenu, itemAt, menuItems, moveMenu } from "./menus";
import {
  flyBall,
  matchWinner,
  noHits,
  scorer,
  serveBall,
  type Hits,
} from "./physics";
import { integratePaddle, parkedBall, returnToTitle } from "./world";

/** The press edges a frame carries, each read once. */
interface Edges {
  readonly up: boolean;
  readonly down: boolean;
  readonly confirm: boolean;
  readonly back: boolean;
  readonly pause: boolean;
  readonly mute: boolean;
}

/** The movement actions' held values, `0` or `1` each. */
interface Held {
  readonly p1Up: number;
  readonly p1Down: number;
  readonly p2Up: number;
  readonly p2Down: number;
}

const NOTHING_HELD: Held = { p1Up: 0, p1Down: 0, p2Up: 0, p2Down: 0 };

interface FrameInput {
  readonly edges: Edges;
  readonly held: Held;
  readonly samples: readonly PointerSample[];
  readonly contactIds: ReadonlySet<number>;
}

function readInput(api: UpdateApi): FrameInput {
  const pressed = (name: ActionName) => api.input.pressed(name);
  const value = (name: ActionName) => api.input.value(name);
  // Every edge is read exactly once, whichever screen is up: an edge a screen
  // does not read is dropped with the frame either way.
  const p1Up = pressed("p1-up");
  const p1Down = pressed("p1-down");
  const p2Up = pressed("p2-up");
  const p2Down = pressed("p2-down");
  return {
    edges: {
      up: p1Up || p2Up,
      down: p1Down || p2Down,
      confirm: pressed("confirm"),
      back: pressed("back"),
      pause: pressed("pause"),
      mute: pressed("mute"),
    },
    held: {
      p1Up: value("p1-up"),
      p1Down: value("p1-down"),
      p2Up: value("p2-up"),
      p2Down: value("p2-down"),
    },
    samples: api.input.pointerSamples(),
    contactIds: new Set(api.input.pointerContacts().map((c) => c.id)),
  };
}

// ---- Keyboard ------------------------------------------------------------

/** Up before down, and movement before confirm. */
function menuEdges(state: ReadonlyState, edges: Edges): CaromState {
  if (edges.up) return moveMenu(state, -1);
  if (edges.down) return moveMenu(state, 1);
  if (edges.confirm) return confirmMenu(state);
  return { ...state };
}

function applyKeyboard(state: ReadonlyState, edges: Edges): CaromState {
  switch (state.screen) {
    case "title":
      return menuEdges(state, edges);
    case "howto":
      if (edges.confirm || edges.back) return returnToTitle(state);
      return { ...state };
    case "countdown":
    case "playing":
      if (edges.pause) {
        return {
          ...state,
          resumeScreen: state.screen,
          screen: "paused",
          menuIndex: 0,
        };
      }
      return { ...state };
    case "paused":
      if (edges.pause || edges.back) {
        return { ...state, screen: state.resumeScreen };
      }
      return menuEdges(state, edges);
    case "matchover":
      if (edges.back) return returnToTitle(state);
      return menuEdges(state, edges);
  }
}

// ---- Pointer and touch ---------------------------------------------------

/**
 * Applies a menu screen's pointer samples in arrival order. A sample on an item
 * selects it; a lift whose landing fell inside the same item confirms it. A
 * confirm that leaves the screen ends the read, since the screen reached takes
 * its first input on the next update.
 */
function applyPointer(
  state: CaromState,
  samples: readonly PointerSample[],
  contactIds: ReadonlySet<number>,
): CaromState {
  const screen: Screen = state.screen;
  let next = state;
  let presses: readonly PendingPress[] = state.presses;

  for (const sample of samples) {
    if (next.screen !== screen) break;
    const item = itemAt(screen, sample.x, sample.y);
    if (sample.type === "move") {
      if (item !== null) next = { ...next, menuIndex: item };
      continue;
    }
    if (sample.button !== "primary") continue;
    if (sample.type === "down") {
      presses = [
        ...presses.filter((p) => p.id !== sample.id),
        { id: sample.id, screen, item },
      ];
      if (item !== null) next = { ...next, menuIndex: item };
      continue;
    }
    const landing = presses.find((p) => p.id === sample.id);
    presses = presses.filter((p) => p.id !== sample.id);
    const confirms =
      landing !== undefined &&
      landing.screen === screen &&
      landing.item !== null &&
      landing.item === item;
    if (confirms && item !== null) {
      next = confirmMenu({ ...next, menuIndex: item });
    }
  }

  // A press whose contact has gone is a press whose lift was never a menu's to
  // read, so it is forgotten rather than kept against a later lift.
  presses = presses.filter((p) => contactIds.has(p.id));
  return { ...next, presses };
}

// ---- Advancing a match ---------------------------------------------------

function humanAxis(up: number, down: number): number {
  return (down > 0 ? 1 : 0) - (up > 0 ? 1 : 0);
}

function movePaddles(
  state: CaromState,
  held: Held,
  dt: number,
): CaromState["paddles"] {
  const { left, right } = state.paddles;
  const solo = state.mode === "solo";

  const leftAxis = solo
    ? humanAxis(
        Math.max(held.p1Up, held.p2Up),
        Math.max(held.p1Down, held.p2Down),
      )
    : humanAxis(held.p1Up, held.p1Down);
  const leftVy = left.driven ? left.drivenVy : leftAxis * PADDLE_SPEED;

  let rightVy: number;
  if (right.driven) rightVy = right.drivenVy;
  else if (solo) rightVy = aiVelocity(state, dt);
  else rightVy = humanAxis(held.p2Up, held.p2Down) * PADDLE_SPEED;

  return {
    left: integratePaddle(left, leftVy, dt),
    right: integratePaddle(right, rightVy, dt),
  };
}

/** The ball's trail with this frame's sample appended and the stale ones gone. */
function sampleTrail(ball: BallState, simTime: number): BallState {
  const kept = ball.trail.filter((s) => simTime - s.t <= TRAIL_TIME);
  return { ...ball, trail: [...kept, { x: ball.x, y: ball.y, t: simTime }] };
}

/** The countdown: the hold ticks down, and an elapsed hold serves the ball. */
function advanceCountdown(state: CaromState, dt: number): CaromState {
  if (state.ball === null) return state;
  const holdTimer = state.ball.holdTimer - dt;
  if (holdTimer > 0) {
    return { ...state, ball: { ...state.ball, holdTimer } };
  }
  return {
    ...state,
    screen: "playing",
    ball: serveBall(state.ball, state.receiver),
  };
}

/** A playing frame: the ball flies, collides, and may score. */
function advancePlaying(state: CaromState, dt: number, hits: Hits): CaromState {
  if (state.ball === null || state.ball.held) return state;
  const ball = flyBall(state.ball, dt, state.paddles, state.obstacles, hits);
  const side = scorer(ball);
  if (side === null) return { ...state, ball };

  hits.score = true;
  const score =
    side === "left"
      ? { p1: state.score.p1 + 1, p2: state.score.p2 }
      : { p1: state.score.p1, p2: state.score.p2 + 1 };
  const winner = matchWinner(score);
  if (winner !== null) {
    return { ...state, ball, score, winner, screen: "matchover", menuIndex: 0 };
  }
  return {
    ...state,
    score,
    ball: { ...parkedBall(), holdTimer: HOLD_TIME },
    receiver: side === "left" ? "right" : "left",
    screen: "countdown",
  };
}

function advanceMatch(
  state: CaromState,
  dt: number,
  held: Held,
  hits: Hits,
): CaromState {
  const moved: CaromState = { ...state, paddles: movePaddles(state, held, dt) };
  const advanced =
    moved.screen === "countdown"
      ? advanceCountdown(moved, dt)
      : advancePlaying(moved, dt, hits);
  if (advanced.ball === null) return advanced;
  return { ...advanced, ball: sampleTrail(advanced.ball, advanced.simTime) };
}

// ---- The frame -----------------------------------------------------------

function playCues(api: UpdateApi, hits: Hits): void {
  if (hits.paddle) api.audio.play(CUES.paddleHit);
  if (hits.wall) api.audio.play(CUES.wallBounce);
  if (hits.obstacle) api.audio.play(CUES.obstacleBounce);
  if (hits.score) api.audio.play(CUES.score);
}

export function updateGame(
  state: ReadonlyState,
  api: UpdateApi,
  dt: number,
): CaromState {
  const input = readInput(api);

  // The mute bit is the runtime's. A pose may have written the game's copy
  // since the last frame, in which case the runtime is brought to it; then the
  // `mute` action toggles it; then the copy mirrors the bit.
  if (state.muted !== api.audio.muted()) api.audio.setMuted(state.muted);
  if (input.edges.mute) api.audio.setMuted(!api.audio.muted());

  const ticked: CaromState = { ...state, simTime: state.simTime + dt };
  let next = applyKeyboard(ticked, input.edges);
  const menu = menuItems(state.screen) !== null;
  if (menu && next.screen === state.screen) {
    next = applyPointer(next, input.samples, input.contactIds);
  } else {
    next = {
      ...next,
      presses: next.presses.filter((p) => input.contactIds.has(p.id)),
    };
  }

  const hits = noHits();
  if (next.screen === "countdown" || next.screen === "playing") {
    // A screen reached this frame takes its first input on the next one, so
    // the movement actions move nothing on the frame a menu left for the field.
    const held = next.screen === state.screen ? input.held : NOTHING_HELD;
    next = advanceMatch(next, dt, held, hits);
  }
  playCues(api, hits);

  return { ...next, muted: api.audio.muted() };
}
