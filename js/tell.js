/*
 * kempt: tell YouTube "Not interested".
 *
 * Hiding a card with CSS is invisible to YouTube, so it keeps recommending
 * the same music and Mixes forever. When this is on, kempt opens YouTube's
 * own ⋮ menu on cards it has hidden and picks "Not interested", exactly as
 * you would by hand: a few per page, one at a time, spaced out.
 *
 * Where: Home, and the "Watch next" sidebar on watch pages (Google's two
 * recommendation surfaces). Only cards hidden as music or Mixes, never one
 * twice. YouTube swaps an answered card for a "Video removed / Undo" notice;
 * that stays hidden too.
 *
 * Needs a signed-in, English YouTube (it looks for "Not interested" by
 * name); otherwise it backs off for the rest of the page.
 */
(() => {
  "use strict";

  const { pick, cardKey, MUSIC, MIX } = globalThis.kemptMenu;

  const store =
    chrome.storage && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;
  const settings = { tell_youtube: true, hide_music: true, hide_mixes: true };

  const TOLD_KEY = "kempt_told";
  const MAX_TOLD = 1000;
  const PER_PAGE = 6; // answers per page (Home visit or video)
  const FIRST_DELAY = 3000; // let the page settle first
  const GAP = [2000, 4500]; // pause between answers, ms

  // where recommendation cards live, per page
  const SURFACES = {
    "/": 'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer #contents > ytd-rich-item-renderer',
    "/watch":
      "#secondary #related :is(yt-lockup-view-model, ytd-compact-video-renderer, ytd-compact-radio-renderer)",
  };

  let told = new Set();
  let budget = 0;
  let page = -1; // navigation the budget belongs to
  let navCount = 0;
  let running = false;
  let misses = 0; // failed attempts on this page: signed out, other language
  const tried = new Set(); // cards attempted, answered or not
  let timer = 0;

  chrome.storage.local.get(TOLD_KEY, (got) => {
    told = new Set(got[TOLD_KEY] || []);
  });

  function remember(key) {
    told.add(key);
    chrome.storage.local.set({ [TOLD_KEY]: [...told].slice(-MAX_TOLD) });
  }

  function candidates() {
    const where = SURFACES[location.pathname];
    if (!where) return [];
    const rules = [settings.hide_music && MUSIC, settings.hide_mixes && MIX].filter(Boolean);
    if (!rules.length) return [];
    const rule = rules.join(",");
    return [...document.querySelectorAll(where)].filter((c) => {
      const key = cardKey(c);
      return key && !c.hasAttribute("data-kempt-told") && c.matches(rule) && !told.has(key) && !tried.has(key);
    });
  }

  async function run() {
    timer = 0;
    if (running || !settings.tell_youtube) return;
    if (page !== navCount) {
      page = navCount;
      budget = PER_PAGE;
      misses = 0;
    }
    if (budget <= 0 || misses >= 2) return;
    const card = candidates()[0];
    if (!card) return;
    running = true;
    try {
      const key = cardKey(card);
      tried.add(key);
      const result = await pick(card, /^not interested$/i);
      if (result === "done") {
        card.setAttribute("data-kempt-told", key);
        remember(key);
        budget--;
      } else {
        misses++;
      }
    } finally {
      running = false;
    }
    schedule(GAP[0] + Math.random() * (GAP[1] - GAP[0]));
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }

  // YouTube recycles card elements: drop the mark once one shows a new video
  function unmarkRecycled() {
    for (const c of document.querySelectorAll("[data-kempt-told]")) {
      const key = cardKey(c);
      if (key && key !== c.getAttribute("data-kempt-told")) c.removeAttribute("data-kempt-told");
    }
  }

  store.get(settings, (got) => {
    Object.assign(settings, got);
    schedule(FIRST_DELAY);
  });
  chrome.storage.onChanged.addListener((changes) => {
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) settings[key] = newValue;
    }
  });

  window.addEventListener("yt-navigate-finish", () => {
    navCount++;
    schedule(FIRST_DELAY);
  });
  window.addEventListener("kempt-scan", () => {
    unmarkRecycled();
    if (!running && !timer) schedule(FIRST_DELAY);
  });
})();
