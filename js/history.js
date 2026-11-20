/*
 * Tidy Tube: "Clean up history" on YouTube's History page.
 *
 * YouTube recommends from your watch history, and YT Music shares it, so
 * whatever piles up there (songs, news, TV clips) is what you get more of.
 * Removing a video from your history is a stronger signal than "Not
 * interested" (Mozilla's 2022 study), and it takes the video out of what
 * YouTube recommends from.
 *
 * Adds one button to the History page's action column, styled like its
 * neighbours. Pressing it (after a confirm) walks your history and, for each
 * entry a Filters category with History on matches (js/junk.js), picks
 * "Remove from watch history" from YouTube's own ⋮ menu. It loads more
 * history as it goes, up to 300 removals and 2000 entries checked a run, and
 * can be stopped. Videos Hacker News recommends are never removed. Nothing
 * happens unless you press it.
 */
(() => {
  "use strict";

  const { pick, cardKey, sleep } = globalThis.tidyMenu;
  const junk = globalThis.tidyJunk;

  const PAGE = 'ytd-browse[page-subtype="history"]';
  const ENTRIES = PAGE + " :is(yt-lockup-view-model, ytd-video-renderer)";
  const DIRECT = 'button[aria-label^="Remove from" i]'; // older layouts: an ✕ on the entry
  const ITEM = /^remove from (watch )?history/i;
  const CAP = 300; // removals a run
  const SCAN_CAP = 2000; // entries checked a run
  const GAP = [400, 900]; // ms between removals
  const LABEL = "Clean up history";
  // Material "delete_sweep"
  const ICON =
    "M15 16h4v2h-4zm0-8h7v2h-7zm0 4h6v2h-6zM3 18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H3v10zM14 5h-3l-1-1H6L5 5H2v2h12z";

  let running = false;
  let stop = false;

  const onHistory = () => location.pathname === "/feed/history";

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function build() {
    const wrap = el("div", "tidy-clean");
    wrap.id = "tidy-clean";
    const b = el("button", "tidy-clean-btn");
    b.type = "button";
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", ICON);
    svg.append(p);
    b.append(svg, el("span", null, LABEL));
    b.addEventListener("click", () => (running ? (stop = true) : clean()));
    wrap.append(b, el("div", "tidy-clean-status"));
    return wrap;
  }

  function ensureButton() {
    if (!onHistory() || document.getElementById("tidy-clean")) return;
    const page = document.querySelector(PAGE);
    const contents = page && page.querySelector("ytd-browse-feed-actions-renderer #contents");
    if (contents) contents.prepend(build());
  }

  function setUi(status) {
    const w = document.getElementById("tidy-clean");
    if (!w) return;
    w.querySelector("span").textContent = running ? "Stop" : LABEL;
    if (status != null) w.querySelector(".tidy-clean-status").textContent = status;
  }

  // YouTube recycles elements: a removed entry's mark goes once it shows another video
  function unmarkRecycled() {
    for (const c of document.querySelectorAll("[data-tidy-removed]")) {
      const key = cardKey(c);
      if (key && key !== c.getAttribute("data-tidy-removed")) c.removeAttribute("data-tidy-removed");
    }
  }

  // Videos in the Hacker News catalogue are never removed. When the
  // extension can't answer (reloaded under the tab), keep the video.
  function inCatalogue(vid) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "hn:known", vids: [vid] }, (r) => {
          if (chrome.runtime.lastError || !r || !Array.isArray(r.known)) resolve(true);
          else resolve(r.known.includes(vid));
        });
      } catch (e) {
        resolve(true);
      }
    });
  }

  // Scroll to the end and wait for YouTube to append more entries.
  // false when nothing came: the end of your history, or YouTube is slow.
  async function loadMore() {
    const before = document.querySelectorAll(ENTRIES).length;
    window.scrollTo(0, document.documentElement.scrollHeight);
    for (let t = 0; t < 4000 && !stop; t += 250) {
      await sleep(250);
      if (document.querySelectorAll(ENTRIES).length > before) {
        await sleep(300); // let the batch finish rendering
        return true;
      }
    }
    return false;
  }

  // "Removed 23 entries (12 Politics & news, 6 Music, 5 TV clips)."
  function summary(counts, removed) {
    const parts = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => n + " " + name);
    return (
      "Removed " + removed + (removed === 1 ? " entry" : " entries") +
      (parts.length ? " (" + parts.join(", ") + ")" : "") + "."
    );
  }

  async function clean() {
    const names = junk.historyNames();
    if (!names.length) {
      setUi("No filter has History on. Turn it on for some in Tidy Tube's Filters page.");
      return;
    }
    if (
      !confirm(
        "Remove these from your YouTube watch history?\n\n" + names.join(", ") + "\n\n" +
          "Tidy Tube removes up to " + CAP + " matching entries, the same as using each one's " +
          "⋮ → Remove from watch history. Videos Hacker News recommends are kept. This can't be undone."
      )
    ) {
      return;
    }
    running = true;
    stop = false;
    let removed = 0;
    let checked = 0;
    let misses = 0; // in a row: the menu has no "Remove" item
    let stale = 0; // loads in a row that brought nothing
    let failed = null;
    const counts = {}; // category name -> removals
    const verdict = new WeakMap(); // entry -> the video it was found not to match on
    const tried = new Set(); // videos attempted this run

    // first unchecked entry that matches, checking the ones on the way
    function next() {
      for (const c of document.querySelectorAll(ENTRIES)) {
        if (c.hasAttribute("data-tidy-removed")) continue;
        const key = cardKey(c);
        if (!key || tried.has(key) || verdict.get(c) === key) continue;
        const name = junk.forHistory(c);
        if (name) return { c, key, name };
        verdict.set(c, key);
        checked++;
      }
      return null;
    }
    const progress = () => setUi("Checked " + checked + ", removed " + removed + "…");

    setUi("Looking…");
    try {
      while (!stop && removed < CAP && onHistory()) {
        const found = next();
        progress();
        if (!found) {
          if (checked >= SCAN_CAP) break;
          stale = (await loadMore()) ? 0 : stale + 1;
          if (stale >= 2) break; // the end of your history
          continue;
        }
        const { c, key, name } = found;
        tried.add(key);
        if (await inCatalogue(key)) {
          checked++;
          continue;
        }
        c.scrollIntoView({ block: "center" });
        const result = await pick(c, ITEM, DIRECT);
        if (result === "done") {
          c.setAttribute("data-tidy-removed", key);
          removed++;
          checked++;
          counts[name] = (counts[name] || 0) + 1;
          misses = 0;
          progress();
          await sleep(GAP[0] + Math.random() * (GAP[1] - GAP[0]));
        } else if (result !== "no-button" && ++misses >= 3) {
          failed = "YouTube's menu has no “Remove from watch history” here. Are you signed in, in English?";
          break;
        }
      }
    } finally {
      running = false;
      setUi(
        failed ||
          (removed
            ? summary(counts, removed) + (removed >= CAP ? " Press again for more." : stop ? " Stopped." : "")
            : stop
              ? "Stopped."
              : "Nothing to remove in the " + checked + " entries checked.")
      );
    }
  }

  window.addEventListener("yt-navigate-finish", ensureButton);
  window.addEventListener("tidy-scan", () => {
    ensureButton();
    unmarkRecycled();
  });
})();
