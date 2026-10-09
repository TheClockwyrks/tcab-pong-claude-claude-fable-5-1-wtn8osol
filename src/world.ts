// State construction and the small transitions every screen shares: parking the
// ball, resting the paddles, starting a match, and returning to the title.

import {
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
} from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
  ReadonlyState,
} from "./game";

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** A fresh serve sign, `1` and `-1` each equally likely. */
export function drawServeSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

/** The ball parked at its home point, waiting out a full hold. */
export function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

export function restingPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (center === undefined) {
    throw new RangeError(
      `Carom: no obstacle has index ${index}; the obstacles are 0 and 1`,
    );
  }
  return { index, cx: center.x, cy: center.y };
}

export function allObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

/** The whole state at the title screen (specs/state.md). */
export function titleState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: allObstacles(),
    simTime: 0,
    muted,
    presses: [],
  };
}

/**
 * Starts a match in `mode` (specs/ui.md, "Starting a match"). The paddles keep
 * their driven flags and the AI keeps its faculties: neither is match state.
 */
export function startMatch(state: ReadonlyState, mode: Mode): CaromState {
  return {
    ...state,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...state.paddles.left, cy: FIELD_CY, vy: 0 },
      right: { ...state.paddles.right, cy: FIELD_CY, vy: 0 },
    },
    presses: [],
  };
}

/**
 * Returns to the title (specs/ui.md, "Returning to the title"): every declared
 * field takes its title-screen value except `titleIndex`, `simTime`, and
 * `muted`, and `menuIndex` is restored from `titleIndex`.
 */
export function returnToTitle(state: ReadonlyState): CaromState {
  return {
    ...titleState(state.muted),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}

/**
 * Moves a paddle at `vy` for `dt` seconds, the one integration every mover
 * shares (specs/playfield.md). A paddle the clamp stopped carries the velocity
 * it actually travelled at, so one pinned against a bound reads `vy = 0`.
 */
export function integratePaddle(
  paddle: PaddleState,
  vy: number,
  dt: number,
): PaddleState {
  const free = paddle.cy + vy * dt;
  const next = clamp(free, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actualVy = next !== free && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}
