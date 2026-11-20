/*
 * Tidy Tube content script.
 *
 * Runs at document_start. Two responsibilities:
 *   1. Mirror settings from chrome.storage as presence-attributes on <html>
 *      so css/content.css can hide things declaratively (no flicker).
 *   2. Mark what CSS cannot identify: videos your filters match (js/junk.js),
 *      and shelves and chips only recognisable by their text.
 */
(() => {
  "use strict";

  // Music and Mixes hiding come from your filters (js/junk.js sets those attributes)
  const DEFAULTS = {
    hide_shorts: true,
    show_hn: true,
  };

  const html = document.documentElement;

  // sync storage when available, with local as fallback (mirrors what
  // popup.js does, so both always read/write the same place)
  const store =
    chrome.storage && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;

  const attrName = (key) => "tidy-" + key.replace(/_/g, "-");

  function applySetting(key, on) {
    html.toggleAttribute(attrName(key), !!on);
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

  // YouTube recycles elements in place, so each one is re-decided whenever
  // anything inside it changes rather than remembered. Toggling attributes
  // doesn't trip the childList observer below.
  function decide(e) {
    if (e.matches(CARDS)) {
      // your filters (js/junk.js): music and Mixes only text gives away, and
      // anything a category with Hide matches
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

  // Pages like History grow to thousands of cards, so after the first pass
  // only what changed is re-decided: the cards around each mutation (a card
  // nested in another marks both) and any cards inside what was added.
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
    // js/guide.js, js/tell.js and js/history.js re-check after every pass
    window.dispatchEvent(new Event("tidy-scan"));
  }

  // the History page shows what you watched, music included (hiding it there
  // also left YouTube's "load more" spinner on screen, so it never stopped
  // loading); css/content.css keys off this
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
    // Debounced scan of what changed; new cards arrive constantly while scrolling
    let scheduled = false;
    let touched = new Set(); // where something changed
    let added = new Set(); // new subtrees, which are looked inside as well
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

    // YouTube is a single-page app; this event fires on every route change
    window.addEventListener("yt-navigate-finish", () => {
      markPage();
      scan();
    });
    // js/junk.js loaded or changed your filters
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
