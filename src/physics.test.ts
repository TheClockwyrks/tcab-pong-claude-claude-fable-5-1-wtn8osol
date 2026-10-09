import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BALL_R,
  CUES,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  MAX_BOUNCE_ANGLE,
  OBSTACLE_CENTERS,
  OBSTACLE_HW,
  P1_X1,
  P2_X0,
  PADDLE_HALF,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  TRAIL_TIME,
  WIN_SCORE,
} from "./constants";
import { matchWinner, struckFace } from "./physics";
import { createHarness, type Harness } from "./testing/harness";

describe("the circle-against-rectangle rule", () => {
  const rect = { x0: 100, y0: 100, x1: 120, y1: 240 };

  it("misses a ball whose center is outside or on the expanded rectangle", () => {
    expect(struckFace(50, 170, rect)).toBeNull();
    expect(struckFace(100 - BALL_R, 170, rect)).toBeNull();
    expect(struckFace(110, 100 - BALL_R, rect)).toBeNull();
  });

  it("picks the face of least penetration", () => {
    expect(struckFace(100 - BALL_R + 1, 170, rect)).toBe("left");
    expect(struckFace(120 + BALL_R - 1, 170, rect)).toBe("right");
    expect(struckFace(110, 100 - BALL_R + 1, rect)).toBe("top");
    expect(struckFace(110, 240 + BALL_R - 1, rect)).toBe("bottom");
  });

  it("breaks ties in the order left, right, top, bottom", () => {
    expect(struckFace(100 - BALL_R + 2, 100 - BALL_R + 2, rect)).toBe("left");
    expect(struckFace(120 + BALL_R - 2, 100 - BALL_R + 2, rect)).toBe("right");
    expect(struckFace(110, 110, { x0: 100, y0: 100, x1: 120, y1: 120 })).toBe(
      "left",
    );
  });
});

describe("the win rule", () => {
  it("needs WIN_SCORE points and a two-point lead", () => {
    expect(matchWinner({ p1: 11, p2: 9 })).toBe("left");
    expect(matchWinner({ p1: 9, p2: 11 })).toBe("right");
    expect(matchWinner({ p1: 11, p2: 10 })).toBeNull();
    expect(matchWinner({ p1: 10, p2: 10 })).toBeNull();
    expect(matchWinner({ p1: 13, p2: 11 })).toBe("left");
    expect(matchWinner({ p1: 10, p2: 8 })).toBeNull();
  });
});

describe("the ball in flight", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setBallHeld(s, false));
    h.pose((s) => h.debug.setAiMovement(s, false));
  });
  afterEach(() => h.destroy());

  function fly(x: number, y: number, vx: number, vy: number, spin = 0): void {
    h.pose((s) => h.debug.setBallPosition(s, x, y));
    h.pose((s) => h.debug.setBallVelocity(s, vx, vy));
    h.pose((s) => h.debug.setBallSpin(s, spin));
  }

  it("flies straight at constant speed with no spin", async () => {
    fly(400, 300, 300, 120);
    await h.step(6);
    const b = h.snap().ball;
    expect(b?.x).toBeCloseTo(430, 6);
    expect(b?.y).toBeCloseTo(312, 6);
    expect(b?.speed).toBeCloseTo(Math.hypot(300, 120), 9);
  });

  it("reflects off the top and bottom walls, keeping speed and spin, with one cue", async () => {
    fly(640, BALL_R + 3, 200, -300, 400);
    await h.step();
    let b = h.snap().ball;
    expect(b?.vy).toBeGreaterThan(0);
    expect(b?.y).toBeGreaterThanOrEqual(BALL_R);
    expect(b?.speed).toBeCloseTo(Math.hypot(200, 300), 6);
    expect(b?.spin).toBeGreaterThan(380);
    expect(h.played.filter((c) => c === CUES.wallBounce)).toHaveLength(1);

    fly(640, FIELD_H - BALL_R - 3, 200, 300);
    await h.step();
    b = h.snap().ball;
    expect(b?.vy).toBeLessThan(0);
    expect(b?.y).toBeLessThanOrEqual(FIELD_H - BALL_R);
  });

  it("bounces straight back off the center of a stationary paddle, faster", async () => {
    fly(P1_X1 + BALL_R + 30, FIELD_CY, -SERVE_SPEED, 0);
    await h.step(6);
    const b = h.snap().ball;
    expect(b?.vx).toBeCloseTo(SERVE_SPEED * SPEED_MULT, 6);
    expect(b?.vy).toBeCloseTo(0, 6);
    expect(b?.spin).toBe(0);
    expect(b?.x).toBeGreaterThan(P1_X1 + BALL_R);
    expect(h.played).toEqual([CUES.paddleHit]);
  });

  it("leaves at the bounce angle the contact point fixes", async () => {
    fly(P2_X0 - BALL_R - 20, FIELD_CY + PADDLE_HALF, SERVE_SPEED, 0);
    await h.step(3);
    const b = h.snap().ball;
    const speed = SERVE_SPEED * SPEED_MULT;
    expect(b?.vx).toBeCloseTo(-speed * Math.cos(MAX_BOUNCE_ANGLE), 4);
    expect(b?.vy).toBeCloseTo(speed * Math.sin(MAX_BOUNCE_ANGLE), 4);
    expect(b?.speed).toBeCloseTo(speed, 6);

    fly(P2_X0 - BALL_R - 20, FIELD_CY - PADDLE_HALF / 2, SERVE_SPEED, 0);
    await h.step(3);
    const c = h.snap().ball;
    expect(c?.vy).toBeCloseTo(
      -SERVE_SPEED * SPEED_MULT * Math.sin(MAX_BOUNCE_ANGLE / 2),
      4,
    );
  });

  it("caps the speed at SPEED_CAP", async () => {
    fly(P1_X1 + BALL_R + 20, FIELD_CY, -(SPEED_CAP - 5), 0);
    await h.step(3);
    expect(h.snap().ball?.speed).toBeCloseTo(SPEED_CAP, 6);
    fly(P1_X1 + BALL_R + 20, FIELD_CY, -SPEED_CAP, 0);
    await h.step(3);
    expect(h.snap().ball?.speed).toBeCloseTo(SPEED_CAP, 6);
  });

  it("takes spin from a moving paddle and keeps it through the frame's decay", async () => {
    h.pose((s) => h.debug.setPaddleDriven(s, "left", true));
    h.pose((s) => h.debug.setPaddleVy(s, "left", 400));
    fly(P1_X1 + BALL_R + 4, FIELD_CY, -SERVE_SPEED, 0);
    await h.step();
    const spin = h.snap().ball?.spin ?? 0;
    expect(spin).toBeLessThanOrEqual(400 * SPIN_FROM_PADDLE);
    expect(spin).toBeGreaterThan(400 * SPIN_FROM_PADDLE * 0.98);

    h.pose((s) => h.debug.setPaddleVy(s, "left", -2000));
    h.pose((s) => h.debug.setPaddleCy(s, "left", FIELD_CY));
    fly(P1_X1 + BALL_R + 4, FIELD_CY, -SERVE_SPEED, 0, 0);
    await h.step();
    expect(h.snap().ball?.spin).toBeLessThan(-SPIN_CLAMP * 0.98);
    expect(h.snap().ball?.spin).toBeGreaterThanOrEqual(-SPIN_CLAMP);
  });

  it("curves the flight clockwise under positive spin and halves the spin every SPIN_HALFLIFE", async () => {
    fly(200, 200, 400, 0, 600);
    await h.run(SPIN_HALFLIFE);
    const b = h.snap().ball;
    expect(b?.vy).toBeGreaterThan(0);
    expect(b?.speed).toBeCloseTo(400, 6);
    expect(b?.spin).toBeCloseTo(300, 0);

    fly(200, 500, 400, 0, -600);
    await h.step(10);
    expect(h.snap().ball?.vy).toBeLessThan(0);
  });

  it("bounces off an obstacle with speed and spin unchanged", async () => {
    const a = OBSTACLE_CENTERS[0];
    fly(a.x - OBSTACLE_HW - BALL_R - 20, a.y, 300, 0, 50);
    await h.step(6);
    const b = h.snap().ball;
    expect(b?.vx).toBeCloseTo(-300, 0);
    expect(b?.speed).toBeCloseTo(300, 6);
    expect(b?.x).toBeLessThanOrEqual(a.x - OBSTACLE_HW - BALL_R);
    expect(b?.spin).toBeGreaterThan(40);
    expect(h.played).toEqual([CUES.obstacleBounce]);
  });

  it("treats a paddle's end cap like a wall", async () => {
    fly((P1_X1 + P1_X1 - 16) / 2, FIELD_CY - PADDLE_HALF - BALL_R - 15, 0, 300);
    await h.step(6);
    const b = h.snap().ball;
    expect(b?.vy).toBeCloseTo(-300, 6);
    expect(b?.vx).toBe(0);
    expect(b?.y).toBeLessThanOrEqual(FIELD_CY - PADDLE_HALF - BALL_R);
    expect(h.played).toEqual([CUES.wallBounce]);
  });

  it("ignores absent obstacles", async () => {
    h.pose((s) => h.debug.clearWorld(s));
    h.pose((s) => h.debug.spawnBall(s));
    h.pose((s) => h.debug.setBallHeld(s, false));
    const a = OBSTACLE_CENTERS[0];
    fly(a.x - 60, a.y, 300, 0);
    await h.step(30);
    expect(h.snap().ball?.vx).toBe(300);
    expect(h.snap().obstacles).toEqual([]);
  });

  it("records a trail of the last TRAIL_TIME seconds, oldest first", async () => {
    fly(300, 400, 400, 0);
    await h.step(30);
    const s = h.snap();
    const trail = s.ball?.trail ?? [];
    expect(trail.length).toBeGreaterThan(5);
    for (let i = 1; i < trail.length; i += 1) {
      expect(trail[i].t).toBeGreaterThan(trail[i - 1].t);
      expect(trail[i].x).toBeGreaterThan(trail[i - 1].x);
    }
    expect(s.simTime - trail[0].t).toBeLessThanOrEqual(TRAIL_TIME + 1e-9);
    expect(trail[trail.length - 1]).toMatchObject({
      x: s.ball?.x,
      y: s.ball?.y,
      t: s.simTime,
    });
  });
});

describe("serving", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.step();
  });
  afterEach(() => h.destroy());

  it("waits out HOLD_TIME and serves toward the receiver on the frame the hold elapses", async () => {
    h.pose((s) => h.debug.setBallServeSign(s, 1));
    await h.step(58);
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().ball?.held).toBe(true);
    expect(h.snap().ball?.holdTimer).toBeGreaterThan(0);
    await h.step();
    const s = h.snap();
    expect(s.screen).toBe("playing");
    expect(s.ball?.held).toBe(false);
    expect(s.ball?.holdTimer).toBe(0);
    expect(s.ball?.x).toBe(FIELD_CX);
    expect(s.ball?.y).toBe(FIELD_CY);
    expect(s.ball?.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE), 9);
    expect(s.ball?.vy).toBeCloseTo(SERVE_SPEED * Math.sin(SERVE_ANGLE), 9);
    expect(s.ball?.serveSign).toBe(1);
    await h.step();
    expect(h.snap().ball?.x).toBeLessThan(FIELD_CX);
  });

  it("uses the serve sign and the receiver it holds at the serve", async () => {
    h.pose((s) => h.debug.setReceiver(s, "right"));
    h.pose((s) => h.debug.setBallServeSign(s, -1));
    h.pose((s) => h.debug.setBallHoldTimer(s, 0));
    await h.step();
    const b = h.snap().ball;
    expect(b?.vx).toBeGreaterThan(0);
    expect(b?.vy).toBeCloseTo(-SERVE_SPEED * Math.sin(SERVE_ANGLE), 9);
    expect(b?.speed).toBeCloseTo(SERVE_SPEED, 9);
  });

  it("draws the serve sign both ways over a run of parkings", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 64 && seen.size < 2; i += 1) {
      h.pose((s) => h.debug.drawBallServeSign(s));
      seen.add(h.snap().ball?.serveSign ?? 0);
    }
    expect([...seen].sort()).toEqual([-1, 1]);
  });
});

describe("scoring", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.step();
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setBallHeld(s, false));
    h.pose((s) => h.debug.setAiMovement(s, false));
    h.pose((s) => h.debug.setPaddleCy(s, "right", 100));
    h.pose((s) => h.debug.setPaddleCy(s, "left", 100));
  });
  afterEach(() => h.destroy());

  function shoot(toward: "left" | "right"): void {
    const x = toward === "right" ? FIELD_W - 40 : 40;
    h.pose((s) => h.debug.setBallPosition(s, x, 500));
    h.pose((s) =>
      h.debug.setBallVelocity(s, toward === "right" ? 700 : -700, 0),
    );
  }

  it("awards the point, parks the ball, and serves toward the side scored on", async () => {
    shoot("right");
    await h.step(6);
    const s = h.snap();
    expect(s.score).toEqual({ p1: 1, p2: 0 });
    expect(s.screen).toBe("countdown");
    expect(s.receiver).toBe("right");
    expect(s.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      spin: 0,
      held: true,
    });
    expect(s.ball?.holdTimer).toBeGreaterThan(HOLD_TIME - 0.05);
    expect(h.played.filter((c) => c === CUES.score)).toHaveLength(1);
    expect(s.paddles.right.cy).toBe(100);
  });

  it("scores for player two when the ball passes the left edge", async () => {
    shoot("left");
    await h.step(6);
    expect(h.snap().score).toEqual({ p1: 0, p2: 1 });
    expect(h.snap().receiver).toBe("left");
  });

  it("ends the match on the winning point and leaves the ball where it is", async () => {
    h.pose((s) => h.debug.setScore(s, WIN_SCORE - 1, 4));
    shoot("right");
    await h.step(6);
    const s = h.snap();
    expect(s.score).toEqual({ p1: WIN_SCORE, p2: 4 });
    expect(s.winner).toBe("left");
    expect(s.screen).toBe("matchover");
    expect(s.menuIndex).toBe(0);
    expect((s.ball?.x ?? 0) - BALL_R).toBeGreaterThan(FIELD_W);
    await h.step(10);
    expect(h.snap().ball?.x).toBe(s.ball?.x);
  });

  it("plays on from deuce until one side leads by two", async () => {
    h.pose((s) => h.debug.setScore(s, 10, 10));
    shoot("left");
    await h.step(6);
    expect(h.snap().score).toEqual({ p1: 10, p2: 11 });
    expect(h.snap().winner).toBeNull();
    expect(h.snap().screen).toBe("countdown");
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setBallHeld(s, false));
    shoot("left");
    await h.step(6);
    expect(h.snap().winner).toBe("right");
    expect(h.snap().screen).toBe("matchover");
  });

  it("scores nothing while no ball is on the field", async () => {
    h.pose((s) => h.debug.clearWorld(s));
    await h.step(60);
    expect(h.snap().score).toEqual({ p1: 0, p2: 0 });
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().ball).toBeNull();
  });
});

describe("step-size independence", () => {
  async function drive(stepMs: number) {
    const h = await createHarness(stepMs);
    const stamps: number[] = [];
    h.engine.events.on("cue:played", (e) => {
      if (e.cue === CUES.paddleHit) stamps.push(e.t / 1000);
    });
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pose((s) => h.debug.setAiMovement(s, false));
    // A leftward ball under positive spin curves upward, toward this paddle.
    h.pose((s) => h.debug.setPaddleCy(s, "left", 250));
    h.pose((s) => h.debug.setBallHeld(s, false));
    h.pose((s) => h.debug.setBallPosition(s, FIELD_CX, FIELD_CY));
    h.pose((s) => h.debug.setBallVelocity(s, -SERVE_SPEED, 0));
    h.pose((s) => h.debug.setBallSpin(s, 250));
    await h.step(Math.round(2500 / stepMs));
    const result = {
      snap: h.snap(),
      played: [...h.played],
      hitAt: stamps[0] ?? 0,
    };
    h.destroy();
    return result;
  }

  it("reaches the same contacts and speed under 2 ms and 16 ms frames", async () => {
    const fine = await drive(2);
    const coarse = await drive(16);
    expect(fine.played).toEqual(coarse.played);
    expect(fine.played).toContain(CUES.paddleHit);
    expect(fine.hitAt).toBeGreaterThan(0);
    expect(Math.abs(fine.hitAt - coarse.hitAt) / fine.hitAt).toBeLessThan(0.08);
    const a = fine.snap.ball;
    const b = coarse.snap.ball;
    expect(Math.abs((a?.speed ?? 0) - (b?.speed ?? 0))).toBeLessThan(10);
    expect(Math.sign(a?.vx ?? 0)).toBe(Math.sign(b?.vx ?? 0));
    expect(fine.snap.score).toEqual(coarse.snap.score);
  });
});
