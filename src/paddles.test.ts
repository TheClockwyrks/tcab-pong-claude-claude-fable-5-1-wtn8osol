import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_SPEED,
  FIELD_CY,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
} from "./constants";
import { integratePaddle } from "./world";
import { createHarness, FRAME_MS, type Harness } from "./testing/harness";

const DT = FRAME_MS / 1000;

describe("paddle integration", () => {
  const rest = { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };

  it("moves at the given velocity and reports it", () => {
    const next = integratePaddle(rest, 300, 0.1);
    expect(next.cy).toBeCloseTo(FIELD_CY + 30, 9);
    expect(next.vy).toBe(300);
  });

  it("clamps to the field and reports the velocity actually travelled", () => {
    const nearTop = { ...rest, cy: PADDLE_MIN_CY + 5 };
    const next = integratePaddle(nearTop, -PADDLE_SPEED, 0.1);
    expect(next.cy).toBe(PADDLE_MIN_CY);
    expect(next.vy).toBeCloseTo(-50, 9);
    const pinned = integratePaddle(next, -PADDLE_SPEED, 0.1);
    expect(pinned.cy).toBe(PADDLE_MIN_CY);
    expect(pinned.vy).toBe(0);
    const bottom = integratePaddle({ ...rest, cy: PADDLE_MAX_CY }, 500, 0.1);
    expect(bottom.vy).toBe(0);
  });

  it("keeps the velocity when a zero-length frame cannot move it", () => {
    const next = integratePaddle({ ...rest, cy: PADDLE_MIN_CY }, -100, 0);
    expect(next.cy).toBe(PADDLE_MIN_CY);
    expect(next.vy).toBe(-100);
  });
});

describe("human paddles", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.destroy());

  it("moves the left paddle at PADDLE_SPEED while a key is held, in solo from either set", async () => {
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setAiMovement(s, false));
    h.keyDown("KeyS");
    await h.step(6);
    expect(h.snap().paddles.left.cy).toBeCloseTo(
      FIELD_CY + PADDLE_SPEED * 0.1,
      6,
    );
    expect(h.snap().paddles.left.vy).toBe(PADDLE_SPEED);
    h.keyUp("KeyS");
    await h.step();
    expect(h.snap().paddles.left.vy).toBe(0);

    h.keyDown("ArrowUp");
    await h.step(6);
    expect(h.snap().paddles.left.cy).toBeCloseTo(FIELD_CY, 6);
    expect(h.snap().paddles.right.cy).toBe(FIELD_CY);
    h.keyUp("ArrowUp");
  });

  it("cancels opposite keys held together", async () => {
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.keyDown("KeyW");
    h.keyDown("ArrowDown");
    await h.step(6);
    expect(h.snap().paddles.left.cy).toBe(FIELD_CY);
    expect(h.snap().paddles.left.vy).toBe(0);
  });

  it("gives each player their own paddle in versus", async () => {
    h.pose((s) => h.debug.setMode(s, "versus"));
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.keyDown("KeyW");
    h.keyDown("ArrowDown");
    await h.step(6);
    expect(h.snap().paddles.left.cy).toBeCloseTo(FIELD_CY - 72, 6);
    expect(h.snap().paddles.right.cy).toBeCloseTo(FIELD_CY + 72, 6);
    expect(h.snap().paddles.right.vy).toBe(PADDLE_SPEED);
  });

  it("stops at the field's edge with vy reading 0", async () => {
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setPaddleCy(s, "left", PADDLE_MAX_CY - 6));
    h.keyDown("KeyS");
    await h.step();
    expect(h.snap().paddles.left.cy).toBe(PADDLE_MAX_CY);
    expect(h.snap().paddles.left.vy).toBeCloseTo(6 / DT, 6);
    await h.step();
    expect(h.snap().paddles.left.vy).toBe(0);
  });

  it("moves during the countdown and holds still while paused", async () => {
    h.tap("Enter");
    await h.step();
    h.keyDown("KeyS");
    await h.step(6);
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().paddles.left.cy).toBeGreaterThan(FIELD_CY + 60);
    const cy = h.snap().paddles.left.cy;
    h.tap("KeyP");
    await h.step(6);
    expect(h.snap().paddles.left.cy).toBe(cy);
  });

  it("takes no movement on the frame a menu hands over to the field", async () => {
    h.keyDown("KeyS");
    await h.step();
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().paddles.left.cy).toBe(FIELD_CY);
    await h.step();
    expect(h.snap().paddles.left.cy).toBeGreaterThan(FIELD_CY);
  });
});

describe("driven paddles", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    h.pose((s) => h.debug.setScreen(s, "playing"));
  });
  afterEach(() => h.destroy());

  it("moves at drivenVy once driven, ignoring the keys, and hands back on release", async () => {
    h.pose((s) => h.debug.setPaddleVy(s, "left", 300));
    expect(h.snap().paddles.left.drivenVy).toBe(300);
    expect(h.snap().paddles.left.vy).toBe(0);
    await h.step();
    expect(h.snap().paddles.left.vy).toBe(0);
    expect(h.snap().paddles.left.cy).toBe(FIELD_CY);

    h.pose((s) => h.debug.setPaddleDriven(s, "left", true));
    h.keyDown("KeyW");
    await h.step(6);
    expect(h.snap().paddles.left.vy).toBe(300);
    expect(h.snap().paddles.left.cy).toBeCloseTo(FIELD_CY + 30, 6);
    expect(h.snap().paddles.right.driven).toBe(false);

    h.pose((s) => h.debug.setPaddleDriven(s, "left", false));
    await h.step(6);
    expect(h.snap().paddles.left.vy).toBe(-PADDLE_SPEED);
    expect(h.snap().paddles.left.drivenVy).toBe(300);
    h.keyUp("KeyW");
  });

  it("takes the AI's paddle from it", async () => {
    h.pose((s) => h.debug.setPaddleDriven(s, "right", true));
    h.pose((s) => h.debug.setPaddleVy(s, "right", -200));
    h.pose((s) => h.debug.setBallPosition(s, 1000, 600));
    h.pose((s) => h.debug.setBallVelocity(s, 100, 0));
    h.pose((s) => h.debug.setBallHeld(s, false));
    await h.step(6);
    expect(h.snap().paddles.right.vy).toBe(-200);
    expect(h.snap().paddles.right.cy).toBeCloseTo(FIELD_CY - 20, 6);
  });
});

describe("the AI opponent", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setBallHeld(s, false));
  });
  afterEach(() => h.destroy());

  function approach(y: number, vy = 0): void {
    h.pose((s) => h.debug.setBallPosition(s, 900, y));
    h.pose((s) => h.debug.setBallVelocity(s, 400, vy));
  }

  it("tracks a ball coming toward it at AI_SPEED", async () => {
    approach(100);
    await h.step();
    expect(h.snap().paddles.right.vy).toBe(-AI_SPEED);
    expect(h.snap().paddles.right.cy).toBeCloseTo(FIELD_CY - AI_SPEED * DT, 6);
  });

  it("leads a moving ball by AI_REACT and stops inside the deadzone", async () => {
    approach(345);
    await h.step();
    expect(h.snap().paddles.right.vy).toBe(-AI_SPEED);
    await h.step();
    expect(h.snap().paddles.right.vy).toBe(0);
    expect(h.snap().paddles.right.cy).toBeCloseTo(FIELD_CY - AI_SPEED * DT, 6);

    h.pose((s) => h.debug.setPaddleCy(s, "right", FIELD_CY));
    approach(360, 500);
    await h.step();
    expect(h.snap().paddles.right.vy).toBe(-AI_SPEED);
  });

  it("returns home while the ball travels away and rests inside the home deadzone", async () => {
    h.pose((s) => h.debug.setPaddleCy(s, "right", 200));
    h.pose((s) => h.debug.setBallPosition(s, 600, 100));
    h.pose((s) => h.debug.setBallVelocity(s, -400, 0));
    await h.step();
    expect(h.snap().paddles.right.vy).toBe(AI_SPEED);
    await h.run(1);
    const cy = h.snap().paddles.right.cy;
    expect(Math.abs(cy - AI_HOME_Y)).toBeLessThanOrEqual(AI_HOME_DEADZONE);
    expect(h.snap().paddles.right.vy).toBe(0);
  });

  it("holds home during the countdown whatever the ball does", async () => {
    h.pose((s) => h.debug.setScreen(s, "countdown"));
    approach(100);
    await h.step(3);
    expect(h.snap().paddles.right.cy).toBe(FIELD_CY);
  });

  it("goes home with tracking off, and freezes with movement off", async () => {
    h.pose((s) => h.debug.setAiTracking(s, false));
    approach(100);
    await h.step(3);
    expect(h.snap().paddles.right.cy).toBe(FIELD_CY);
    expect(h.snap().paddles.right.vy).toBe(0);

    h.pose((s) => h.debug.setAiTracking(s, true));
    h.pose((s) => h.debug.setAiMovement(s, false));
    h.pose((s) => h.debug.setPaddleCy(s, "right", 500));
    await h.step(3);
    expect(h.snap().paddles.right.cy).toBe(500);
    expect(h.snap().paddles.right.vy).toBe(0);
  });

  it("plays no part in versus", async () => {
    h.pose((s) => h.debug.setMode(s, "versus"));
    approach(100);
    await h.step(3);
    expect(h.snap().paddles.right.cy).toBe(FIELD_CY);
  });
});
