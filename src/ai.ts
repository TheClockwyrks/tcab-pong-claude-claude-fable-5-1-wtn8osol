// The AI opponent (specs/modes/single-player.md). It holds no state of its own:
// each frame its velocity is a function of the state it is handed.

import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
} from "./constants";
import type { ReadonlyState } from "./game";

/** The right paddle's velocity for this frame under the AI's rule. */
export function aiVelocity(state: ReadonlyState, dt: number): number {
  const { ai, ball, screen } = state;
  if (!ai.movement) return 0;

  let target = AI_HOME_Y;
  let deadzone = AI_HOME_DEADZONE;
  if (ai.tracking && screen === "playing" && ball !== null && ball.vx > 0) {
    target = ball.y - ball.vy * AI_REACT;
    deadzone = AI_DEADZONE;
  }

  const diff = target - state.paddles.right.cy;
  if (Math.abs(diff) <= deadzone) return 0;
  return Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
}
