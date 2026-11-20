/*
 * Tidy Tube: the "Hacker News" entry in YouTube's left sidebar.
 *
 * Adds one state-aware entry to each of YouTube's two sidebars:
 *   - Expanded guide (ytd-guide-renderer): full-width row with amber HN badge
 *     + "Hacker News" directly under YouTube's primary nav items.
 *   - Collapsed mini-guide (ytd-mini-guide-renderer): 64px vertical tile with
 *     the HN badge + "HN".
 *
 * Clicking opens Tidy Tube's Hacker News page (hn.html) in the same tab;
 * Ctrl/Cmd/Shift or middle-click opens it in a new tab.
 * Also reports catalogued video watches to js/background.js for local taste.
 */
(() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";

  function badgeIcon() {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "tidy-hn-badge");

    const bg = document.createElementNS(NS, "rect");
    bg.setAttribute("x", "2");
    bg.setAttribute("y", "2");
    bg.setAttribute("width", "20");
    bg.setAttribute("height", "20");
    bg.setAttribute("rx", "5.5");
    bg.setAttribute("fill", "#FF8A1F");

    // Crisp geometric "HN" monogram (no webfont dependency inside youtube.com)
    const letters = document.createElementNS(NS, "path");
    letters.setAttribute(
      "d",
      "M4.8 7.5h1.6v3.7h2.8V7.5h1.6v9H9.2v-3.7H6.4v3.7H4.8v-9z" +
        "M12.8 7.5h1.7l3.1 6.2V7.5h1.6v9h-1.7l-3.1-6.2v6.2h-1.6v-9z"
    );
    letters.setAttribute("fill", "#1A0E02");

    svg.append(bg, letters);
    return svg;
  }

  function open(newTab) {
    try {
      chrome.runtime.sendMessage({ type: "hn:open", newTab }, () => void chrome.runtime.lastError);
    } catch (e) {
      // extension reloaded under an open tab
    }
  }

  function buildEntry(kind) {
    const mini = kind === "mini";
    const a = document.createElement("a");
    a.className = mini ? "tidy-guide tidy-guide-mini" : "tidy-guide";
    a.dataset.tidyGuide = kind;
    a.href = chrome.runtime.getURL("hn.html");
    // No `title` attribute: label is visible and native tooltips can linger across mode switches
    a.setAttribute("aria-label", "Hacker News");

    const label = document.createElement("span");
    label.className = "tidy-guide-label";
    label.textContent = mini ? "HN" : "Hacker News";

    a.append(badgeIcon(), label);

    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      open(e.ctrlKey || e.metaKey || e.shiftKey);
    });
    a.addEventListener("auxclick", (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      open(true);
    });
    return a;
  }

  const PRIMARY_HREF = ['a[href="/"]', 'a[href^="/shorts"]', 'a[href="/feed/subscriptions"]'].join(",");
  const PRIMARY_TITLE = /^(home|shorts|subscriptions)$/i;

  function isVisible(el) {
    if (!el || el.hidden) return false;
    return getComputedStyle(el).display !== "none";
  }

  function isHomeEntry(entry) {
    if (entry.querySelector('a[href="/"], a[title="Home" i], a[aria-label="Home" i]')) return true;
    const t = entry.querySelector(".title, yt-formatted-string");
    return !!(t && /^home$/i.test(t.textContent.trim()));
  }

  function isPrimaryEntry(entry) {
    if (entry.querySelector(PRIMARY_HREF)) return true;
    const a = entry.querySelector("a[title], a[aria-label]");
    if (a && PRIMARY_TITLE.test((a.getAttribute("title") || a.getAttribute("aria-label") || "").trim())) {
      return true;
    }
    const t = entry.querySelector(".title, yt-formatted-string");
    return !!(t && PRIMARY_TITLE.test(t.textContent.trim()));
  }

  function findFullList(host) {
    const sections = host.querySelectorAll("ytd-guide-section-renderer");
    let fallback = null;
    for (const sec of sections) {
      const items = sec.querySelector(":scope > #items") || sec.querySelector("#items");
      if (!items) continue;
      const entries = [...items.querySelectorAll(":scope > ytd-guide-entry-renderer")];
      if (!entries.length) continue;
      if (entries.some(isHomeEntry)) return items;
      if (!fallback) fallback = items;
    }
    return fallback;
  }

  function findMiniList(host) {
    return host.querySelector("#items");
  }

  function findAnchor(list, entrySelector) {
    const entries = [...list.querySelectorAll(entrySelector)].filter(isVisible);
    if (!entries.length) return null;
    let primary = null;
    for (const e of entries) {
      if (isPrimaryEntry(e)) primary = e;
    }
    // Fall back to the first visible entry (e.g. non-English UI or DOM label changes)
    return primary || entries[0];
  }

  const KINDS = {
    full: {
      host: "ytd-guide-renderer",
      findList: findFullList,
      entrySel: ":scope > ytd-guide-entry-renderer",
    },
    mini: {
      host: "ytd-mini-guide-renderer",
      findList: findMiniList,
      entrySel: ":scope > ytd-mini-guide-entry-renderer",
    },
  };

  function ensureOne(kind) {
    const k = KINDS[kind];
    const host = document.querySelector(k.host);
    const mine = host ? [...host.querySelectorAll(".tidy-guide")] : [];
    const list = host ? k.findList(host) : null;

    let keep = null;
    for (const e of mine) {
      if (!keep && list && e.parentElement === list && e.dataset.tidyGuide === kind) {
        keep = e;
      } else {
        e.remove();
      }
    }
    if (!list) return;

    const anchor = findAnchor(list, k.entrySel);
    if (!anchor) return;

    if (!keep) keep = buildEntry(kind);
    if (anchor.nextElementSibling !== keep) anchor.after(keep);
  }

  function removeAll() {
    for (const e of document.querySelectorAll(".tidy-guide")) e.remove();
  }

  let stopped = false;

  function ensureEntries() {
    if (!(chrome.runtime && chrome.runtime.id)) {
      teardown();
      return;
    }
    // Remove any stray entries outside the two sidebars
    for (const e of document.querySelectorAll(".tidy-guide")) {
      if (!e.closest("ytd-guide-renderer, ytd-mini-guide-renderer")) e.remove();
    }
    ensureOne("full");
    ensureOne("mini");
  }

  function teardown() {
    stopped = true;
    removeAll();
    window.removeEventListener("yt-navigate-finish", tick);
    window.removeEventListener("tidy-scan", tick);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("click", onGuideClick, true);
  }

  // Record watches of catalogued videos so the HN page can learn local taste
  let lastVid = null;
  function recordWatch() {
    if (location.pathname !== "/watch") return;
    const vid = new URLSearchParams(location.search).get("v");
    if (!vid || vid === lastVid) return;
    lastVid = vid;
    try {
      chrome.runtime.sendMessage({ type: "hn:watch", vid }, () => void chrome.runtime.lastError);
    } catch (e) {
      // extension reloaded
    }
  }

  function tick() {
    if (stopped) return;
    ensureEntries();
    recordWatch();
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(tick, 150);
  }

  // When clicking YouTube's hamburger menu (e.g. on /watch where the drawer starts closed)
  function onGuideClick(e) {
    if (!e.target || !e.target.closest) return;
    if (e.target.closest("#guide-button, ytd-topbar-menu-button-renderer")) {
      setTimeout(tick, 80);
      setTimeout(tick, 320);
    }
  }

  window.addEventListener("yt-navigate-finish", tick);
  window.addEventListener("tidy-scan", tick);
  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("click", onGuideClick, true);

  if (document.readyState !== "loading") {
    tick();
  } else {
    window.addEventListener("DOMContentLoaded", tick, { once: true });
  }
})();
