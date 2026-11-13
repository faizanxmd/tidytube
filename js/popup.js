/*
 * kempt popup. Reads settings into the toggles, writes changes back to
 * storage. The content script listens to storage.onChanged, so changes apply
 * to open YouTube tabs immediately — no reload needed.
 */
(() => {
  "use strict";

  const DEFAULTS = {
    hide_music: true,
    hide_mixes: true,
    hide_shorts: true,
    show_hn: true,
    tell_youtube: true,
  };

  const store =
    chrome.storage && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;

  store.get(DEFAULTS, (settings) => {
    for (const key of Object.keys(DEFAULTS)) {
      document.getElementById(key).checked = !!settings[key];
    }
  });

  for (const box of document.querySelectorAll("input")) {
    box.addEventListener("change", function () {
      store.set({ [this.id]: this.checked });
    });
  }

  // what the HN picks have learned (kept locally by js/background.js)
  const stats = document.getElementById("hn_stats");
  const reset = document.getElementById("hn_reset");

  function showStats() {
    chrome.runtime.sendMessage({ type: "hn:stats" }, (res) => {
      if (chrome.runtime.lastError || !res || res.error) return;
      const n = res.learned;
      stats.textContent =
        res.videos.toLocaleString() +
        " videos from HackerTube. " +
        (n ? "Learned from " + n + (n === 1 ? " video" : " videos") + "." : "Learns from what you watch.");
      reset.hidden = !n;
    });
  }

  document.getElementById("hn_open").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("hn.html") });
    window.close();
  });

  reset.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "hn:reset" }, showStats);
  });

  showStats();
})();
