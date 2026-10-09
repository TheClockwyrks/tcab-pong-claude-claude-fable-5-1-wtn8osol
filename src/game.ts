// Carom — the game.
//
// This module declares the state the whole game is written against, the debug
// surface that poses and reads it, and the `Game` object `src/main.ts` binds to
// the engine. The simulation, the menus, the debug surface, and the drawing live
// in the modules beside it; this file is the contract they share.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS } from "./constants";
import { CUE_SPECS } from "./cues";
import { createDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { renderGame } from "./render";
import { updateGame } from "./update";
import { titleState } from "./world";

/**
 * The field background, a CSS color string. `src/main.ts` hands it to the engine
 * as the color the canvas is cleared to each frame, so the letterbox bars around
 * the field match the field itself.
 */
export const BACKGROUND = "#0a0e1a";

// ---- State (specs/state.md) ----------------------------------------------

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * A pointer or touch contact that landed on a menu screen and has not lifted
 * yet. `item` is the menu item its landing fell inside, or `null` when it landed
 * outside every item. A menu confirms from a pointer only when the landing and
 * the lift fall inside the same item, so the landing is remembered here until
 * the contact lifts. It is input bookkeeping rather than game state: nothing
 * else reads it, and every return to rest clears it.
 */
export interface PendingPress {
  readonly id: number;
  readonly screen: Screen;
  readonly item: number | null;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  readonly presses: readonly PendingPress[];
}

export type ReadonlyState = DeepReadonly<CaromState>;

// ---- Debug surface (specs/instrumentation.md) ----------------------------

export interface MenuItemRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PaddleSnapshot {
  readonly cy: number;
  readonly vy: number;
  readonly drivenVy: number;
  readonly driven: boolean;
}

export interface BallSnapshot {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface CaromSnapshot {
  readonly version: number;
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";
  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;
  readonly muted: boolean;
  readonly paddles: {
    readonly left: PaddleSnapshot;
    readonly right: PaddleSnapshot;
  };
  readonly ai: AiState;
  readonly receiver: Side;
  readonly ball: BallSnapshot | null;
  readonly obstacles: readonly ObstacleState[];
  readonly simTime: number;
}

/** A pose: the current state in, the next state out. */
export type Pose<Args extends unknown[]> = (
  state: ReadonlyState,
  ...args: Args
) => CaromState;

export interface CaromDebugApi {
  readonly version: number;

  // The world.
  readonly clearWorld: Pose<[]>;
  readonly spawnBall: Pose<[]>;
  readonly spawnObstacle: Pose<[index: number]>;
  readonly reset: Pose<[]>;
  readonly reconcile: Pose<[]>;

  // Screens and menus.
  readonly setScreen: Pose<[screen: Screen]>;
  readonly setMode: Pose<[mode: Mode]>;
  readonly setMenuIndex: Pose<[index: number]>;
  readonly setTitleIndex: Pose<[index: number]>;
  readonly setResumeScreen: Pose<[screen: "countdown" | "playing"]>;

  // Match state.
  readonly setScore: Pose<[p1: number, p2: number]>;
  readonly setWinner: Pose<[side: Side | null]>;
  readonly setReceiver: Pose<[side: Side]>;

  // Paddles.
  readonly setPaddleCy: Pose<[side: Side, cy: number]>;
  readonly setPaddleVy: Pose<[side: Side, vy: number]>;
  readonly setPaddleDriven: Pose<[side: Side, driven: boolean]>;

  // The ball.
  readonly setBallPosition: Pose<[x: number, y: number]>;
  readonly setBallVelocity: Pose<[vx: number, vy: number]>;
  readonly setBallSpin: Pose<[spin: number]>;
  readonly setBallHeld: Pose<[held: boolean]>;
  readonly setBallHoldTimer: Pose<[seconds: number]>;
  readonly setBallServeSign: Pose<[sign: 1 | -1]>;
  readonly drawBallServeSign: Pose<[]>;

  // The AI opponent.
  readonly setAiTracking: Pose<[enabled: boolean]>;
  readonly setAiMovement: Pose<[enabled: boolean]>;

  // Audio.
  readonly setMuted: Pose<[muted: boolean]>;

  // Readings.
  snapshot(state: ReadonlyState): CaromSnapshot;
  menuItemRect(state: ReadonlyState, index: number): MenuItemRect | null;
}

// ---- The game ------------------------------------------------------------

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    for (const [cue, spec] of CUE_SPECS) {
      api.audio.define(cue, spec);
    }
    registerDiagnostics(api.diagnostics);
    // The runtime's bus opens unmuted, and `update` mirrors the bit every frame.
    return [titleState(false), createDebugApi()];
  },

  update(state: ReadonlyState, api: UpdateApi, dt: number): CaromState {
    return updateGame(state, api, dt);
  },

  render(state: ReadonlyState, api: RenderApi): void {
    renderGame(state, api.ctx);
  },
};
