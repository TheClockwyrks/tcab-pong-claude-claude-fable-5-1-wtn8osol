// The ball: sub-stepped flight, spin, collisions, the serve, and scoring
// (specs/balls.md and specs/playfield.md). Everything here is a pure function of
// the values it is handed; the cues an event raises are reported back as flags.

import {
  BALL_R,
  FIELD_H,
  FIELD_W,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type { Rect } from "./constants";
import type {
  BallState,
  ObstacleState,
  PaddleState,
  ReadonlyState,
  Side,
} from "./game";
import { clamp } from "./world";

/** Which collision events a frame raised, each at most once. */
export interface Hits {
  paddle: boolean;
  wall: boolean;
  obstacle: boolean;
  score: boolean;
}

export function noHits(): Hits {
  return { paddle: false, wall: false, obstacle: false, score: false };
}

/** The four faces of an axis-aligned rectangle a ball can strike. */
type Face = "left" | "right" | "top" | "bottom";

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

export function speedOf(ball: { vx: number; vy: number }): number {
  return Math.hypot(ball.vx, ball.vy);
}

/**
 * The circle-against-rectangle rule: the face a ball at `(x, y)` strikes on
 * `rect`, or `null` when its center is not strictly inside the rectangle
 * expanded by `BALL_R`. A tie goes to the first of left, right, top, bottom.
 */
export function struckFace(x: number, y: number, rect: Rect): Face | null {
  const left = x - (rect.x0 - BALL_R);
  const right = rect.x1 + BALL_R - x;
  const top = y - (rect.y0 - BALL_R);
  const bottom = rect.y1 + BALL_R - y;
  if (left <= 0 || right <= 0 || top <= 0 || bottom <= 0) return null;
  const least = Math.min(left, right, top, bottom);
  if (left === least) return "left";
  if (right === least) return "right";
  if (top === least) return "top";
  return "bottom";
}

/** Places the ball off `face` and reverses the velocity component into it. */
function deflect(body: Body, rect: Rect, face: Face): void {
  switch (face) {
    case "left":
      body.x = rect.x0 - BALL_R;
      if (body.vx > 0) body.vx = -body.vx;
      break;
    case "right":
      body.x = rect.x1 + BALL_R;
      if (body.vx < 0) body.vx = -body.vx;
      break;
    case "top":
      body.y = rect.y0 - BALL_R;
      if (body.vy > 0) body.vy = -body.vy;
      break;
    case "bottom":
      body.y = rect.y1 + BALL_R;
      if (body.vy < 0) body.vy = -body.vy;
      break;
  }
}

function paddleRect(side: Side, paddle: PaddleState): Rect {
  return {
    x0: side === "left" ? P1_X0 : P2_X0,
    x1: side === "left" ? P1_X1 : P2_X1,
    y0: paddle.cy - PADDLE_HALF,
    y1: paddle.cy + PADDLE_HALF,
  };
}

/** The paddle bounce: angle from the contact point, speed-up, spin, placement. */
function paddleBounce(body: Body, side: Side, paddle: PaddleState): void {
  const offset = clamp((body.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(speedOf(body) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  body.vx = dir * speed * Math.cos(theta);
  body.vy = speed * Math.sin(theta);
  body.spin = clamp(
    body.spin + paddle.vy * SPIN_FROM_PADDLE,
    -SPIN_CLAMP,
    SPIN_CLAMP,
  );
  body.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
}

function resolvePaddle(
  body: Body,
  side: Side,
  paddle: PaddleState,
  hits: Hits,
): void {
  const rect = paddleRect(side, paddle);
  const face = struckFace(body.x, body.y, rect);
  if (face === null) return;
  if (face === "left" || face === "right") {
    paddleBounce(body, side, paddle);
    hits.paddle = true;
  } else {
    deflect(body, rect, face);
    hits.wall = true;
  }
}

function resolveObstacle(body: Body, obstacle: ObstacleState, hits: Hits) {
  const rect = OBSTACLES[obstacle.index];
  if (rect === undefined) return;
  const face = struckFace(body.x, body.y, rect);
  if (face === null) return;
  deflect(body, rect, face);
  hits.obstacle = true;
}

function resolveWalls(body: Body, hits: Hits): void {
  if (body.y - BALL_R < 0 && body.vy < 0) {
    body.y = BALL_R;
    body.vy = -body.vy;
    hits.wall = true;
  } else if (body.y + BALL_R > FIELD_H && body.vy > 0) {
    body.y = FIELD_H - BALL_R;
    body.vy = -body.vy;
    hits.wall = true;
  }
}

/** One sub-step of `h` seconds: spin turns, spin decays, advance, collide. */
function subStep(
  body: Body,
  h: number,
  paddles: ReadonlyState["paddles"],
  obstacles: readonly ObstacleState[],
  hits: Hits,
): void {
  const speed = speedOf(body);
  if (speed > 0) {
    const angle = (body.spin / speed) * h;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const vx = body.vx * c - body.vy * s;
    const vy = body.vx * s + body.vy * c;
    body.vx = vx;
    body.vy = vy;
  }
  body.spin *= Math.pow(0.5, h / SPIN_HALFLIFE);
  body.x += body.vx * h;
  body.y += body.vy * h;

  resolveWalls(body, hits);
  resolvePaddle(body, "left", paddles.left, hits);
  resolvePaddle(body, "right", paddles.right, hits);
  for (const obstacle of obstacles) resolveObstacle(body, obstacle, hits);
}

/**
 * Advances a flying ball by `dt` seconds in sub-steps of at most `MAX_SUBSTEP`
 * units of travel each, recording the collision events in `hits`.
 */
export function flyBall(
  ball: BallState,
  dt: number,
  paddles: ReadonlyState["paddles"],
  obstacles: readonly ObstacleState[],
  hits: Hits,
): BallState {
  const body: Body = {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    spin: ball.spin,
  };
  const n = Math.max(1, Math.ceil((speedOf(body) * dt) / MAX_SUBSTEP));
  const h = dt / n;
  for (let i = 0; i < n; i += 1) subStep(body, h, paddles, obstacles, hits);
  return { ...ball, ...body };
}

/** The ball on the frame it is served toward `receiver`. */
export function serveBall(ball: BallState, receiver: Side): BallState {
  const dir = receiver === "left" ? -1 : 1;
  return {
    ...ball,
    held: false,
    holdTimer: 0,
    trail: [],
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
}

/** The side that scored once the ball has passed a goal, or `null`. */
export function scorer(ball: BallState): Side | null {
  if (ball.x - BALL_R > FIELD_W) return "left";
  if (ball.x + BALL_R < 0) return "right";
  return null;
}

/** The win rule: the side that has won at `score`, or `null` while play goes on. */
export function matchWinner(score: { p1: number; p2: number }): Side | null {
  if (score.p1 >= WIN_SCORE && score.p1 - score.p2 >= WIN_LEAD) return "left";
  if (score.p2 >= WIN_SCORE && score.p2 - score.p1 >= WIN_LEAD) return "right";
  return null;
}
