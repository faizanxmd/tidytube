/*
 * Tidy Tube popup.
 * Direct 1-click toggles for every active filter (Shorts + built-in and custom
 * categories), plus quick launchers for the one-time Watch History cleaner and
 * Hacker News picks. Changes apply to open YouTube tabs immediately.
 */
(() => {
  "use strict";

  const junk = globalThis.tidyJunk;
  const DEFAULTS = {
    hide_shorts: true,
    show_hn: true,
  };

  const store =
    chrome.storage && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;

  const hideList = document.getElementById("hide_list");
  const shortsBox = document.getElementById("hide_shorts");
  const showHnBox = document.getElementById("show_hn");
  const activeCount = document.getElementById("active_count");

  let categories = [];

  function updateBadge() {
    const n = (shortsBox.checked ? 1 : 0) + categories.filter((c) => c.enabled).length;
    activeCount.textContent = n + " active";
    activeCount.classList.toggle("on", n > 0);
  }

  function renderCategories() {
    // Keep the first row (Shorts), replace dynamic filter rows after it
    while (hideList.children.length > 1) hideList.lastElementChild.remove();
    for (const c of categories) {
      const row = document.createElement("label");
      row.className = "row";

      const label = document.createElement("span");
      label.className = "row-label";
      label.textContent = c.name;

      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !!c.enabled;
      box.addEventListener("change", () => {
        c.enabled = box.checked;
        junk.save(categories);
        updateBadge();
      });

      const pill = document.createElement("span");
      pill.className = "toggle";
      pill.setAttribute("aria-hidden", "true");

      row.append(label, box, pill);
      hideList.append(row);
    }
    updateBadge();
  }

  store.get(DEFAULTS, (settings) => {
    shortsBox.checked = !!settings.hide_shorts;
    showHnBox.checked = !!settings.show_hn;
    updateBadge();
  });

  shortsBox.addEventListener("change", () => {
    store.set({ hide_shorts: shortsBox.checked });
    updateBadge();
  });
  showHnBox.addEventListener("change", () => {
    store.set({ show_hn: showHnBox.checked });
  });

  junk.ready.then(() => {
    categories = junk.categories();
    renderCategories();
  });

  // Hacker News stats & reset
  const hnStats = document.getElementById("hn_stats");
  const hnLearn = document.getElementById("hn_learn");
  const hnLearnText = document.getElementById("hn_learn_text");
  const hnReset = document.getElementById("hn_reset");

  function showStats() {
    chrome.runtime.sendMessage({ type: "hn:stats" }, (res) => {
      if (chrome.runtime.lastError || !res || res.error) return;
      hnStats.textContent = res.videos.toLocaleString() + " curated videos from HackerTube";
      const n = res.learned;
      if (n > 0) {
        hnLearn.hidden = false;
        hnLearnText.textContent = "Learned from " + n + (n === 1 ? " video" : " videos") + " (local)";
      } else {
        hnLearn.hidden = true;
      }
    });
  }

  document.getElementById("filters_open").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  document.getElementById("history_open").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "history:open" }, () => window.close());
  });

  document.getElementById("hn_open").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("hn.html") });
    window.close();
  });

  hnReset.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "hn:reset" }, showStats);
  });

  showStats();
})();
