/*
 * kempt content script.
 *
 * Runs at document_start. Two responsibilities:
 *   1. Mirror settings from chrome.storage as presence-attributes on <html>
 *      so css/content.css can hide things declaratively (no flicker).
 *   2. Mark what CSS cannot identify: videos, shelves and chips that are only
 *      recognisable by their text.
 */
(() => {
  "use strict";

  const DEFAULTS = {
    hide_music: true,
    hide_mixes: true,
    hide_shorts: true,
    show_hn: true,
  };

  const html = document.documentElement;

  // sync storage when available, with local as fallback (mirrors what
  // popup.js does, so both always read/write the same place)
  const store =
    chrome.storage && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;

  const attrName = (key) => "kempt-" + key.replace(/_/g, "-");

  function applySetting(key, on) {
    html.toggleAttribute(attrName(key), !!on);
  }

  /* ---------------------------------------------------------------- */
  /* Text detection (English titles, best effort)                      */
  /* ---------------------------------------------------------------- */

  const MUSIC_TITLE = new RegExp(
    [
      "\\bofficial\\s+(?:(?:music|lyrics?|hd|4k)\\s+)*(?:video|audio|visuali[sz]er)\\b",
      "\\b(?:music|lyrics?)\\s+video\\b",
      "[(\\[]lyrics?[)\\]]",
      "\\bvideo\\s+songs?\\b",
      "\\bfull\\s+(?:album|songs?)\\b",
      "\\bgreatest\\s+hits\\b",
      "\\bjukebox\\b",
      "\\b(?:songs?|music|hits)\\b.*\\b(?:playlist|mix|nonstop|compilation)\\b",
      "\\b(?:playlist|mix|nonstop|compilation)\\b.*\\b(?:songs?|music|hits)\\b",
      "\\bplaylist\\s+mix\\b",
      "\\b(?:old|best|top|hit|new|love|romantic|sad)\\s+(?:\\w+\\s+)?songs\\b",
      "\\b\\d+\\s*hours?\\b.*\\b(?:songs?|music)\\b",
      "\\b\\d0s\\b.*\\b(?:songs?|music|hits)\\b",
    ].join("|"),
    "i"
  );
  const MUSIC_SHELF = /\b(?:music|albums?|songs?)\b/i;
  const MIX_TITLE = /\bmix(?:es)?\b/i;

  // YouTube's auto-generated "Artist - Topic" channels carry album tracks,
  // which is how songs played in YT Music show up on YouTube
  const CHANNEL_NAMES = "ytd-channel-name, .ytContentMetadataViewModelMetadataText";
  function fromTopicChannel(card) {
    for (const n of card.querySelectorAll(CHANNEL_NAMES)) {
      if (/ - Topic$/.test(n.textContent.trim())) return true;
    }
    return false;
  }

  const CARDS =
    "ytd-rich-item-renderer, yt-lockup-view-model, ytd-video-renderer, ytd-compact-video-renderer";

  // YouTube recycles card elements in place, so every pass re-decides each
  // one rather than remembering it. Toggling attributes doesn't trip the
  // childList observer below.
  function scan() {
    for (const card of document.querySelectorAll(CARDS)) {
      const title = card.querySelector("#video-title, h3");
      const text = title ? title.textContent : "";
      card.toggleAttribute("data-kempt-music", MUSIC_TITLE.test(text) || fromTopicChannel(card));
      // user-made playlists named "mix" have no list=RD for the CSS to catch
      card.toggleAttribute(
        "data-kempt-mix",
        MIX_TITLE.test(text) && !!card.querySelector('a[href*="list="]')
      );
    }
    for (const shelf of document.querySelectorAll("ytd-rich-section-renderer")) {
      const title = shelf.querySelector("#title");
      const text = title ? title.textContent : "";
      shelf.toggleAttribute("data-kempt-music", MUSIC_SHELF.test(text));
      shelf.toggleAttribute("data-kempt-mix", MIX_TITLE.test(text));
    }
    for (const chip of document.querySelectorAll("yt-chip-cloud-chip-renderer, chip-view-model")) {
      const text = chip.textContent.trim();
      chip.toggleAttribute("data-kempt-music", /^music$/i.test(text));
      chip.toggleAttribute("data-kempt-mix", /^mix(?:es)?$/i.test(text));
      chip.toggleAttribute("data-kempt-shorts", /^shorts$/i.test(text));
    }
    // js/guide.js and js/tell.js re-check after every pass
    window.dispatchEvent(new Event("kempt-scan"));
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
    // Debounced full-page scan; new cards arrive constantly while scrolling
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        scan();
      }, 100);
    }).observe(document.body, { childList: true, subtree: true });

    // YouTube is a single-page app; this event fires on every route change
    window.addEventListener("yt-navigate-finish", scan);
    scan();
  }

  if (document.body) {
    startObserving();
  } else {
    window.addEventListener("DOMContentLoaded", startObserving, { once: true });
  }
})();
