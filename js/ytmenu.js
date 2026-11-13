/*
 * kempt: drive YouTube's own ⋮ menu on a card, the way you would by hand.
 *
 * Shared by js/tell.js ("Not interested") and js/history.js ("Remove from
 * watch history"). Content scripts share one isolated world, so this hangs
 * off globalThis.kemptMenu for the files loaded after it.
 *
 * The menu is made invisible (html[kempt-busy], css/content.css) while
 * kempt uses it, so nothing flashes on screen.
 */
(() => {
  "use strict";

  const MENU_BUTTON = [
    ".ytLockupMetadataViewModelMenuButton button",
    'button[aria-label="More actions"]',
    'button[aria-label="Action menu"]',
    "ytd-menu-renderer #button button",
    "ytd-menu-renderer button",
  ].join(",");
  const MENU_ITEMS = "yt-list-item-view-model, ytd-menu-service-item-renderer";

  const html = document.documentElement;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function openDropdown() {
    for (const d of document.querySelectorAll("ytd-popup-container tp-yt-iron-dropdown")) {
      if (getComputedStyle(d).display !== "none" && d.getAttribute("aria-hidden") !== "true") return d;
    }
    return null;
  }

  // the matching item, false if the menu opened without one, null if no menu
  async function findItem(pattern, ms) {
    for (let t = 0; t < ms; t += 100) {
      const d = openDropdown();
      if (d) {
        const items = [...d.querySelectorAll(MENU_ITEMS)];
        if (items.length) return items.find((i) => pattern.test(i.textContent.trim())) || false;
      }
      await sleep(100);
    }
    return null;
  }

  function closeMenu() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true })
    );
  }

  /*
   * Pick the item whose text matches `pattern` from `card`'s ⋮ menu.
   * `direct` optionally names a button on the card itself that does the same
   * job without a menu (older layouts put "Remove from watch history" there).
   * Returns "done", "no-button", "no-menu" or "no-item".
   */
  async function pick(card, pattern, direct) {
    const shortcut = direct && card.querySelector(direct);
    if (shortcut) {
      shortcut.click();
      return "done";
    }
    const button = card.querySelector(MENU_BUTTON);
    if (!button) return "no-button";
    html.setAttribute("kempt-busy", "");
    try {
      button.click();
      const item = await findItem(pattern, 2500);
      if (!item) {
        closeMenu();
        return item === false ? "no-item" : "no-menu";
      }
      (item.querySelector(".ytListItemViewModelLayoutWrapper, tp-yt-paper-item") || item).click();
      return "done";
    } finally {
      await sleep(400);
      if (openDropdown()) closeMenu();
      html.removeAttribute("kempt-busy");
    }
  }

  // video id, or playlist id for album and Mix cards without one
  function cardKey(card) {
    const a = card.querySelector('a[href*="/watch?v="], a[href*="list="]');
    if (!a) return null;
    const q = new URL(a.href, location.origin).searchParams;
    return q.get("v") || q.get("list");
  }

  // the same rules css/content.css hides music and Mixes by
  const MUSIC =
    ':has(path[d^="M5.5 1.383V6.88"], path[d^="M11 2.766v10.99"], .badge-style-type-verified-artist,' +
    ' [aria-label="Official Artist Channel"], a[href*="list=OLAK5uy_"]), [data-kempt-music]';
  const MIX = ':has(a[href*="list=RD"], a[href*="start_radio=1"]), [data-kempt-mix]';

  globalThis.kemptMenu = { pick, cardKey, sleep, MUSIC, MIX };
})();
