// A test harness: the engine stood up over a native canvas and a constant
// clock, with helpers that drive the keyboard and the pointer the way a player
// would and step the game an exact number of frames.

import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine, SurfaceMetrics } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "../constants";
import { BACKGROUND, game } from "../game";
import type {
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  ReadonlyState,
} from "../game";

export const FRAME_MS = 1000 / 60;

export interface PointerOptions {
  readonly id?: number;
  readonly device?: "mouse" | "pen" | "touch";
  readonly button?: number;
}

export interface Harness {
  readonly engine: Engine<CaromState, CaromDebugApi>;
  readonly debug: CaromDebugApi;
  readonly target: EventTarget;
  /** The cue names played so far, in order. */
  readonly played: string[];
  readonly state: () => ReadonlyState;
  readonly snap: () => CaromSnapshot;
  readonly pose: (transition: (s: ReadonlyState) => CaromState) => void;
  readonly step: (frames?: number) => Promise<void>;
  /** Advances `seconds` of game time, rounded up to whole frames. */
  readonly run: (seconds: number) => Promise<void>;
  readonly keyDown: (code: string) => void;
  readonly keyUp: (code: string) => void;
  /** A press and release, read by the next frame. */
  readonly tap: (code: string) => void;
  readonly pointerDown: (x: number, y: number, o?: PointerOptions) => void;
  readonly pointerMove: (x: number, y: number, o?: PointerOptions) => void;
  readonly pointerUp: (x: number, y: number, o?: PointerOptions) => void;
  readonly destroy: () => void;
}

export async function createHarness(stepMs = FRAME_MS): Promise<Harness> {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const surface: SurfaceMetrics = {
    cssWidth: () => FIELD_W,
    cssHeight: () => FIELD_H,
    dpr: () => 1,
    events: () => target,
  };
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface,
  });
  const played: string[] = [];
  engine.events.on("cue:played", (e) => played.push(e.cue));
  await engine.initialize();

  const key = (type: string, code: string) =>
    target.dispatchEvent(Object.assign(new Event(type), { code }));

  let buttonsHeld = 0;
  const pointer = (
    type: string,
    x: number,
    y: number,
    { id = 1, device = "mouse", button = 0 }: PointerOptions = {},
  ) => {
    const bit = 1 << (button === 1 ? 2 : button === 2 ? 1 : button);
    if (type === "pointerdown") buttonsHeld |= bit;
    if (type === "pointerup") buttonsHeld &= ~bit;
    target.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: id,
        pointerType: device,
        isPrimary: true,
        button: type === "pointermove" ? -1 : button,
        buttons:
          type === "pointermove" && device === "mouse"
            ? buttonsHeld
            : type === "pointerup"
              ? 0
              : bit,
      }),
    );
  };

  return {
    engine,
    debug: engine.debug,
    target,
    played,
    state: () => engine.state,
    snap: () => engine.debug.snapshot(engine.state),
    pose: (transition) => {
      engine.apply(transition);
    },
    step: (frames = 1) => engine.advance(frames),
    run: (seconds) =>
      engine.advance(Math.ceil((seconds * 1000) / stepMs - 1e-9)),
    keyDown: (code) => key("keydown", code),
    keyUp: (code) => key("keyup", code),
    tap: (code) => {
      key("keydown", code);
      key("keyup", code);
    },
    pointerDown: (x, y, o) => pointer("pointerdown", x, y, o),
    pointerMove: (x, y, o) => pointer("pointermove", x, y, o),
    pointerUp: (x, y, o) => pointer("pointerup", x, y, o),
    destroy: () => engine.destroy(),
  };
}
