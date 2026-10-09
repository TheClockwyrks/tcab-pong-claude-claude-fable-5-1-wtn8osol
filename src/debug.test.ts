import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAROM_DEBUG_VERSION,
  CUES,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
} from "./constants";
import { createHarness, type Harness } from "./testing/harness";

describe("the debug surface", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.destroy());

  it("carries the version", () => {
    expect(h.debug.version).toBe(CAROM_DEBUG_VERSION);
    expect(h.snap().version).toBe(CAROM_DEBUG_VERSION);
  });

  it("sets each screen and menu field alone", () => {
    h.pose((s) => h.debug.setScreen(s, "paused"));
    h.pose((s) => h.debug.setMode(s, "versus"));
    h.pose((s) => h.debug.setMenuIndex(s, 2));
    h.pose((s) => h.debug.setTitleIndex(s, 1));
    h.pose((s) => h.debug.setResumeScreen(s, "countdown"));
    const s = h.snap();
    expect(s.screen).toBe("paused");
    expect(s.mode).toBe("versus");
    expect(s.menuIndex).toBe(2);
    expect(s.titleIndex).toBe(1);
    expect(s.resumeScreen).toBe("countdown");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.ball?.held).toBe(true);
    expect(s.obstacles).toHaveLength(2);
  });

  it("sets the match fields", () => {
    h.pose((s) => h.debug.setScore(s, 7, 9));
    h.pose((s) => h.debug.setWinner(s, "right"));
    h.pose((s) => h.debug.setReceiver(s, "right"));
    expect(h.snap().score).toEqual({ p1: 7, p2: 9 });
    expect(h.snap().winner).toBe("right");
    expect(h.snap().receiver).toBe("right");
    h.pose((s) => h.debug.setWinner(s, null));
    expect(h.snap().winner).toBeNull();
  });

  it("sets the paddle fields, each on its own side", () => {
    h.pose((s) => h.debug.setPaddleCy(s, "right", 123));
    h.pose((s) => h.debug.setPaddleVy(s, "right", -40));
    h.pose((s) => h.debug.setPaddleDriven(s, "right", true));
    const s = h.snap();
    expect(s.paddles.right).toEqual({
      cy: 123,
      vy: 0,
      drivenVy: -40,
      driven: true,
    });
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
  });

  it("sets the ball fields and reads speed from the velocity", () => {
    h.pose((s) => h.debug.setBallPosition(s, 100, 200));
    h.pose((s) => h.debug.setBallVelocity(s, 30, 40));
    h.pose((s) => h.debug.setBallSpin(s, -120));
    h.pose((s) => h.debug.setBallHeld(s, false));
    h.pose((s) => h.debug.setBallHoldTimer(s, 0.25));
    h.pose((s) => h.debug.setBallServeSign(s, -1));
    expect(h.snap().ball).toMatchObject({
      x: 100,
      y: 200,
      vx: 30,
      vy: 40,
      speed: 50,
      spin: -120,
      held: false,
      holdTimer: 0.25,
      serveSign: -1,
      trail: [],
    });
    h.pose((s) => h.debug.reconcile(s));
    expect(h.snap().ball?.speed).toBe(50);
  });

  it("sets the AI's faculties and the mute bit", () => {
    h.pose((s) => h.debug.setAiTracking(s, false));
    h.pose((s) => h.debug.setAiMovement(s, false));
    h.pose((s) => h.debug.setMuted(s, true));
    expect(h.snap().ai).toEqual({ tracking: false, movement: false });
    expect(h.snap().muted).toBe(true);
  });

  it("clears and repopulates the world", () => {
    h.pose((s) => h.debug.clearWorld(s));
    expect(h.snap().ball).toBeNull();
    expect(h.snap().obstacles).toEqual([]);
    expect(h.snap().paddles.left.cy).toBe(FIELD_CY);

    h.pose((s) => h.debug.spawnObstacle(s, 1));
    expect(h.snap().obstacles).toEqual([
      { index: 1, cx: OBSTACLE_CENTERS[1].x, cy: OBSTACLE_CENTERS[1].y },
    ]);
    h.pose((s) => h.debug.spawnObstacle(s, 0));
    h.pose((s) => h.debug.spawnObstacle(s, 0));
    expect(h.snap().obstacles.map((o) => o.index)).toEqual([0, 1]);

    h.pose((s) => h.debug.spawnBall(s));
    expect(h.snap().ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
  });

  it("re-parks a ball that is already present", () => {
    h.pose((s) => h.debug.setBallPosition(s, 10, 10));
    h.pose((s) => h.debug.setBallVelocity(s, 5, 5));
    h.pose((s) => h.debug.spawnBall(s));
    expect(h.snap().ball).toMatchObject({ x: FIELD_CX, y: FIELD_CY, vx: 0 });
  });

  it("fails loudly on a ball that is not there and on values it cannot act on", () => {
    h.pose((s) => h.debug.clearWorld(s));
    const state = h.state();
    expect(() => h.debug.setBallPosition(state, 1, 2)).toThrow();
    expect(() => h.debug.setBallVelocity(state, 1, 2)).toThrow();
    expect(() => h.debug.setBallSpin(state, 1)).toThrow();
    expect(() => h.debug.setBallHeld(state, true)).toThrow();
    expect(() => h.debug.setBallHoldTimer(state, 1)).toThrow();
    expect(() => h.debug.setBallServeSign(state, 1)).toThrow();
    expect(() => h.debug.drawBallServeSign(state)).toThrow();
    expect(() => h.debug.spawnObstacle(state, 2)).toThrow();
    expect(() => h.debug.spawnObstacle(state, -1)).toThrow();
    h.pose((s) => h.debug.spawnBall(s));
    const withBall = h.state();
    expect(() => h.debug.setScreen(withBall, "lobby" as never)).toThrow();
    expect(() => h.debug.setMode(withBall, "coop" as never)).toThrow();
    expect(() => h.debug.setResumeScreen(withBall, "title" as never)).toThrow();
    expect(() => h.debug.setPaddleCy(withBall, "middle" as never, 1)).toThrow();
    expect(() => h.debug.setPaddleCy(withBall, "left", Number.NaN)).toThrow();
    expect(() => h.debug.setWinner(withBall, "both" as never)).toThrow();
    expect(() => h.debug.setBallServeSign(withBall, 0 as never)).toThrow();
    expect(() => h.debug.setMenuIndex(withBall, 1.5)).toThrow();
    expect(() => h.debug.setMuted(withBall, "yes" as never)).toThrow();
    expect(h.snap().ball).not.toBeNull();
  });

  it("resets to the title screen, keeping the mute bit alone", async () => {
    await h.step(10);
    h.pose((s) => h.debug.setMuted(s, true));
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setMode(s, "versus"));
    h.pose((s) => h.debug.setScore(s, 3, 4));
    h.pose((s) => h.debug.setTitleIndex(s, 2));
    h.pose((s) => h.debug.setPaddleDriven(s, "left", true));
    h.pose((s) => h.debug.setPaddleVy(s, "left", 99));
    h.pose((s) => h.debug.setAiTracking(s, false));
    h.pose((s) => h.debug.clearWorld(s));
    h.pose((s) => h.debug.reset(s));
    const s = h.snap();
    expect(s.muted).toBe(true);
    expect(s.simTime).toBe(0);
    expect(s).toMatchObject({
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      score: { p1: 0, p2: 0 },
      winner: null,
      receiver: "left",
      ai: { tracking: true, movement: true },
    });
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      drivenVy: 0,
      driven: false,
    });
    expect(s.ball?.held).toBe(true);
    expect(s.obstacles).toHaveLength(2);
  });

  it("reconciles to an equal state without advancing anything", async () => {
    await h.step(3);
    h.pose((s) => h.debug.setBallVelocity(s, 3, 4));
    const before = h.snap();
    const played = h.played.length;
    h.pose((s) => h.debug.reconcile(s));
    h.pose((s) => h.debug.reconcile(s));
    expect(h.snap()).toEqual(before);
    expect(h.played).toHaveLength(played);
  });

  it("ends the hold when the timer is set to 0, serving on the next frame", async () => {
    h.pose((s) => h.debug.setScreen(s, "countdown"));
    h.pose((s) => h.debug.setBallHoldTimer(s, 0));
    await h.step();
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().ball?.held).toBe(false);
    expect(h.snap().ball?.speed).toBeGreaterThan(0);
  });

  it("hands a snapshot back as a plain copy", () => {
    const s = h.snap();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(s).not.toHaveProperty("presses");
  });
});

describe("muting", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.destroy());

  it("toggles the runtime's bit from any screen with the mute action", async () => {
    h.tap("KeyM");
    await h.step();
    expect(h.snap().muted).toBe(true);
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.tap("KeyM");
    await h.step();
    expect(h.snap().muted).toBe(false);
  });

  it("sets the bit the cues play through when posed", async () => {
    const gains: number[] = [];
    h.engine.events.on("cue:played", (e) => gains.push(e.gain));
    h.pose((s) => h.debug.setMuted(s, true));
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setBallHeld(s, false));
    h.pose((s) => h.debug.setBallPosition(s, 640, 14));
    h.pose((s) => h.debug.setBallVelocity(s, 0, -300));
    await h.step();
    expect(h.played).toEqual([CUES.wallBounce]);
    expect(gains).toEqual([0]);
    expect(h.snap().muted).toBe(true);

    h.pose((s) => h.debug.setMuted(s, false));
    h.pose((s) => h.debug.setBallPosition(s, 640, 14));
    h.pose((s) => h.debug.setBallVelocity(s, 0, -300));
    await h.step();
    expect(gains[1]).toBeGreaterThan(0);
    expect(h.snap().muted).toBe(false);
  });
});
