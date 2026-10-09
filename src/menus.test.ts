import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FIELD_CY,
  HOLD_TIME,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import { HOWTO_ITEMS, itemAt, menuRects } from "./menus";
import { createHarness, type Harness } from "./testing/harness";

function center(h: Harness, index: number): { x: number; y: number } {
  const r = h.debug.menuItemRect(h.state(), index);
  if (r === null) throw new Error(`no rect for item ${index}`);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

describe("the title menu", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.destroy());

  it("moves the highlight with either player's keys and wraps both ways", async () => {
    h.tap("KeyS");
    await h.step();
    expect(h.snap().menuIndex).toBe(1);
    h.tap("ArrowDown");
    await h.step();
    expect(h.snap().menuIndex).toBe(2);
    h.tap("KeyS");
    await h.step();
    expect(h.snap().menuIndex).toBe(0);
    h.tap("ArrowUp");
    await h.step();
    expect(h.snap().menuIndex).toBe(TITLE_ITEMS.length - 1);
    h.tap("KeyW");
    await h.step();
    expect(h.snap().menuIndex).toBe(1);
  });

  it("reads a held key as one press", async () => {
    h.keyDown("KeyS");
    await h.step(10);
    expect(h.snap().menuIndex).toBe(1);
    h.keyUp("KeyS");
  });

  it("starts a Solo match from SOLO and remembers the selection", async () => {
    h.tap("Enter");
    await h.step();
    const s = h.snap();
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("solo");
    expect(s.titleIndex).toBe(0);
    expect(s.menuIndex).toBe(0);
    expect(s.resumeScreen).toBe("playing");
    expect(s.score).toEqual({ p1: 0, p2: 0 });
    expect(s.receiver).toBe("left");
    expect(s.ball?.held).toBe(true);
    expect(s.ball?.holdTimer).toBeCloseTo(HOLD_TIME - 1 / 60, 6);
  });

  it("starts a Versus match from VERSUS, with Space as confirm", async () => {
    h.tap("ArrowDown");
    await h.step();
    h.tap("Space");
    await h.step();
    const s = h.snap();
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("versus");
    expect(s.titleIndex).toBe(1);
  });

  it("opens how to play and returns to the title with the selection restored", async () => {
    h.tap("KeyW");
    await h.step();
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("howto");
    expect(h.snap().menuIndex).toBe(0);
    expect(h.snap().titleIndex).toBe(2);
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(2);
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("howto");
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("title");
  });

  it("ignores back on the title", async () => {
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("title");
  });

  it("applies up before down and movement before confirm on one frame", async () => {
    h.tap("KeyS");
    h.tap("KeyW");
    await h.step();
    expect(h.snap().menuIndex).toBe(TITLE_ITEMS.length - 1);
    h.tap("KeyS");
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(0);
  });
});

describe("pausing", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    h.tap("Enter");
    await h.step();
  });
  afterEach(() => h.destroy());

  it("opens the pause menu from the countdown with Escape and resumes with a second press", async () => {
    const timer = h.snap().ball?.holdTimer;
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("paused");
    expect(h.snap().resumeScreen).toBe("countdown");
    expect(h.snap().menuIndex).toBe(0);
    await h.step(30);
    expect(h.snap().ball?.holdTimer).toBe(timer);
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("countdown");
  });

  it("pauses live play with P and resumes to playing", async () => {
    await h.run(HOLD_TIME);
    expect(h.snap().screen).toBe("playing");
    h.tap("KeyP");
    await h.step();
    expect(h.snap().screen).toBe("paused");
    expect(h.snap().resumeScreen).toBe("playing");
    const frozen = h.snap().ball;
    await h.step(20);
    expect(h.snap().ball).toEqual(frozen);
    h.tap("KeyP");
    await h.step();
    expect(h.snap().screen).toBe("playing");
  });

  it("resumes from RESUME, restarts from RESTART, and quits from QUIT TO MENU", async () => {
    h.tap("KeyP");
    await h.step();
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("countdown");

    h.pose((s) => h.debug.setScore(s, 4, 2));
    h.pose((s) => h.debug.setPaddleCy(s, "left", 100));
    h.tap("KeyP");
    await h.step();
    h.tap("KeyS");
    await h.step();
    expect(h.snap().menuIndex).toBe(1);
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().score).toEqual({ p1: 0, p2: 0 });
    expect(h.snap().paddles.left.cy).toBe(FIELD_CY);

    h.tap("KeyP");
    await h.step();
    h.tap("KeyW");
    await h.step();
    expect(h.snap().menuIndex).toBe(PAUSE_ITEMS.length - 1);
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().mode).toBe("solo");
  });

  it("resumes on a frame carrying pause and does nothing else", async () => {
    h.tap("KeyP");
    await h.step();
    h.tap("KeyS");
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().menuIndex).toBe(0);
  });
});

describe("the match-over menu", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
    h.pose((s) => h.debug.setMode(s, "versus"));
    h.pose((s) => h.debug.setScore(s, 11, 7));
    h.pose((s) => h.debug.setWinner(s, "left"));
    h.pose((s) => h.debug.setScreen(s, "matchover"));
  });
  afterEach(() => h.destroy());

  it("plays again in the same mode", async () => {
    h.tap("Enter");
    await h.step();
    const s = h.snap();
    expect(s.screen).toBe("countdown");
    expect(s.mode).toBe("versus");
    expect(s.winner).toBeNull();
    expect(s.score).toEqual({ p1: 0, p2: 0 });
  });

  it("returns to the title from MENU and from back", async () => {
    h.tap("ArrowDown");
    await h.step();
    expect(h.snap().menuIndex).toBe(MATCHOVER_ITEMS.length - 1);
    h.tap("Enter");
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().winner).toBeNull();
    expect(h.snap().mode).toBe("solo");

    h.pose((s) => h.debug.setScreen(s, "matchover"));
    h.tap("Escape");
    await h.step();
    expect(h.snap().screen).toBe("title");
  });
});

describe("menu hit regions", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.destroy());

  it("reports one region per item on each menu screen and none elsewhere", () => {
    const counts = {
      title: TITLE_ITEMS.length,
      howto: HOWTO_ITEMS.length,
      paused: PAUSE_ITEMS.length,
      matchover: MATCHOVER_ITEMS.length,
    } as const;
    for (const [screen, count] of Object.entries(counts)) {
      h.pose((s) => h.debug.setScreen(s, screen as keyof typeof counts));
      for (let i = 0; i < count; i += 1) {
        const r = h.debug.menuItemRect(h.state(), i);
        expect(r).not.toBeNull();
        expect(r?.w).toBeGreaterThan(0);
        expect(r?.h).toBeGreaterThan(0);
      }
      expect(h.debug.menuItemRect(h.state(), count)).toBeNull();
      expect(h.debug.menuItemRect(h.state(), -1)).toBeNull();
    }
    for (const screen of ["countdown", "playing"] as const) {
      h.pose((s) => h.debug.setScreen(s, screen));
      expect(h.debug.menuItemRect(h.state(), 0)).toBeNull();
    }
  });

  it("lays the regions out without overlap", () => {
    const rects = menuRects("title") ?? [];
    for (let i = 1; i < rects.length; i += 1) {
      expect(rects[i].y).toBeGreaterThanOrEqual(
        rects[i - 1].y + rects[i - 1].h,
      );
    }
    expect(itemAt("title", rects[1].x + 1, rects[1].y + 1)).toBe(1);
    expect(itemAt("title", 0, 0)).toBeNull();
    expect(itemAt("playing", rects[1].x + 1, rects[1].y + 1)).toBeNull();
  });
});

describe("pointer and touch on the menus", () => {
  let h: Harness;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(() => h.destroy());

  it("selects the item a pointer moves onto", async () => {
    const c = center(h, 1);
    h.pointerMove(c.x, c.y);
    await h.step();
    expect(h.snap().menuIndex).toBe(1);
    h.pointerMove(5, 5);
    await h.step();
    expect(h.snap().menuIndex).toBe(1);
  });

  it("confirms an item pressed and released inside its region on one frame", async () => {
    const c = center(h, 2);
    h.pointerDown(c.x, c.y);
    h.pointerUp(c.x, c.y);
    await h.step();
    expect(h.snap().screen).toBe("howto");
    expect(h.snap().titleIndex).toBe(2);
  });

  it("confirms a press and a release that arrive on different frames", async () => {
    const c = center(h, 1);
    h.pointerDown(c.x, c.y);
    await h.step(3);
    expect(h.snap().menuIndex).toBe(1);
    expect(h.snap().screen).toBe("title");
    h.pointerUp(c.x, c.y);
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().mode).toBe("versus");
  });

  it("confirms nothing when the press and the release fall in different regions", async () => {
    const a = center(h, 1);
    const b = center(h, 2);
    h.pointerDown(a.x, a.y);
    await h.step();
    h.pointerUp(b.x, b.y);
    await h.step();
    expect(h.snap().screen).toBe("title");
  });

  it("confirms nothing when either edge falls outside every region", async () => {
    const c = center(h, 0);
    h.pointerDown(5, 5);
    h.pointerUp(c.x, c.y);
    await h.step();
    expect(h.snap().screen).toBe("title");
    h.pointerDown(c.x, c.y);
    h.pointerUp(5, 5);
    await h.step();
    expect(h.snap().screen).toBe("title");
    expect(h.snap().menuIndex).toBe(0);
  });

  it("selects on a touch landing or travelling onto an item, and confirms on a lift inside it", async () => {
    const touch = { device: "touch", id: 11 } as const;
    const c = center(h, 1);
    h.pointerDown(c.x, c.y, touch);
    await h.step();
    expect(h.snap().menuIndex).toBe(1);
    h.pointerUp(c.x, c.y, touch);
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().mode).toBe("versus");

    h.pose((s) => h.debug.reset(s));
    const d = center(h, 2);
    h.pointerDown(5, 5, touch);
    h.pointerMove(d.x, d.y, touch);
    await h.step();
    expect(h.snap().menuIndex).toBe(2);
    h.pointerUp(d.x, d.y, touch);
    await h.step();
    expect(h.snap().screen).toBe("title");
  });

  it("lets a pointer selection override a keyboard move on the same frame", async () => {
    const c = center(h, 2);
    h.tap("KeyS");
    h.pointerMove(c.x, c.y);
    await h.step();
    expect(h.snap().menuIndex).toBe(2);
  });

  it("confirms the keyboard's item alone when both confirm on one frame", async () => {
    const c = center(h, 2);
    h.tap("Enter");
    h.pointerDown(c.x, c.y);
    h.pointerUp(c.x, c.y);
    await h.step();
    expect(h.snap().screen).toBe("countdown");
    expect(h.snap().mode).toBe("solo");
  });

  it("ignores the secondary button", async () => {
    const c = center(h, 2);
    h.pointerDown(c.x, c.y, { button: 2 });
    h.pointerUp(c.x, c.y, { button: 2 });
    await h.step();
    expect(h.snap().screen).toBe("title");
  });

  it("drives the pause and match-over menus the same way", async () => {
    h.pose((s) => h.debug.setScreen(s, "paused"));
    let c = center(h, 2);
    h.pointerDown(c.x, c.y);
    h.pointerUp(c.x, c.y);
    await h.step();
    expect(h.snap().screen).toBe("title");

    h.pose((s) => h.debug.setScreen(s, "matchover"));
    c = center(h, 0);
    h.pointerDown(c.x, c.y);
    h.pointerUp(c.x, c.y);
    await h.step();
    expect(h.snap().screen).toBe("countdown");
  });

  it("does nothing on the live field", async () => {
    h.pose((s) => h.debug.setScreen(s, "playing"));
    h.pointerDown(640, 360);
    h.pointerUp(640, 360);
    await h.step();
    expect(h.snap().screen).toBe("playing");
    expect(h.snap().menuIndex).toBe(0);
  });
});
