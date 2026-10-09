import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIELD_CX, FIELD_CY, FIELD_H, FIELD_W } from "./constants";
import type { Screen } from "./game";
import { createHarness, type Harness } from "./testing/harness";

/** Records one frame on `screen` and returns the operations it drew. */
async function recordFrame(h: Harness, screen: Screen): Promise<string[]> {
  h.pose((s) => h.debug.setScreen(s, screen));
  h.engine.startRecording();
  await h.step();
  const recording = h.engine.stopRecording();
  expect(recording.frames).toHaveLength(1);
  expect(recording.width).toBe(FIELD_W);
  expect(recording.height).toBe(FIELD_H);
  return recording.frames[0].ops.map((i) => {
    const op = recording.ops[i];
    return op.op === "call" ? op.method : `set:${op.property}`;
  });
}

function fillTexts(ops: string[]): number {
  return ops.filter((o) => o === "fillText").length;
}

describe("rendering", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.destroy());

  it("draws every screen as shapes and text", async () => {
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "matchover",
    ] as const) {
      const ops = await recordFrame(h, screen);
      expect(ops).toContain("fill");
      expect(ops).toContain("arc");
      expect(ops).toContain("setLineDash");
      expect(fillTexts(ops)).toBeGreaterThan(0);
    }
  });

  it("draws the match HUD and the hold ring on the countdown", async () => {
    const playing = await recordFrame(h, "playing");
    const countdown = await recordFrame(h, "countdown");
    expect(countdown.filter((o) => o === "arc").length).toBeGreaterThan(
      playing.filter((o) => o === "arc").length,
    );
  });

  it("draws the trail behind a moving ball", async () => {
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setAiMovement(s, false));
    h.pose((s) => h.debug.setBallHeld(s, false));
    h.pose((s) => h.debug.setBallPosition(s, FIELD_CX, FIELD_CY + 100));
    h.pose((s) => h.debug.setBallVelocity(s, 300, 0));
    h.pose((s) => h.debug.setBallSpin(s, 200));
    await h.step(10);
    const ops = await recordFrame(h, "playing");
    expect(ops.filter((o) => o === "lineTo").length).toBeGreaterThan(8);
  });

  it("draws an empty field and a right-side win without complaint", async () => {
    h.pose((s) => h.debug.clearWorld(s));
    const bare = await recordFrame(h, "playing");
    expect(bare.filter((o) => o === "arc")).toHaveLength(1);

    h.pose((s) => h.debug.setMode(s, "versus"));
    h.pose((s) => h.debug.setWinner(s, "right"));
    h.pose((s) => h.debug.setScore(s, 9, 11));
    const over = await recordFrame(h, "matchover");
    expect(fillTexts(over)).toBeGreaterThan(4);

    h.pose((s) => h.debug.setMode(s, "solo"));
    const solo = await recordFrame(h, "matchover");
    expect(fillTexts(solo)).toBe(fillTexts(over));
  });

  it("highlights the item at menuIndex", async () => {
    const first = await recordFrame(h, "title");
    h.pose((s) => h.debug.setMenuIndex(s, 2));
    const third = await recordFrame(h, "title");
    expect(first.length).toBe(third.length);
    expect(first).not.toEqual(third);
  });
});
