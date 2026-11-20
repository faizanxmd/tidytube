/*
 * Tidy Tube: tell YouTube "Not interested".
 *
 * Hiding a card is invisible to YouTube, so it keeps recommending the same
 * things forever. For every Filters category with Tell on (js/junk.js), Tidy
 * Tube opens YouTube's own ⋮ menu on matching cards and picks "Not
 * interested", exactly as you would by hand: a few per page, one at a time,
 * spaced out, never the same video twice.
 *
 * Where: Home, and the "Watch next" sidebar on watch pages (Google's two
 * recommendation surfaces). YouTube swaps an answered card for a "Video
 * removed / Undo" notice; that stays hidden.
 *
 * Needs a signed-in, English YouTube (it looks for "Not interested" by
 * name); otherwise it backs off for the rest of the page.
 */
(() => {
  "use strict";

  const { pick, cardKey } = globalThis.tidyMenu;
  const junk = globalThis.tidyJunk;

  const TOLD_KEY = "tidy_told";
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

  // the old key too, in case this tab loads before js/background.js moves it
  chrome.storage.local.get([TOLD_KEY, "kempt_told"], (got) => {
    told = new Set(got[TOLD_KEY] || got.kempt_told || []);
  });

  function remember(key) {
    told.add(key);
    chrome.storage.local.set({ [TOLD_KEY]: [...told].slice(-MAX_TOLD) });
  }

  function candidates() {
    const where = SURFACES[location.pathname];
    if (!where || !junk.anyTell()) return [];
    return [...document.querySelectorAll(where)].filter((c) => {
      const key = cardKey(c);
      return key && !c.hasAttribute("data-tidy-told") && !told.has(key) && !tried.has(key) && junk.tells(c);
    });
  }

  async function run() {
    timer = 0;
    if (running || !junk.anyTell()) return;
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
        card.setAttribute("data-tidy-told", key);
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
    for (const c of document.querySelectorAll("[data-tidy-told]")) {
      const key = cardKey(c);
      if (key && key !== c.getAttribute("data-tidy-told")) c.removeAttribute("data-tidy-told");
    }
  }

  junk.ready.then(() => schedule(FIRST_DELAY));
  window.addEventListener("tidy-filters", () => {
    if (!running) schedule(FIRST_DELAY);
  });

  window.addEventListener("yt-navigate-finish", () => {
    navCount++;
    schedule(FIRST_DELAY);
  });
  window.addEventListener("tidy-scan", () => {
    unmarkRecycled();
    if (!running && !timer) schedule(FIRST_DELAY);
  });
})();
