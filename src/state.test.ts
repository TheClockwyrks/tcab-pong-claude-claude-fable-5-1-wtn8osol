import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CAROM_DEBUG_VERSION,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
} from "./constants";
import { createHarness, type Harness } from "./testing/harness";

describe("the state at the title screen", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.destroy());

  it("opens on the title screen with every field at its opening value", () => {
    const s = h.snap();
    expect(s.version).toBe(CAROM_DEBUG_VERSION);
    expect(s.screen).toBe("title");
    expect(s.mode).toBe("solo");
    expect(s.menuIndex).toBe(0);
    expect(s.titleIndex).toBe(0);
    expect(s.resumeScreen).toBe("playing");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.winner).toBeNull();
    expect(s.receiver).toBe("left");
    for (const side of ["left", "right"] as const) {
      expect(s.paddles[side]).toEqual({
        cy: FIELD_CY,
        vy: 0,
        drivenVy: 0,
        driven: false,
      });
    }
    expect(s.ai).toEqual({ tracking: true, movement: true });
    expect(s.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      speed: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect([1, -1]).toContain(s.ball?.serveSign);
    expect(s.obstacles).toEqual(
      OBSTACLE_CENTERS.map((c, index) => ({ index, cx: c.x, cy: c.y })),
    );
    expect(s.simTime).toBe(0);
    expect(s.muted).toBe(false);
  });

  it("accumulates simulation time on every screen, the menus included", async () => {
    await h.step(6);
    expect(h.snap().simTime).toBeCloseTo(0.1, 6);
    h.pose((s) => h.debug.setScreen(s, "paused"));
    await h.step(6);
    expect(h.snap().simTime).toBeCloseTo(0.2, 6);
  });

  it("advances nothing on the title screen", async () => {
    await h.step(120);
    const s = h.snap();
    expect(s.screen).toBe("title");
    expect(s.ball?.holdTimer).toBe(HOLD_TIME);
    expect(s.ball?.held).toBe(true);
  });

  it("registers the diagnostic sources the overlay shows", () => {
    const readings = h.engine.diagnostics();
    const byName = new Map(readings.map((r) => [r.name, r.value]));
    expect(byName.get("screen")).toBe("title");
    expect(byName.get("mode")).toBe("solo");
    expect(byName.get("score")).toBe("0 - 0");
    expect(byName.get("ball.pos")).toBe("640.0, 360.0");
    expect(byName.get("ball.vel")).toBe("0.0, 0.0");
    expect(byName.get("ball.speed")).toBe("0.0");
    expect(byName.get("ball.spin")).toBe("0.0");
    expect(byName.get("paddle.left")).toBe("cy 360.0 vy 0.0");
    expect(byName.get("paddle.right")).toBe("cy 360.0 vy 0.0");
    expect(readings.every((r) => r.error === undefined)).toBe(true);
  });

  it("reports a placeholder for the ball's sources while no ball is present", () => {
    h.pose((s) => h.debug.clearWorld(s));
    const byName = new Map(
      h.engine.diagnostics().map((r) => [r.name, r.value]),
    );
    expect(byName.get("ball.pos")).toBe("-");
    expect(byName.get("ball.speed")).toBe("-");
  });
});
