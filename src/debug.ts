// The debug and automation surface (specs/instrumentation.md). Every pose takes
// the current state and returns the next; every reading returns what it read.
// A call with nothing to act on throws rather than refusing quietly.

import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  Mode,
  PaddleState,
  ReadonlyState,
  Screen,
  Side,
} from "./game";
import { menuItemRect } from "./menus";
import { speedOf } from "./physics";
import { drawServeSign, obstacleAt, parkedBall, titleState } from "./world";

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];
const MODES: readonly Mode[] = ["solo", "versus"];
const SIDES: readonly Side[] = ["left", "right"];
const RESUME_SCREENS: readonly ("countdown" | "playing")[] = [
  "countdown",
  "playing",
];

function oneOf<T>(allowed: readonly T[], value: unknown, what: string): T {
  if (!allowed.includes(value as T)) {
    throw new RangeError(
      `Carom debug: ${what} must be one of ${allowed.join(", ")}, got ${String(value)}`,
    );
  }
  return value as T;
}

function finite(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RangeError(
      `Carom debug: ${what} must be a finite number, got ${String(value)}`,
    );
  }
  return value;
}

function index(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new RangeError(
      `Carom debug: ${what} must be a non-negative integer, got ${String(value)}`,
    );
  }
  return value;
}

function flag(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `Carom debug: ${what} must be a boolean, got ${String(value)}`,
    );
  }
  return value;
}

function requireBall(state: ReadonlyState): BallState {
  if (state.ball === null) {
    throw new Error("Carom debug: there is no ball on the field to pose");
  }
  return state.ball;
}

function withBall(state: ReadonlyState, patch: Partial<BallState>): CaromState {
  return { ...state, ball: { ...requireBall(state), ...patch } };
}

function withPaddle(
  state: ReadonlyState,
  side: Side,
  patch: Partial<PaddleState>,
): CaromState {
  const which = oneOf(SIDES, side, "side");
  return {
    ...state,
    paddles: {
      ...state.paddles,
      [which]: { ...state.paddles[which], ...patch },
    },
  };
}

function snapshot(state: ReadonlyState): CaromSnapshot {
  const { ball } = state;
  const paddle = (p: PaddleState) => ({
    cy: p.cy,
    vy: p.vy,
    drivenVy: p.drivenVy,
    driven: p.driven,
  });
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: paddle(state.paddles.left),
      right: paddle(state.paddles.right),
    },
    ai: { tracking: state.ai.tracking, movement: state.ai.movement },
    receiver: state.receiver,
    ball:
      ball === null
        ? null
        : {
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            speed: speedOf(ball),
            spin: ball.spin,
            held: ball.held,
            holdTimer: ball.holdTimer,
            serveSign: ball.serveSign,
            trail: ball.trail.map((s) => ({ x: s.x, y: s.y, t: s.t })),
          },
    obstacles: state.obstacles.map((o) => ({
      index: o.index,
      cx: o.cx,
      cy: o.cy,
    })),
    simTime: state.simTime,
  };
}

export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),
    spawnBall: (s) => ({ ...s, ball: parkedBall() }),
    spawnObstacle: (s, which) => {
      const obstacle = obstacleAt(index(which, "obstacle index"));
      const others = s.obstacles.filter((o) => o.index !== obstacle.index);
      return {
        ...s,
        obstacles: [...others, obstacle].sort((a, b) => a.index - b.index),
      };
    },
    reset: (s) => titleState(s.muted),
    // Every reading is worked out at the read, so there is nothing to bring
    // into agreement: the state comes back equal to the one handed over.
    reconcile: (s) => ({ ...s }),

    setScreen: (s, screen) => ({
      ...s,
      screen: oneOf(SCREENS, screen, "screen"),
    }),
    setMode: (s, mode) => ({ ...s, mode: oneOf(MODES, mode, "mode") }),
    setMenuIndex: (s, i) => ({ ...s, menuIndex: index(i, "menu index") }),
    setTitleIndex: (s, i) => ({ ...s, titleIndex: index(i, "title index") }),
    setResumeScreen: (s, screen) => ({
      ...s,
      resumeScreen: oneOf(RESUME_SCREENS, screen, "resume screen"),
    }),

    setScore: (s, p1, p2) => ({
      ...s,
      score: { p1: finite(p1, "p1"), p2: finite(p2, "p2") },
    }),
    setWinner: (s, side) => ({
      ...s,
      winner: side === null ? null : oneOf(SIDES, side, "winner"),
    }),
    setReceiver: (s, side) => ({
      ...s,
      receiver: oneOf(SIDES, side, "receiver"),
    }),

    setPaddleCy: (s, side, cy) => withPaddle(s, side, { cy: finite(cy, "cy") }),
    setPaddleVy: (s, side, vy) =>
      withPaddle(s, side, { drivenVy: finite(vy, "vy") }),
    setPaddleDriven: (s, side, driven) =>
      withPaddle(s, side, { driven: flag(driven, "driven") }),

    setBallPosition: (s, x, y) =>
      withBall(s, { x: finite(x, "x"), y: finite(y, "y") }),
    setBallVelocity: (s, vx, vy) =>
      withBall(s, { vx: finite(vx, "vx"), vy: finite(vy, "vy") }),
    setBallSpin: (s, spin) => withBall(s, { spin: finite(spin, "spin") }),
    setBallHeld: (s, held) => withBall(s, { held: flag(held, "held") }),
    setBallHoldTimer: (s, seconds) =>
      withBall(s, { holdTimer: finite(seconds, "hold timer") }),
    setBallServeSign: (s, sign) =>
      withBall(s, { serveSign: oneOf([1, -1] as const, sign, "serve sign") }),
    drawBallServeSign: (s) => withBall(s, { serveSign: drawServeSign() }),

    setAiTracking: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, tracking: flag(enabled, "tracking") },
    }),
    setAiMovement: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, movement: flag(enabled, "movement") },
    }),

    setMuted: (s, muted) => ({ ...s, muted: flag(muted, "muted") }),

    snapshot,
    menuItemRect: (s, i) =>
      Number.isInteger(i) ? menuItemRect(s.screen, i) : null,
  };
}
