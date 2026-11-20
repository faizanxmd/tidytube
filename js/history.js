/*
 * Tidy Tube: on-demand, preview-first Watch History cleaner.
 *
 * Watch history cleanup is a one-time tool you run whenever you want —
 * completely separate from active hiding.
 *
 * Adds a "Clean watch history" button to YouTube's History page action column
 * (and opens automatically when launched via /feed/history#tidy-clean from the
 * popup). Inside the panel:
 *   1. Pick which categories (and optional one-off keywords/channels) to clean.
 *   2. Preview the exact matched videos right away, unchecking any you want to
 *      keep. Videos recommended by Hacker News are automatically protected.
 *   3. Optionally load older history into the preview, or enable deep-clean
 *      auto-scrolling (up to 300 removals), then remove with live progress and
 *      a Stop button.
 */
(() => {
  "use strict";

  const { pick, cardKey, sleep } = globalThis.tidyMenu;
  const junk = globalThis.tidyJunk;

  const PAGE = 'ytd-browse[page-subtype="history"]';
  const ENTRY_SEL = "yt-lockup-view-model, ytd-video-renderer";
  const ENTRIES = PAGE + " :is(" + ENTRY_SEL + ")";
  const DIRECT = 'button[aria-label^="Remove from" i]';
  const ITEM = /^remove from (watch )?history/i;
  const CAP = 300;
  const SCAN_CAP = 2000;
  const GAP = [350, 750];

  // Material "delete_sweep"
  const ICON_SWEEP =
    "M15 16h4v2h-4zm0-8h7v2h-7zm0 4h6v2h-6zM3 18c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V8H3v10zM14 5h-3l-1-1H6L5 5H2v2h12z";
  const ICON_CLOSE =
    "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";

  const onHistory = () => location.pathname === "/feed/history";

  let panel = null;
  let running = false;
  let loadingMore = false;
  let stop = false;
  let selectedCats = new Set();
  let extraText = "";
  let deepClean = false;
  let excludedCards = new WeakSet(); // user unchecked these specific cards in preview
  let previewMatches = []; // [{ card, key, title, channel, category }]
  let loadedCount = 0;
  let protectedCount = 0;
  let scanSeq = 0;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function svgIcon(pathD) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", pathD);
    svg.append(p);
    return svg;
  }

  // Top-level history card elements (skip nested renderers and already-removed cards)
  function historyCards() {
    const all = [...document.querySelectorAll(ENTRIES)];
    return all.filter((c) => {
      if (c.hasAttribute("data-tidy-removed")) return false;
      if (c.parentElement && c.parentElement.closest(ENTRY_SEL)) return false;
      return !!cardKey(c);
    });
  }

  function unmarkRecycled() {
    for (const c of document.querySelectorAll("[data-tidy-removed]")) {
      const key = cardKey(c);
      if (key && key !== c.getAttribute("data-tidy-removed")) c.removeAttribute("data-tidy-removed");
    }
  }

  function knownCatalogueVids(vids) {
    if (!vids.length) return Promise.resolve(new Set());
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "hn:known", vids }, (r) => {
          if (chrome.runtime.lastError || !r || !Array.isArray(r.known)) {
            // If extension cannot answer, conservatively protect all vids
            resolve(new Set(vids));
          } else {
            resolve(new Set(r.known));
          }
        });
      } catch (e) {
        resolve(new Set(vids));
      }
    });
  }

  function extraTerms() {
    return extraText
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function initSelectedCats() {
    const cats = junk.categories();
    const activeIds = cats.filter((c) => c.enabled).map((c) => c.id);
    selectedCats = new Set(activeIds.length ? activeIds : cats.slice(0, 2).map((c) => c.id));
  }

  /* ---------------------------------------------------------------- */
  /* Action button in YouTube's History sidebar                        */
  /* ---------------------------------------------------------------- */

  function buildTrigger() {
    const wrap = el("div", "tidy-clean");
    wrap.id = "tidy-clean";
    const btn = el("button", "tidy-clean-btn");
    btn.type = "button";
    btn.append(svgIcon(ICON_SWEEP), el("span", null, "Clean watch history"));
    btn.addEventListener("click", openPanel);
    wrap.append(btn);
    return wrap;
  }

  function ensureButton() {
    if (!onHistory()) {
      if (panel && !running) closePanel();
      return;
    }
    if (!document.getElementById("tidy-clean")) {
      const page = document.querySelector(PAGE);
      const contents =
        page &&
        (page.querySelector("ytd-browse-feed-actions-renderer #contents") ||
          page.querySelector("#secondary #contents"));
      if (contents) contents.prepend(buildTrigger());
    }
    if (location.hash === "#tidy-clean") {
      history.replaceState(null, "", location.pathname + location.search);
      openPanel();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Preview-first floating panel                                      */
  /* ---------------------------------------------------------------- */

  let ui = {};

  function openPanel() {
    if (!onHistory()) return;
    if (panel) {
      panel.hidden = false;
      scanLoaded();
      return;
    }
    initSelectedCats();
    excludedCards = new WeakSet();
    extraText = "";
    deepClean = false;

    panel = el("aside", "tidy-hc");
    panel.id = "tidy-hc";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Clean watch history");

    // Header
    const head = el("div", "tidy-hc-head");
    const titleWrap = el("div", "tidy-hc-title");
    const dot = el("span", "tidy-hc-dot");
    titleWrap.append(dot, el("span", null, "Clean watch history"));
    const closeBtn = el("button", "tidy-hc-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.append(svgIcon(ICON_CLOSE));
    closeBtn.addEventListener("click", () => {
      if (running) stop = true;
      closePanel();
    });
    head.append(titleWrap, closeBtn);

    // Body
    const body = el("div", "tidy-hc-body");

    // 1. Category pills
    const catLabel = el("div", "tidy-hc-sec", "What to clean");
    const pills = el("div", "tidy-hc-pills");
    const cats = junk.categories();
    for (const c of cats) {
      const pill = el("label", "tidy-hc-pill");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = selectedCats.has(c.id);
      box.addEventListener("change", () => {
        if (box.checked) selectedCats.add(c.id);
        else selectedCats.delete(c.id);
        scanLoaded();
      });
      pill.append(box, el("span", null, c.name));
      pills.append(pill);
    }

    // 2. One-off keyword / channel input
    const extraInput = document.createElement("input");
    extraInput.type = "text";
    extraInput.className = "tidy-hc-input";
    extraInput.placeholder = "Also match channel or keyword (comma-separated)…";
    extraInput.autocomplete = "off";
    let inputTimer = 0;
    extraInput.addEventListener("input", () => {
      extraText = extraInput.value;
      clearTimeout(inputTimer);
      inputTimer = setTimeout(scanLoaded, 180);
    });

    // 3. Preview summary bar
    const bar = el("div", "tidy-hc-bar");
    const stats = el("div", "tidy-hc-stats", "Scanning loaded history…");
    const barBtns = el("div", "tidy-hc-bar-btns");
    const selAllBtn = el("button", "tidy-hc-link", "All");
    selAllBtn.type = "button";
    selAllBtn.hidden = true;
    selAllBtn.addEventListener("click", () => {
      const allSelected = previewMatches.every((m) => !excludedCards.has(m.card));
      for (const m of previewMatches) {
        if (allSelected) excludedCards.add(m.card);
        else excludedCards.delete(m.card);
      }
      renderPreview();
    });
    const loadBtn = el("button", "tidy-hc-subtle", "Load older");
    loadBtn.type = "button";
    loadBtn.addEventListener("click", loadOlderBatch);
    barBtns.append(selAllBtn, loadBtn);
    bar.append(stats, barBtns);

    // 4. Scrollable match list
    const list = el("div", "tidy-hc-list");

    // 5. Protected note + Deep clean option
    const deepLabel = el("label", "tidy-hc-deep");
    const deepBox = document.createElement("input");
    deepBox.type = "checkbox";
    deepBox.checked = deepClean;
    deepBox.addEventListener("change", () => {
      deepClean = deepBox.checked;
      updateActionBtn();
    });
    deepLabel.append(deepBox, el("span", null, "Keep scrolling older history (up to " + CAP + ")"));

    const note = el("div", "tidy-hc-note", "Hacker News picks are automatically protected.");

    // 6. Progress & status banner
    const progWrap = el("div", "tidy-hc-prog");
    progWrap.hidden = true;
    const progTrack = el("div", "tidy-hc-prog-track");
    const progFill = el("div", "tidy-hc-prog-fill");
    progTrack.append(progFill);
    const progText = el("div", "tidy-hc-prog-text");
    progWrap.append(progTrack, progText);

    const status = el("div", "tidy-hc-status");
    status.hidden = true;

    // Footer actions
    const foot = el("div", "tidy-hc-foot");
    const actionBtn = el("button", "tidy-hc-primary", "Remove");
    actionBtn.type = "button";
    actionBtn.addEventListener("click", () => {
      if (running) stop = true;
      else runClean();
    });
    const doneBtn = el("button", "tidy-hc-secondary", "Done");
    doneBtn.type = "button";
    doneBtn.hidden = true;
    doneBtn.addEventListener("click", closePanel);
    foot.append(actionBtn, doneBtn);

    body.append(catLabel, pills, extraInput, bar, list, deepLabel, note, progWrap, status);
    panel.append(head, body, foot);
    document.body.append(panel);

    ui = {
      pills,
      extraInput,
      stats,
      selAllBtn,
      loadBtn,
      list,
      deepBox,
      note,
      progWrap,
      progFill,
      progText,
      status,
      actionBtn,
      doneBtn,
    };

    scanLoaded();
  }

  function closePanel() {
    if (panel) {
      panel.remove();
      panel = null;
      ui = {};
    }
  }

  function selectedMatches() {
    return previewMatches.filter((m) => !excludedCards.has(m.card));
  }

  function updateActionBtn() {
    if (!panel) return;
    const count = selectedMatches().length;
    const hasCriteria = selectedCats.size > 0 || extraTerms().length > 0;
    if (running) {
      ui.actionBtn.textContent = "Stop";
      ui.actionBtn.className = "tidy-hc-danger";
      ui.actionBtn.disabled = false;
      return;
    }
    ui.actionBtn.className = "tidy-hc-primary";
    if (!hasCriteria) {
      ui.actionBtn.textContent = "Pick a category or keyword";
      ui.actionBtn.disabled = true;
    } else if (count > 0) {
      ui.actionBtn.textContent =
        "Remove " + count + (count === 1 ? " video" : " videos") + (deepClean ? " + older" : "");
      ui.actionBtn.disabled = false;
    } else if (deepClean) {
      ui.actionBtn.textContent = "Scan & clean older history";
      ui.actionBtn.disabled = false;
    } else {
      ui.actionBtn.textContent = "Nothing to remove";
      ui.actionBtn.disabled = true;
    }
  }

  function renderPreview() {
    if (!panel) return;
    const total = previewMatches.length;
    const picked = selectedMatches().length;
    const hasCriteria = selectedCats.size > 0 || extraTerms().length > 0;

    if (!hasCriteria) {
      ui.stats.textContent = "Pick at least one category or type a keyword.";
      ui.selAllBtn.hidden = true;
      ui.list.replaceChildren();
      updateActionBtn();
      return;
    }

    const parts = [
      total + (total === 1 ? " match" : " matches") + " in " + loadedCount + " loaded",
    ];
    if (protectedCount) {
      parts.push(protectedCount + " HN protected");
    }
    ui.stats.textContent = parts.join(" · ");

    ui.selAllBtn.hidden = total === 0;
    if (total > 0) {
      ui.selAllBtn.textContent = picked === total ? "None" : "All";
    }

    ui.list.replaceChildren();
    if (!total) {
      ui.list.append(
        el(
          "div",
          "tidy-hc-empty",
          "No matches in the " + loadedCount + " loaded videos. Click “Load older” to scan further back."
        )
      );
    } else {
      const frag = document.createDocumentFragment();
      for (const m of previewMatches) {
        const row = el("label", "tidy-hc-row");
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !excludedCards.has(m.card);
        cb.disabled = running;
        cb.addEventListener("change", () => {
          if (cb.checked) excludedCards.delete(m.card);
          else excludedCards.add(m.card);
          ui.selAllBtn.textContent =
            selectedMatches().length === previewMatches.length ? "None" : "All";
          updateActionBtn();
        });
        const info = el("div", "tidy-hc-info");
        info.append(
          el("div", "tidy-hc-vtitle", m.title || "Untitled video"),
          el("div", "tidy-hc-vchan", m.channel || "")
        );
        const tag = el("span", "tidy-hc-tag", m.category);
        row.append(cb, info, tag);
        frag.append(row);
      }
      ui.list.append(frag);
    }
    updateActionBtn();
  }

  async function scanLoaded() {
    if (!panel || running) return;
    const seq = ++scanSeq;
    const hasCriteria = selectedCats.size > 0 || extraTerms().length > 0;
    const cards = historyCards();
    loadedCount = cards.length;
    if (!hasCriteria) {
      previewMatches = [];
      protectedCount = 0;
      renderPreview();
      return;
    }

    const matcher = junk.buildCleanupMatcher([...selectedCats], extraTerms());
    const raw = [];
    for (const c of cards) {
      const cat = matcher(c);
      if (!cat) continue;
      raw.push({
        card: c,
        key: cardKey(c),
        title: junk.titleOf(c),
        channel: junk.channelLabel(c),
        category: cat,
      });
    }

    const uniqueVids = [...new Set(raw.map((m) => m.key).filter(Boolean))];
    const protectedSet = await knownCatalogueVids(uniqueVids);
    if (seq !== scanSeq || !panel) return;

    const kept = [];
    let prot = 0;
    for (const m of raw) {
      if (protectedSet.has(m.key)) {
        prot++;
      } else {
        kept.push(m);
      }
    }
    previewMatches = kept;
    protectedCount = prot;
    renderPreview();
  }

  async function scrollBatch() {
    const before = document.querySelectorAll(ENTRIES).length;
    window.scrollTo(0, document.documentElement.scrollHeight);
    for (let t = 0; t < 3500 && !stop; t += 250) {
      await sleep(250);
      if (document.querySelectorAll(ENTRIES).length > before) {
        await sleep(300);
        return true;
      }
    }
    return false;
  }

  async function loadOlderBatch() {
    if (!panel || running || loadingMore) return;
    loadingMore = true;
    ui.loadBtn.disabled = true;
    ui.loadBtn.textContent = "Loading…";
    try {
      let got = false;
      for (let i = 0; i < 2; i++) {
        if (await scrollBatch()) got = true;
        else break;
      }
      await scanLoaded();
      if (!got && panel) {
        ui.loadBtn.textContent = "End reached";
        setTimeout(() => {
          if (panel && !loadingMore) ui.loadBtn.textContent = "Load older";
        }, 2000);
      }
    } finally {
      loadingMore = false;
      if (panel) {
        ui.loadBtn.disabled = false;
        if (ui.loadBtn.textContent === "Loading…") ui.loadBtn.textContent = "Load older";
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Removing confirmed entries                                        */
  /* ---------------------------------------------------------------- */

  function summaryText(counts, removed) {
    const parts = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => n + " " + name);
    return (
      "Removed " +
      removed +
      (removed === 1 ? " video" : " videos") +
      (parts.length ? " (" + parts.join(", ") + ")" : "") +
      "."
    );
  }

  function setControlsDisabled(disabled) {
    if (!panel) return;
    for (const inp of ui.pills.querySelectorAll("input")) inp.disabled = disabled;
    ui.extraInput.disabled = disabled;
    ui.deepBox.disabled = disabled;
    ui.loadBtn.disabled = disabled;
    ui.selAllBtn.disabled = disabled;
    for (const cb of ui.list.querySelectorAll("input")) cb.disabled = disabled;
  }

  async function runClean() {
    if (!panel || running) return;
    running = true;
    stop = false;
    setControlsDisabled(true);
    ui.status.hidden = true;
    ui.doneBtn.hidden = true;
    ui.progWrap.hidden = false;
    updateActionBtn();

    const counts = {};
    let removed = 0;
    let checked = loadedCount;
    let misses = 0;
    let failed = null;
    const tried = new Set();

    const queue = selectedMatches();
    const initialTotal = queue.length;

    const setProgress = (done, total, text) => {
      if (!panel) return;
      const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      ui.progFill.style.width = (deepClean ? Math.min(100, Math.round((removed / CAP) * 100)) : pct) + "%";
      ui.progText.textContent = text;
    };

    try {
      // Phase 1: remove the exact previewed & checked entries
      for (let idx = 0; idx < queue.length && !stop && removed < CAP && onHistory(); idx++) {
        const m = queue[idx];
        if (!m.card.isConnected || m.card.hasAttribute("data-tidy-removed")) continue;
        tried.add(m.card);
        setProgress(idx, initialTotal, "Removing " + (removed + 1) + " of " + initialTotal + "…");
        m.card.scrollIntoView({ block: "center" });
        const result = await pick(m.card, ITEM, DIRECT);
        if (result === "done") {
          m.card.setAttribute("data-tidy-removed", m.key);
          removed++;
          counts[m.category] = (counts[m.category] || 0) + 1;
          misses = 0;
          setProgress(idx + 1, initialTotal, "Removed " + removed + " of " + initialTotal + "…");
          await sleep(GAP[0] + Math.random() * (GAP[1] - GAP[0]));
        } else if (result !== "no-button" && ++misses >= 3) {
          failed = "Couldn't find “Remove from watch history” in YouTube's menu. Make sure you're signed in, in English.";
          break;
        }
      }

      // Phase 2 (optional): deep-clean auto-scrolling
      if (deepClean && !stop && !failed && removed < CAP && onHistory()) {
        const matcher = junk.buildCleanupMatcher([...selectedCats], extraTerms());
        let stale = 0;
        const checkedCards = new WeakSet(historyCards());

        while (!stop && removed < CAP && checked < SCAN_CAP && onHistory()) {
          setProgress(removed, CAP, "Loading older history… (" + removed + " removed)");
          const gotMore = await scrollBatch();
          if (!gotMore) {
            if (++stale >= 2) break;
            continue;
          }
          stale = 0;

          const fresh = historyCards().filter((c) => !checkedCards.has(c) && !tried.has(c));
          const batch = [];
          for (const c of fresh) {
            checkedCards.add(c);
            checked++;
            const cat = matcher(c);
            if (cat) batch.push({ card: c, key: cardKey(c), category: cat });
          }
          if (!batch.length) continue;

          const protectedSet = await knownCatalogueVids([...new Set(batch.map((b) => b.key))]);
          for (const m of batch) {
            if (stop || removed >= CAP || !onHistory()) break;
            if (protectedSet.has(m.key)) continue;
            if (!m.card.isConnected || m.card.hasAttribute("data-tidy-removed")) continue;
            tried.add(m.card);
            m.card.scrollIntoView({ block: "center" });
            const result = await pick(m.card, ITEM, DIRECT);
            if (result === "done") {
              m.card.setAttribute("data-tidy-removed", m.key);
              removed++;
              counts[m.category] = (counts[m.category] || 0) + 1;
              misses = 0;
              setProgress(removed, CAP, "Removed " + removed + " (checked " + checked + ")…");
              await sleep(GAP[0] + Math.random() * (GAP[1] - GAP[0]));
            } else if (result !== "no-button" && ++misses >= 3) {
              failed = "Couldn't find “Remove from watch history” in YouTube's menu. Make sure you're signed in, in English.";
              break;
            }
          }
          if (failed) break;
        }
      }
    } finally {
      running = false;
      if (panel) {
        setControlsDisabled(false);
        ui.progWrap.hidden = true;
        ui.status.hidden = false;
        ui.status.classList.toggle("error", !!failed);
        ui.status.textContent =
          failed ||
          (removed
            ? summaryText(counts, removed) + (removed >= CAP ? " Run again for more." : stop ? " Stopped." : "")
            : stop
              ? "Stopped."
              : "No videos were removed.");
        ui.doneBtn.hidden = false;
        await scanLoaded();
      }
    }
  }

  window.addEventListener("yt-navigate-finish", ensureButton);
  window.addEventListener("tidy-scan", () => {
    ensureButton();
    unmarkRecycled();
  });
  window.addEventListener("tidy-filters", () => {
    if (panel && !running) scanLoaded();
  });
})();
