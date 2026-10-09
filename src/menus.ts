// The menus: which items each screen shows, where each item sits, and what
// confirming one does (specs/ui.md).

import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { CaromState, MenuItemRect, ReadonlyState, Screen } from "./game";
import { returnToTitle, startMatch } from "./world";

/** The copy of the how-to screen's single item, which the build chooses. */
export const HOWTO_ITEMS = ["BACK"] as const;

const ITEM_W = 360;
const ITEM_H = 56;
const ITEM_GAP = 14;

function column(top: number, count: number): MenuItemRect[] {
  const rects: MenuItemRect[] = [];
  for (let i = 0; i < count; i += 1) {
    rects.push({
      x: FIELD_CX - ITEM_W / 2,
      y: top + i * (ITEM_H + ITEM_GAP),
      w: ITEM_W,
      h: ITEM_H,
    });
  }
  return rects;
}

/** The items the menu on `screen` shows, or `null` for a screen with no menu. */
export function menuItems(screen: Screen): readonly string[] | null {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return HOWTO_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    case "countdown":
    case "playing":
      return null;
  }
}

/** Every item's hit region on `screen`, in item order, or `null` for no menu. */
export function menuRects(screen: Screen): readonly MenuItemRect[] | null {
  switch (screen) {
    case "title":
      return column(392, TITLE_ITEMS.length);
    case "howto":
      return column(628, HOWTO_ITEMS.length);
    case "paused":
      return column(352, PAUSE_ITEMS.length);
    case "matchover":
      return column(452, MATCHOVER_ITEMS.length);
    case "countdown":
    case "playing":
      return null;
  }
}

export function menuItemRect(
  screen: Screen,
  index: number,
): MenuItemRect | null {
  return menuRects(screen)?.[index] ?? null;
}

/** The index of the item whose region holds `(x, y)`, or `null`. */
export function itemAt(screen: Screen, x: number, y: number): number | null {
  const rects = menuRects(screen);
  if (rects === null) return null;
  const index = rects.findIndex(
    (r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
  );
  return index === -1 ? null : index;
}

/** `menuIndex` moved by `step` over the current menu, wrapping both ways. */
export function moveMenu(state: ReadonlyState, step: 1 | -1): CaromState {
  const count = menuItems(state.screen)?.length ?? 0;
  if (count === 0) return { ...state };
  return { ...state, menuIndex: (state.menuIndex + step + count) % count };
}

/** Confirms the item at `menuIndex` on the current screen. */
export function confirmMenu(state: ReadonlyState): CaromState {
  switch (state.screen) {
    case "title": {
      const remembered = { ...state, titleIndex: state.menuIndex };
      switch (state.menuIndex) {
        case 0:
          return startMatch(remembered, "solo");
        case 1:
          return startMatch(remembered, "versus");
        default:
          return { ...remembered, screen: "howto", menuIndex: 0 };
      }
    }
    case "howto":
      return returnToTitle(state);
    case "paused":
      switch (state.menuIndex) {
        case 0:
          return { ...state, screen: state.resumeScreen };
        case 1:
          return startMatch(state, state.mode);
        default:
          return returnToTitle(state);
      }
    case "matchover":
      return state.menuIndex === 0
        ? startMatch(state, state.mode)
        : returnToTitle(state);
    case "countdown":
    case "playing":
      return { ...state };
  }
}
