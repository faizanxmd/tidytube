/*
 * Tidy Tube Filters page (filters.html). Edits the junk categories that
 * js/junk.js matches with, and saves every change as you type. YouTube tabs
 * pick changes up straight away through chrome.storage.onChanged.
 */
(() => {
  "use strict";

  const junk = globalThis.tidyJunk;
  const $ = (id) => document.getElementById(id);
  const list = $("list");
  const tpl = $("card");

  let categories = []; // what's on screen, in junk.js's saved shape

  const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);
  const plural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

  /* ---------------------------------------------------------------- */
  /* Saving                                                            */
  /* ---------------------------------------------------------------- */

  let saveTimer = 0;
  function save() {
    $("saved").textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.set({ [junk.KEY]: { categories } }, () => {
        $("saved").textContent = chrome.runtime.lastError ? "Couldn't save" : "Saved";
      });
    }, 400);
  }

  /* ---------------------------------------------------------------- */
  /* A category card                                                   */
  /* ---------------------------------------------------------------- */

  function card(c, open) {
    const el = tpl.content.firstElementChild.cloneNode(true);
    const q = (s) => el.querySelector(s);
    const name = q(".name");
    const switches = { history: q(".history"), hide: q(".hide"), tell: q(".tell") };
    const more = q(".more");
    const body = q(".body");
    const channels = q(".channels");
    const words = q(".words");
    const error = q(".error");

    name.value = c.name;
    for (const [k, box] of Object.entries(switches)) box.checked = !!c[k];
    channels.value = c.channels.join("\n");
    words.value = c.words.join("\n");

    // Music and Mixes also catch what YouTube itself marks; they can be
    // switched off but not deleted
    if (c.builtin) {
      const note = q(".builtin");
      note.hidden = false;
      note.textContent =
        c.builtin === "music"
          ? "Built in: also catches what YouTube marks as music (the note icon, artist channels, albums, “Official video” titles, “Artist - Topic” channels). Add your own below."
          : "Built in: also catches YouTube's Mix playlists. Add your own below.";
      q(".delete").remove();
    }

    function refresh() {
      q(".count").textContent =
        (c.builtin ? "built in + " : "") +
        plural(c.channels.length, "channel") + " · " + plural(c.words.length, "word");
      el.classList.toggle("idle", !(c.history || c.hide || c.tell));
      const bad = c.words
        .map((w, i) => [i + 1, junk.problem(w)])
        .filter(([, p]) => p)
        .map(([n, p]) => "Line " + n + ": " + p);
      error.hidden = !bad.length;
      error.textContent = bad.length ? bad.join(" · ") + ". These lines are skipped." : "";
    }

    function setOpen(v) {
      body.hidden = !v;
      more.setAttribute("aria-expanded", String(v));
    }

    name.addEventListener("input", () => {
      c.name = name.value.trim() || "Untitled";
      save();
      test();
    });
    for (const [k, box] of Object.entries(switches)) {
      box.addEventListener("change", () => {
        c[k] = box.checked;
        refresh();
        save();
        test();
      });
    }
    channels.addEventListener("input", () => {
      c.channels = lines(channels.value);
      refresh();
      save();
      test();
    });
    words.addEventListener("input", () => {
      c.words = lines(words.value);
      refresh();
      save();
      test();
    });
    more.addEventListener("click", () => setOpen(body.hidden));
    const del = q(".delete");
    if (del) del.addEventListener("click", () => {
      if (!confirm("Delete “" + c.name + "”?")) return;
      categories = categories.filter((x) => x !== c);
      el.remove();
      save();
      test();
    });

    refresh();
    setOpen(open);
    return el;
  }

  function render() {
    list.replaceChildren(...categories.map((c) => card(c, false)));
    test();
  }

  /* ---------------------------------------------------------------- */
  /* Page actions                                                      */
  /* ---------------------------------------------------------------- */

  $("add").addEventListener("click", () => {
    const c = {
      id: "c" + Date.now().toString(36),
      name: "New category",
      history: true,
      hide: false,
      tell: false,
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
    if (!confirm("Go back to the starting categories? Your changes are lost.")) return;
    chrome.storage.local.remove(junk.KEY, () => {
      categories = JSON.parse(JSON.stringify(junk.DEFAULTS));
      render();
      $("saved").textContent = "Restored";
    });
  });

  function test() {
    const title = $("t-title").value.trim();
    const channel = $("t-channel").value.trim();
    const out = $("t-out");
    if (!title && !channel) {
      out.textContent = "Type a title or channel to see which category catches it.";
      return;
    }
    const hit = junk.test(title, channel, categories);
    out.replaceChildren();
    if (hit) out.append("Caught by ", Object.assign(document.createElement("b"), { textContent: hit }), ".");
    else out.textContent = "None of your switched-on categories catch this.";
  }
  $("t-title").addEventListener("input", test);
  $("t-channel").addEventListener("input", test);

  junk.ready.then(() => {
    categories = junk.categories();
    render();
  });
})();
