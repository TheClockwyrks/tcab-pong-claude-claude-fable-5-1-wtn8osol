// The values Carom puts on the engine's debug overlay (specs/instrumentation.md,
// "Diagnostics"). Every source is a pure read of the state it is handed.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { CaromState, PaddleState } from "./game";
import { speedOf } from "./physics";

const NONE = "-";

function fixed(value: number): string {
  return value.toFixed(1);
}

function paddleLine(paddle: PaddleState): string {
  return `cy ${fixed(paddle.cy)} vy ${fixed(paddle.vy)}`;
}

export function registerDiagnostics(
  diagnostics: InitApi<CaromState>["diagnostics"],
): void {
  diagnostics.register("screen", (s) => s.screen);
  diagnostics.register("mode", (s) => s.mode);
  diagnostics.register("score", (s) => `${s.score.p1} - ${s.score.p2}`);
  diagnostics.register("ball.pos", (s) =>
    s.ball === null ? NONE : `${fixed(s.ball.x)}, ${fixed(s.ball.y)}`,
  );
  diagnostics.register("ball.vel", (s) =>
    s.ball === null ? NONE : `${fixed(s.ball.vx)}, ${fixed(s.ball.vy)}`,
  );
  diagnostics.register("ball.speed", (s) =>
    s.ball === null ? NONE : fixed(speedOf(s.ball)),
  );
  diagnostics.register("ball.spin", (s) =>
    s.ball === null ? NONE : fixed(s.ball.spin),
  );
  diagnostics.register("paddle.left", (s) => paddleLine(s.paddles.left));
  diagnostics.register("paddle.right", (s) => paddleLine(s.paddles.right));
}
