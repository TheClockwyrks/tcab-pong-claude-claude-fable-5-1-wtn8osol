// The four audio cues, each a distinct short blip (specs/audio.md).

import type { CueSpec } from "@clockwyrks/simple-2d";
import { CUES } from "./constants";
import type { CueName } from "./constants";

export const CUE_SPECS: readonly (readonly [CueName, CueSpec])[] = [
  [
    CUES.paddleHit,
    { wave: "square", freq: 520, freqTo: 380, durationMs: 70, gain: 0.18 },
  ],
  [
    CUES.wallBounce,
    { wave: "triangle", freq: 300, freqTo: 240, durationMs: 50, gain: 0.14 },
  ],
  [
    CUES.obstacleBounce,
    { wave: "sawtooth", freq: 760, freqTo: 620, durationMs: 60, gain: 0.12 },
  ],
  [
    CUES.score,
    { wave: "sine", freq: 440, freqTo: 880, durationMs: 260, gain: 0.2 },
  ],
];
