/*
 * Tidy Tube content script.
 *
 * Runs at document_start. Two responsibilities:
 *   1. Mirror settings from chrome.storage as presence-attributes on <html>
 *      so css/content.css and css/guide.css react declaratively (no flicker).
 *   2. Mark what CSS cannot identify: videos your enabled filters match
 *      (js/junk.js), plus shelves and chips only recognisable by their text.
 */
(() => {
  "use strict";

  const DEFAULTS = {
    hide_shorts: true,
    show_hn: true,
  };

  const html = document.documentElement;
  const store =
    chrome.storage && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;

  function applySetting(key, on) {
    if (key === "show_hn") {
      // Inverse attribute: sidebar entry is visible by default unless explicitly off
      html.toggleAttribute("tidy-hide-hn", !on);
    } else {
      html.toggleAttribute("tidy-" + key.replace(/_/g, "-"), !!on);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Text detection (English titles, best effort)                      */
  /* ---------------------------------------------------------------- */

  const MUSIC_SHELF = /\b(?:music|albums?|songs?)\b/i;
  const MIX_TITLE = /\bmix(?:es)?\b/i;

  const CARDS =
    "ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-compact-video-renderer";
  const SHELVES = "ytd-rich-section-renderer";
  const CHIPS = "yt-chip-cloud-chip-renderer, chip-view-model";
  const ANY = [CARDS, SHELVES, CHIPS].join(",");

  function decide(e) {
    if (e.matches(CARDS)) {
      const junk = globalThis.tidyJunk;
      if (!junk) return;
      e.toggleAttribute("data-tidy-music", junk.musicByText(e));
      e.toggleAttribute("data-tidy-mix", junk.mixByText(e));
      e.toggleAttribute("data-tidy-junk", junk.hides(e));
    } else if (e.matches(SHELVES)) {
      const title = e.querySelector("#title");
      const text = title ? title.textContent : "";
      e.toggleAttribute("data-tidy-music", MUSIC_SHELF.test(text));
      e.toggleAttribute("data-tidy-mix", MIX_TITLE.test(text));
    } else {
      const text = e.textContent.trim();
      e.toggleAttribute("data-tidy-music", /^music$/i.test(text));
      e.toggleAttribute("data-tidy-mix", /^mix(?:es)?$/i.test(text));
      e.toggleAttribute("data-tidy-shorts", /^shorts$/i.test(text));
    }
  }

  function scan(touched, added) {
    const todo = new Set();
    if (!touched) {
      for (const e of document.querySelectorAll(ANY)) todo.add(e);
    } else {
      for (const n of touched) {
        if (!n.isConnected) continue;
        for (let e = n.closest(ANY); e; e = e.parentElement && e.parentElement.closest(ANY)) todo.add(e);
        if (added.has(n)) for (const e of n.querySelectorAll(ANY)) todo.add(e);
      }
    }
    for (const e of todo) decide(e);
    window.dispatchEvent(new Event("tidy-scan"));
  }

  // History always shows everything you watched so you can inspect and clean it
  function markPage() {
    html.toggleAttribute("tidy-on-history", location.pathname === "/feed/history");
  }

  /* ---------------------------------------------------------------- */
  /* Wiring                                                            */
  /* ---------------------------------------------------------------- */

  store.get(DEFAULTS, (settings) => {
    for (const key of Object.keys(DEFAULTS)) applySetting(key, settings[key]);
  });

  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in DEFAULTS) applySetting(key, newValue);
    }
  });

  function startObserving() {
    let scheduled = false;
    let touched = new Set();
    let added = new Set();
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.target.nodeType === 1) touched.add(r.target);
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          touched.add(n);
          added.add(n);
        }
      }
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        const t = touched, a = added;
        touched = new Set();
        added = new Set();
        scan(t, a);
      }, 100);
    }).observe(document.body, { childList: true, subtree: true });

    window.addEventListener("yt-navigate-finish", () => {
      markPage();
      scan();
    });
    window.addEventListener("tidy-filters", () => scan());
    markPage();
    scan();
  }

  if (document.body) {
    startObserving();
  } else {
    window.addEventListener("DOMContentLoaded", startObserving, { once: true });
  }
})();
