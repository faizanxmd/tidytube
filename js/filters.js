/*
 * Tidy Tube Filters page (filters.html).
 * Simple ON/OFF toggles + chip editors (with optional bulk edit) for channels
 * and title keywords. Saves automatically; open YouTube tabs update instantly.
 */
(() => {
  "use strict";

  const junk = globalThis.tidyJunk;
  const $ = (id) => document.getElementById(id);
  const list = $("list");
  const tpl = $("card");

  let categories = [];

  const splitLines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);
  const splitQuick = (text) => text.split(/[\n,]/).map((l) => l.trim()).filter(Boolean);
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

  let saveTimer = 0;
  function save() {
    $("saved").textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      junk.save(categories, (err) => {
        $("saved").textContent = err ? "Couldn't save" : "Saved";
      });
    }, 300);
  }

  function setupField(fieldEl, c, key, onChange) {
    const modeBtn = fieldEl.querySelector(".mode-btn");
    const chipView = fieldEl.querySelector(".chip-view");
    const addInput = fieldEl.querySelector(".add-input");
    const addBtn = fieldEl.querySelector(".add-btn");
    const chipsBox = fieldEl.querySelector(".chips");
    const bulk = fieldEl.querySelector(".bulk");
    const errorEl = fieldEl.querySelector(".error");

    let bulkMode = false;

    function validate() {
      if (!errorEl) return;
      const bad = c[key]
        .map((w, i) => [i + 1, junk.problem(w)])
        .filter(([, p]) => p)
        .map(([n, p]) => "Item " + n + ": " + p);
      errorEl.hidden = !bad.length;
      errorEl.textContent = bad.length ? bad.join(" · ") + " (skipped)" : "";
    }

    function renderChips() {
      chipsBox.replaceChildren();
      const items = c[key];
      if (!items.length) {
        const empty = document.createElement("span");
        empty.className = "chips-empty";
        empty.textContent =
          key === "channels" ? "No channels added yet." : "No keywords added yet.";
        chipsBox.append(empty);
      } else {
        const frag = document.createDocumentFragment();
        items.forEach((val, idx) => {
          const chip = document.createElement("span");
          chip.className = "chip";
          if (val.startsWith("/") && val.lastIndexOf("/") > 0) chip.classList.add("regex");
          if (key === "words" && junk.problem(val)) chip.classList.add("bad");

          const txt = document.createElement("span");
          txt.className = "chip-text";
          txt.textContent = val;
          txt.title = val;

          const x = document.createElement("button");
          x.type = "button";
          x.className = "chip-x";
          x.setAttribute("aria-label", "Remove " + val);
          x.textContent = "×";
          x.addEventListener("click", () => {
            c[key].splice(idx, 1);
            renderChips();
            validate();
            onChange();
          });

          chip.append(txt, x);
          frag.append(chip);
        });
        chipsBox.append(frag);
      }
      validate();
    }

    function addFromInput() {
      const vals = splitQuick(addInput.value);
      if (!vals.length) return;
      const existing = new Set(c[key].map((v) => v.toLowerCase()));
      let added = false;
      for (const v of vals) {
        if (!existing.has(v.toLowerCase())) {
          c[key].push(v);
          existing.add(v.toLowerCase());
          added = true;
        }
      }
      addInput.value = "";
      if (added) {
        renderChips();
        onChange();
      }
      addInput.focus();
    }

    addBtn.addEventListener("click", addFromInput);
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addFromInput();
      }
    });

    bulk.addEventListener("input", () => {
      c[key] = splitLines(bulk.value);
      validate();
      onChange();
    });

    modeBtn.addEventListener("click", () => {
      bulkMode = !bulkMode;
      chipView.hidden = bulkMode;
      bulk.hidden = !bulkMode;
      modeBtn.textContent = bulkMode ? "Done" : "Bulk edit";
      if (bulkMode) {
        bulk.value = c[key].join("\n");
        bulk.focus();
      } else {
        renderChips();
      }
    });

    renderChips();
  }

  function card(c, open) {
    const el = tpl.content.firstElementChild.cloneNode(true);
    const q = (s) => el.querySelector(s);
    const enabledBox = q(".enabled");
    const name = q(".name");
    const more = q(".more");
    const body = q(".body");

    enabledBox.checked = !!c.enabled;
    name.value = c.name;

    if (c.builtin) {
      q(".badge-builtin").hidden = false;
      const note = q(".builtin");
      note.hidden = false;
      note.textContent =
        c.builtin === "music"
          ? "Automatically detects YouTube's music note icon, Official Artist channels, albums, “Artist - Topic” tracks, and music video titles. Add extra channels or keywords below if anything slips through."
          : "Automatically detects YouTube Mix and auto-radio playlists. Add extra channels or keywords below if needed.";
      q(".delete").remove();
    }

    function refresh() {
      const counts = [];
      if (c.channels.length) counts.push(plural(c.channels.length, "channel"));
      if (c.words.length) counts.push(plural(c.words.length, "keyword"));
      q(".count").textContent = counts.length ? counts.join(" · ") : c.builtin ? "auto" : "empty";
      el.classList.toggle("idle", !c.enabled);
    }

    function setOpen(v) {
      body.hidden = !v;
      more.setAttribute("aria-expanded", String(v));
    }

    const onChange = () => {
      refresh();
      save();
      test();
    };

    enabledBox.addEventListener("change", () => {
      c.enabled = enabledBox.checked;
      onChange();
    });

    name.addEventListener("input", () => {
      c.name = name.value.trim() || "Untitled";
      save();
      test();
    });

    more.addEventListener("click", () => setOpen(body.hidden));

    setupField(q('[data-kind="channels"]'), c, "channels", onChange);
    setupField(q('[data-kind="words"]'), c, "words", onChange);

    const del = q(".delete");
    if (del) {
      del.addEventListener("click", () => {
        if (!confirm("Delete “" + c.name + "”?")) return;
        categories = categories.filter((x) => x !== c);
        el.remove();
        save();
        test();
      });
    }

    refresh();
    setOpen(open);
    return el;
  }

  function render() {
    list.replaceChildren(...categories.map((c) => card(c, false)));
    test();
  }

  $("add").addEventListener("click", () => {
    const c = {
      id: "c" + Date.now().toString(36),
      name: "New filter",
      enabled: true,
      channels: [],
      words: [],
    };
    categories.push(c);
    const el = card(c, true);
    list.append(el);
    const name = el.querySelector(".name");
    name.focus();
    name.select();
    save();
  });

  $("reset").addEventListener("click", () => {
    if (!confirm("Restore default filters? Your custom filters will be removed.")) return;
    chrome.storage.local.remove(junk.KEY, () => {
      categories = JSON.parse(JSON.stringify(junk.DEFAULTS));
      render();
      $("saved").textContent = "Restored";
    });
  });

  $("open_history").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "history:open" });
  });

  function test() {
    const title = $("t-title").value.trim();
    const channel = $("t-channel").value.trim();
    const out = $("t-out");
    if (!title && !channel) {
      out.textContent = "Type a title or channel to see if any filter catches it.";
      return;
    }
    const hit = junk.test(title, channel, categories);
    out.replaceChildren();
    if (hit) {
      out.append("Caught by ", Object.assign(document.createElement("b"), { textContent: hit.name }));
      if (hit.enabled) {
        const s = document.createElement("span");
        s.className = "hit-on";
        s.textContent = " — active (hidden on YouTube).";
        out.append(s);
      } else {
        out.append(" — currently off (turn it on above to hide it).");
      }
    } else {
      out.textContent = "Not caught by any filter.";
    }
  }
  $("t-title").addEventListener("input", test);
  $("t-channel").addEventListener("input", test);

  junk.ready.then(() => {
    categories = junk.categories();
    render();
  });
})();
