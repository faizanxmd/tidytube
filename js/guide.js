/*
 * Tidy Tube: the "Hacker News" entry in YouTube's sidebar.
 *
 * Adds one entry to each of YouTube's two sidebars (a full-width row under the
 * primary entries in the full guide, an icon tile in the collapsed mini guide)
 * that opens Tidy Tube's own Hacker News page (hn.html) in the same tab;
 * Ctrl/Cmd or middle click opens it in a new tab. Also tells the background
 * which catalogued videos you watch, so the Hacker News page can learn your taste. No
 * other UI is added to YouTube's pages.
 */
(() => {
  "use strict";

  // Material "explore" (outlined)
  const ICON =
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5 7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1z";

  // YouTube renders two sidebars at once and shows one: the full guide
  // (ytd-guide-renderer) or the icon rail (ytd-mini-guide-renderer). Which is
  // visible changes with the hamburger, the window width and the page type, and
  // YouTube re-renders both when it does. So there is no "current mode" to
  // detect: each sidebar owns exactly one entry of its own kind, in its own
  // list of primary entries, and YouTube's visibility rules show the right one.
  const KINDS = {
    full: {
      label: "Hacker News",
      host: "ytd-guide-renderer",
      // Home/Shorts/Subscriptions live in the first section's #items. Never
      // anywhere else: a signed-in guide's "Subscriptions >" is a collapsible
      // header whose link also points at /feed/subscriptions.
      list: "ytd-guide-section-renderer:first-of-type > #items",
      entries: ":scope > ytd-guide-entry-renderer",
      mini: false,
    },
    mini: {
      label: "HN",
      host: "ytd-mini-guide-renderer",
      list: "#items",
      entries: ":scope > ytd-mini-guide-entry-renderer",
      mini: true,
    },
  };

  function open(newTab) {
    try {
      chrome.runtime.sendMessage({ type: "hn:open", newTab }, () => void chrome.runtime.lastError);
    } catch (e) {
      // extension reloaded under an open tab: nothing to talk to
    }
  }

  function icon() {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", ICON);
    svg.append(p);
    return svg;
  }

  function entry(kind) {
    const k = KINDS[kind];
    const a = document.createElement("a");
    a.className = k.mini ? "tidy-guide tidy-guide-mini" : "tidy-guide";
    a.dataset.tidyGuide = kind;
    a.href = chrome.runtime.getURL("hn.html");
    // no title attribute: the label is on screen, and a native tooltip would
    // outlive the sidebar switching modes under the pointer
    a.setAttribute("aria-label", "Hacker News");
    const label = document.createElement("span");
    label.textContent = k.label;
    a.append(icon(), label);
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

  // the primary entry to sit under: the last of Home / Shorts / Subscriptions
  // that is a direct child of the list (a header or a hidden one is skipped)
  const PRIMARY = ['a[href="/"]', 'a[href^="/shorts"]', 'a[href="/feed/subscriptions"]'].join(",");
  function anchorFor(k, list) {
    let anchor = null;
    for (const e of list.querySelectorAll(k.entries)) {
      if (e.hidden || !e.querySelector(PRIMARY)) continue;
      anchor = e;
    }
    return anchor;
  }

  function ensureOne(kind) {
    const k = KINDS[kind];
    const host = document.querySelector(k.host);
    const mine = host ? [...host.querySelectorAll(".tidy-guide")] : [];
    const list = host && host.querySelector(k.list);
    // drop anything that isn't the single, correctly placed entry: copies,
    // and entries stranded where an earlier layout put them
    let keep = null;
    for (const e of mine) {
      if (!keep && list && e.parentElement === list && e.dataset.tidyGuide === kind) keep = e;
      else e.remove();
    }
    if (!list) return;
    const anchor = anchorFor(k, list);
    if (!anchor) return; // YouTube hasn't rendered its entries yet
    if (!keep) keep = entry(kind);
    if (anchor.nextElementSibling !== keep) anchor.after(keep);
  }

  function removeAll() {
    for (const e of document.querySelectorAll(".tidy-guide")) e.remove();
  }

  // one entry per sidebar, re-checked on every YouTube navigation and page scan
  function ensureEntries() {
    // an extension reloaded under an open tab has no runtime: tidy up and stop
    if (!(chrome.runtime && chrome.runtime.id)) {
      teardown();
      return;
    }
    // other tabs' strays too: any entry outside the two sidebars goes
    for (const e of document.querySelectorAll(".tidy-guide")) {
      if (!e.closest("ytd-guide-renderer, ytd-mini-guide-renderer")) e.remove();
    }
    for (const kind of Object.keys(KINDS)) ensureOne(kind);
  }

  let stopped = false;
  function teardown() {
    stopped = true;
    removeAll();
    window.removeEventListener("yt-navigate-finish", tick);
    window.removeEventListener("tidy-scan", tick);
  }

  // watches of catalogued videos teach the Hacker News page (others are ignored there)
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

  window.addEventListener("yt-navigate-finish", tick);
  // js/content.js fires this after each debounced scan of the page
  window.addEventListener("tidy-scan", tick);
})();
