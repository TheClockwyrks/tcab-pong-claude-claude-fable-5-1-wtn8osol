// Drawing Carom: the field and its furniture, the match HUD, and each screen's
// overlay (specs/overview.md, specs/ui.md). Everything is drawn in logical
// coordinates on the 1280x720 field; nothing here reads the canvas size.

import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  TITLE_TEXT,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type { BallState, ObstacleState, ReadonlyState, Screen } from "./game";
import { menuItems, menuRects } from "./menus";

type Ctx = CanvasRenderingContext2D;

// ---- Palette -------------------------------------------------------------

const COLOR = {
  fieldEdge: "rgba(120, 140, 200, 0.18)",
  line: "rgba(190, 205, 255, 0.22)",
  net: "rgba(190, 205, 255, 0.28)",
  leftPaddle: "#35d6ff",
  rightPaddle: "#ff7a45",
  ball: "#fff3b0",
  obstacle: "#b48bff",
  text: "#eef1fb",
  dimText: "rgba(238, 241, 251, 0.6)",
  faintText: "rgba(238, 241, 251, 0.38)",
  accent: "#ffd166",
  accentText: "#1a1206",
  scrim: "rgba(6, 8, 16, 0.72)",
  panel: "rgba(14, 20, 40, 0.92)",
  item: "rgba(255, 255, 255, 0.07)",
  itemEdge: "rgba(255, 255, 255, 0.16)",
} as const;

const FONT = "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";

function font(weight: number, size: number): string {
  return `${weight} ${size}px ${FONT}`;
}

function text(
  ctx: Ctx,
  copy: string,
  x: number,
  y: number,
  size: number,
  options: {
    weight?: number;
    color?: string;
    align?: CanvasTextAlign;
    glow?: string;
  } = {},
): void {
  ctx.save();
  ctx.font = font(options.weight ?? 600, size);
  ctx.fillStyle = options.color ?? COLOR.text;
  ctx.textAlign = options.align ?? "center";
  ctx.textBaseline = "middle";
  if (options.glow !== undefined) {
    ctx.shadowColor = options.glow;
    ctx.shadowBlur = 24;
  }
  ctx.fillText(copy, x, y);
  ctx.restore();
}

function glowBar(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  radius: number,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.restore();
}

// ---- The field -----------------------------------------------------------

function drawField(ctx: Ctx): void {
  // A soft pool of light at the center so the field reads as a lit table.
  const glow = ctx.createRadialGradient(
    FIELD_CX,
    FIELD_CY,
    40,
    FIELD_CX,
    FIELD_CY,
    760,
  );
  glow.addColorStop(0, "rgba(60, 80, 140, 0.22)");
  glow.addColorStop(1, "rgba(60, 80, 140, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  // The walls: a bright rule along the top and bottom edges.
  ctx.fillStyle = COLOR.line;
  ctx.fillRect(0, 0, FIELD_W, 3);
  ctx.fillRect(0, FIELD_H - 3, FIELD_W, 3);

  // The goal lines behind each paddle, and the center circle.
  ctx.strokeStyle = COLOR.fieldEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(P1_X0 - 20, 3);
  ctx.lineTo(P1_X0 - 20, FIELD_H - 3);
  ctx.moveTo(P2_X0 + PADDLE_W + 20, 3);
  ctx.lineTo(P2_X0 + PADDLE_W + 20, FIELD_H - 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(FIELD_CX, FIELD_CY, 86, 0, Math.PI * 2);
  ctx.stroke();

  // The dashed net. Decoration only; it has no collision.
  ctx.save();
  ctx.strokeStyle = COLOR.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 18]);
  ctx.lineDashOffset = 8;
  ctx.beginPath();
  ctx.moveTo(NET_X, 0);
  ctx.lineTo(NET_X, FIELD_H);
  ctx.stroke();
  ctx.restore();
}

function drawObstacles(ctx: Ctx, obstacles: readonly ObstacleState[]): void {
  for (const o of obstacles) {
    glowBar(
      ctx,
      o.cx - OBSTACLE_W / 2,
      o.cy - OBSTACLE_H / 2,
      OBSTACLE_W,
      OBSTACLE_H,
      COLOR.obstacle,
      OBSTACLE_W / 2,
    );
  }
}

function drawPaddles(ctx: Ctx, paddles: ReadonlyState["paddles"]): void {
  glowBar(
    ctx,
    P1_X0,
    paddles.left.cy - PADDLE_H / 2,
    PADDLE_W,
    PADDLE_H,
    COLOR.leftPaddle,
    PADDLE_W / 2,
  );
  glowBar(
    ctx,
    P2_X0,
    paddles.right.cy - PADDLE_H / 2,
    PADDLE_W,
    PADDLE_H,
    COLOR.rightPaddle,
    PADDLE_W / 2,
  );
}

/** The ball's path over the last `TRAIL_TIME` seconds, fading toward its tail. */
function drawTrail(ctx: Ctx, ball: BallState, simTime: number): void {
  const samples = ball.trail;
  if (samples.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < samples.length; i += 1) {
    const from = samples[i - 1];
    const to = samples[i];
    const age = Math.min(1, Math.max(0, (simTime - to.t) / TRAIL_TIME));
    const strength = 1 - age;
    ctx.strokeStyle = `rgba(255, 243, 176, ${(0.55 * strength).toFixed(3)})`;
    ctx.lineWidth = 2 + strength * (BALL_R * 2 - 4);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  // The last segment runs up to the ball itself.
  const last = samples[samples.length - 1];
  ctx.strokeStyle = "rgba(255, 243, 176, 0.55)";
  ctx.lineWidth = BALL_R * 2 - 2;
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(ball.x, ball.y);
  ctx.stroke();
  ctx.restore();
}

function drawBall(ctx: Ctx, ball: BallState): void {
  ctx.save();
  ctx.fillStyle = COLOR.ball;
  ctx.shadowColor = COLOR.ball;
  ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  // A hot core, so the ball reads as the brightest thing on the field.
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(ball.x - 2, ball.y - 2, BALL_R * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The pre-serve hold: a ring that closes as the hold runs out. */
function drawHold(ctx: Ctx, ball: BallState, receiver: "left" | "right"): void {
  const remaining = Math.max(0, Math.min(HOLD_TIME, ball.holdTimer));
  const fraction = remaining / HOLD_TIME;
  ctx.save();
  ctx.strokeStyle = COLOR.accent;
  ctx.lineWidth = 4;
  ctx.shadowColor = COLOR.accent;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(
    ball.x,
    ball.y,
    BALL_R + 16,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * fraction,
  );
  ctx.stroke();
  ctx.restore();
  const arrow = receiver === "left" ? "◀" : "▶";
  const dx = receiver === "left" ? -60 : 60;
  text(ctx, arrow, ball.x + dx, ball.y, 26, { color: COLOR.accent });
}

function drawFurniture(ctx: Ctx, state: ReadonlyState): void {
  drawField(ctx);
  drawObstacles(ctx, state.obstacles);
  drawPaddles(ctx, state.paddles);
  if (state.ball !== null) {
    if (!state.ball.held) drawTrail(ctx, state.ball, state.simTime);
    drawBall(ctx, state.ball);
  }
}

// ---- The HUD -------------------------------------------------------------

function modeLabel(state: ReadonlyState): string {
  const who = state.mode === "solo" ? "SOLO · YOU vs AI" : "VERSUS · P1 vs P2";
  return `${who} · FIRST TO ${WIN_SCORE}, WIN BY ${WIN_LEAD}`;
}

function drawHud(ctx: Ctx, state: ReadonlyState): void {
  text(ctx, String(state.score.p1), FIELD_CX - 110, 64, 72, {
    weight: 700,
    color: COLOR.leftPaddle,
    glow: COLOR.leftPaddle,
  });
  text(ctx, String(state.score.p2), FIELD_CX + 110, 64, 72, {
    weight: 700,
    color: COLOR.rightPaddle,
    glow: COLOR.rightPaddle,
  });
  text(ctx, modeLabel(state), FIELD_CX, FIELD_H - 22, 15, {
    weight: 500,
    color: COLOR.faintText,
  });
}

// ---- Menus and overlays --------------------------------------------------

function drawScrim(ctx: Ctx): void {
  ctx.fillStyle = COLOR.scrim;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawMenu(ctx: Ctx, screen: Screen, menuIndex: number): void {
  const items = menuItems(screen);
  const rects = menuRects(screen);
  if (items === null || rects === null) return;
  items.forEach((label, i) => {
    const r = rects[i];
    const selected = i === menuIndex;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 12);
    if (selected) {
      ctx.fillStyle = COLOR.accent;
      ctx.shadowColor = COLOR.accent;
      ctx.shadowBlur = 24;
      ctx.fill();
    } else {
      ctx.fillStyle = COLOR.item;
      ctx.fill();
      ctx.strokeStyle = COLOR.itemEdge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
    text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, 24, {
      weight: 700,
      color: selected ? COLOR.accentText : COLOR.text,
    });
  });
}

function drawTitle(ctx: Ctx, state: ReadonlyState): void {
  drawScrim(ctx);
  text(ctx, TITLE_TEXT, FIELD_CX, 210, 132, {
    weight: 800,
    color: COLOR.text,
    glow: COLOR.leftPaddle,
  });
  text(ctx, "A TOP-DOWN PADDLE DUEL", FIELD_CX, 296, 20, {
    weight: 500,
    color: COLOR.dimText,
  });
  text(
    ctx,
    "Spin the ball with a moving paddle. Bank it off the posts.",
    FIELD_CX,
    336,
    17,
    {
      weight: 400,
      color: COLOR.faintText,
    },
  );
  drawMenu(ctx, "title", state.menuIndex);
  text(
    ctx,
    "W/S or ▲/▼ to choose · ENTER to confirm · M to mute",
    FIELD_CX,
    FIELD_H - 36,
    15,
    { weight: 400, color: COLOR.faintText },
  );
}

const HOWTO_LINES: readonly (readonly [string, string])[] = [
  ["PLAYER ONE", "W and S move the left paddle."],
  ["PLAYER TWO", "▲ and ▼ move the right paddle. In Solo, the AI takes it."],
  ["PAUSE", "P or ESC pauses. M mutes the sound."],
  [
    "SPIN",
    "Strike the ball while your paddle is moving and its flight curves that way.",
  ],
  [
    "BANK SHOTS",
    "Two posts stand mid-field. Carom the ball off them to wrong-foot your rival.",
  ],
  [
    "WINNING",
    `First to ${WIN_SCORE} points, leading by ${WIN_LEAD}. The player who concedes receives.`,
  ],
];

function drawHowto(ctx: Ctx, state: ReadonlyState): void {
  drawScrim(ctx);
  ctx.save();
  ctx.fillStyle = COLOR.panel;
  ctx.strokeStyle = COLOR.itemEdge;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(160, 70, 960, 530, 18);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  text(ctx, "HOW TO PLAY", FIELD_CX, 120, 40, {
    weight: 800,
    glow: COLOR.leftPaddle,
  });
  HOWTO_LINES.forEach(([heading, body], i) => {
    const y = 190 + i * 66;
    text(ctx, heading, 210, y, 18, {
      weight: 700,
      color: COLOR.accent,
      align: "left",
    });
    text(ctx, body, 210, y + 26, 18, {
      weight: 400,
      color: COLOR.dimText,
      align: "left",
    });
  });
  drawMenu(ctx, "howto", state.menuIndex);
}

function drawPaused(ctx: Ctx, state: ReadonlyState): void {
  drawScrim(ctx);
  text(ctx, "PAUSED", FIELD_CX, 250, 72, {
    weight: 800,
    glow: COLOR.accent,
  });
  text(ctx, "P or ESC resumes", FIELD_CX, 306, 17, {
    weight: 400,
    color: COLOR.faintText,
  });
  drawMenu(ctx, "paused", state.menuIndex);
}

function winnerCopy(state: ReadonlyState): [string, string] {
  const side = state.winner ?? "left";
  const headline = side === "left" ? "LEFT SIDE WINS" : "RIGHT SIDE WINS";
  if (state.mode === "solo") {
    return [
      headline,
      side === "left" ? "You take the match." : "The AI takes the match.",
    ];
  }
  return [
    headline,
    side === "left"
      ? "Player one takes the match."
      : "Player two takes the match.",
  ];
}

function drawMatchover(ctx: Ctx, state: ReadonlyState): void {
  drawScrim(ctx);
  const [headline, sub] = winnerCopy(state);
  const color = state.winner === "right" ? COLOR.rightPaddle : COLOR.leftPaddle;
  text(ctx, headline, FIELD_CX, 200, 64, { weight: 800, color, glow: color });
  text(ctx, sub, FIELD_CX, 256, 20, { weight: 400, color: COLOR.dimText });
  text(ctx, `${state.score.p1}  –  ${state.score.p2}`, FIELD_CX, 350, 88, {
    weight: 800,
    glow: COLOR.text,
  });
  text(ctx, "FINAL SCORE", FIELD_CX, 408, 16, {
    weight: 500,
    color: COLOR.faintText,
  });
  drawMenu(ctx, "matchover", state.menuIndex);
}

// ---- The frame -----------------------------------------------------------

export function renderGame(state: ReadonlyState, ctx: Ctx): void {
  drawFurniture(ctx, state);
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      break;
    case "howto":
      drawHowto(ctx, state);
      break;
    case "countdown":
      drawHud(ctx, state);
      if (state.ball !== null) drawHold(ctx, state.ball, state.receiver);
      break;
    case "playing":
      drawHud(ctx, state);
      break;
    case "paused":
      drawHud(ctx, state);
      drawPaused(ctx, state);
      break;
    case "matchover":
      drawHud(ctx, state);
      drawMatchover(ctx, state);
      break;
  }
  // Leave no path behind, so the next frame opens on a clean context.
  ctx.beginPath();
}
