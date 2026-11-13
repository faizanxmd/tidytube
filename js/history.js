/*
 * kempt: "Remove music from history" on YouTube's History page.
 *
 * YT Music and YouTube share one watch history, so every song played in YT
 * Music tells YouTube you want music. Removing a video from your history is
 * a stronger signal than "Not interested" (Mozilla's 2022 study), and it
 * takes the music out of what YouTube recommends from.
 *
 * Adds one button to the History page's action column, styled like its
 * neighbours. Pressing it (after a confirm) walks your history and, for each
 * entry kempt recognises as music or a Mix, picks "Remove from watch
 * history" from YouTube's own ⋮ menu. It scrolls to load more, up to 300 a
 * run, and can be stopped. Nothing happens unless you press it.
 */
(() => {
  "use strict";

  const { pick, cardKey, sleep, MUSIC, MIX } = globalThis.kemptMenu;

  const PAGE = 'ytd-browse[page-subtype="history"]';
  const ENTRIES = PAGE + " :is(yt-lockup-view-model, ytd-video-renderer)";
  const DIRECT = 'button[aria-label^="Remove from" i]'; // older layouts: an ✕ on the entry
  const ITEM = /^remove from (watch )?history/i;
  const CAP = 300;
  const GAP = [500, 1100]; // ms between removals
  // Material "music_off"
  const ICON =
    "M4.27 3 3 4.27l9 9v.28c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4v-1.73L19.73 21 21 19.73 4.27 3zM14 7h4V3h-6v5.18l2 2z";

  let running = false;
  let stop = false;
  const tried = new Set();

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function build() {
    const wrap = el("div");
    wrap.id = "kempt-clean";
    const b = el("button", "kempt-clean-btn");
    b.type = "button";
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", ICON);
    svg.append(p);
    b.append(svg, el("span", null, "Remove music from history"));
    b.addEventListener("click", () => (running ? (stop = true) : clean()));
    wrap.append(b, el("div", "kempt-clean-status"));
    return wrap;
  }

  function ensureButton() {
    if (location.pathname !== "/feed/history" || document.getElementById("kempt-clean")) return;
    const page = document.querySelector(PAGE);
    const contents = page && page.querySelector("ytd-browse-feed-actions-renderer #contents");
    if (contents) contents.prepend(build());
  }

  function setUi(label, status) {
    const w = document.getElementById("kempt-clean");
    if (!w) return;
    if (label) w.querySelector("span").textContent = label;
    if (status != null) w.querySelector(".kempt-clean-status").textContent = status;
  }

  function candidates() {
    const rule = MUSIC + "," + MIX;
    return [...document.querySelectorAll(ENTRIES)].filter((c) => {
      const key = cardKey(c);
      return key && !tried.has(key) && !c.hasAttribute("data-kempt-removed") && c.matches(rule);
    });
  }

  async function clean() {
    if (
      !confirm(
        "Remove music and Mixes from your YouTube watch history?\n\n" +
          "kempt removes up to " + CAP + " entries it recognises as music, the same as " +
          "using each one's ⋮ → Remove from watch history. This can't be undone."
      )
    ) {
      return;
    }
    running = true;
    stop = false;
    let removed = 0;
    let misses = 0;
    let idle = 0;
    setUi("Stop", "Looking for music…");
    try {
      while (!stop && removed < CAP && location.pathname === "/feed/history") {
        const c = candidates()[0];
        if (!c) {
          if (++idle > 3) break; // nothing more loads
          window.scrollTo(0, document.documentElement.scrollHeight);
          await sleep(2000);
          continue;
        }
        idle = 0;
        tried.add(cardKey(c));
        const result = await pick(c, ITEM, DIRECT);
        if (result === "done") {
          c.setAttribute("data-kempt-removed", "");
          removed++;
          misses = 0;
          setUi(null, "Removed " + removed + "…");
        } else if (++misses >= 3) {
          setUi(null, "YouTube's menu has no “Remove from watch history” here. Are you signed in, in English?");
          return;
        }
        await sleep(GAP[0] + Math.random() * (GAP[1] - GAP[0]));
      }
      setUi(
        null,
        removed
          ? "Removed " + removed + (removed === 1 ? " entry." : " entries.") + (removed >= CAP ? " Press again for more." : "")
          : "No music found in what's loaded."
      );
    } finally {
      running = false;
      setUi("Remove music from history");
    }
  }

  window.addEventListener("yt-navigate-finish", ensureButton);
  window.addEventListener("kempt-scan", ensureButton);
})();
