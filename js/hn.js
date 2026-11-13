/*
 * Hacker News page (hn.html), built to design/DESIGN.md.
 *
 * kempt's own page beside YouTube, opened from the sidebar entry.
 * Views (URL hash, so Back and reload keep your place):
 *   #browse?cat=&t=&up=&ty=&du=&gems=&ever=&sort=
 *                      the design's page: category pills, filters, Sort, grid,
 *                      and the "More" category dropdown. The default view.
 *   #foryou            "Because you watched…" rows, then a fresh draw for you
 *   #channels          channels HN trusts, to subscribe to on YouTube
 *   #channel/<name>    one channel's recommended videos
 *   #topics            "Browse all categories": the 16 areas
 *   #search/<q>        search titles, channels, topics and HN's reasons
 *   #like/<vid>        more like one video
 *   #watched           catalogued videos you've watched on YouTube
 *   #classics, #deep, #topic/…   older links; they land in Browse
 * Videos open on youtube.com, so watching them also teaches YouTube.
 * Ranking, filtering and learning live in js/background.js.
 *
 * Vocabulary: the design's "category" is the catalogue's area (16) and its
 * "topic" is the catalogue's category (150).
 */
(() => {
  "use strict";

  const view = document.getElementById("view");
  const settings = { hide_music: true };
  const store =
    chrome.storage && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;

  const PAGE = 24;
  const PILLS = 6; // "All" + the largest 6 categories, the rest under More
  const TYPE_LABEL = {
    talk: "Talk", lecture: "Lecture", course: "Course", documentary: "Documentary",
    explainer: "Explainer", demo: "Demo", tutorial: "Tutorial", interview: "Interview",
    podcast: "Podcast", commentary: "Commentary", comedy: "Comedy", music: "Music",
  };
  // DESIGN.md 3.3
  const TYPES = ["Talk", "Lecture", "Explainer", "Tutorial", "Documentary", "Interview", "Demo", "Commentary", "Comedy", "Music"];
  const UPLOADED = ["Any time", "Past year", "2020s", "2010s", "2000s"];
  const DURATIONS = ["Any", "Under 4 min", "4–20 min", "20–60 min", "Over 1 hour"];
  // [id, label, needs YouTube stats (views/upload date/likes) in the data]
  const SORTS = [
    ["best", "Best first", false],
    ["recent", "Recently recommended", false],
    ["newest", "Upload date", true],
    ["oldest", "Oldest first", true],
    ["views", "View count", true],
    ["likes", "Like ratio", true],
  ];
  const DEFAULTS = { cat: "all", topics: [], up: "Any time", types: [], du: "Any", gems: false, ever: false, sort: "best" };

  const ICON = {
    more: "M12 16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zM10.5 12c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5zm0-6c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5z",
    shuffle: "M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
    like: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
    block: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 0 1 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0 1 20 12c0 4.42-3.58 8-8 8z",
    comments: "M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h10c.55 0 1-.45 1-1z",
    quote: "M6 17h3l2-4V7H5v6h3zm8 0h3l2-4V7h-6v6h3z",
    back: "M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z",
    next: "M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
    channel: "M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12zm-5-6-7 4V7z",
    open: "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
    search: "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
    chevron: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z",
    check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
    up: "M12 3 2.5 20h19z",
  };

  const send = (msg) =>
    new Promise((resolve) =>
      chrome.runtime.sendMessage(msg, (res) => resolve(chrome.runtime.lastError ? null : res))
    );
  const ask = (type, extra) => send(Object.assign({ type, noMusic: settings.hide_music }, extra));

  /* ---------------------------------------------------------------- */
  /* DOM helpers (textContent only: no HTML from data)                 */
  /* ---------------------------------------------------------------- */

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function icon(name, cls) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    if (cls) svg.setAttribute("class", cls);
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", ICON[name]);
    svg.append(p);
    return svg;
  }

  function button(cls, label, iconName, onClick) {
    const b = el("button", cls);
    b.type = "button";
    if (iconName) b.append(icon(iconName));
    if (label) b.append(el("span", null, label));
    b.addEventListener("click", onClick);
    return b;
  }

  const watchUrl = (vid) => "https://www.youtube.com/watch?v=" + encodeURIComponent(vid);
  const hnUrl = (id) => "https://news.ycombinator.com/item?id=" + encodeURIComponent(id);
  const img = (vid, name) => "https://i.ytimg.com/vi/" + encodeURIComponent(vid) + "/" + name;
  // change the hash without adding a history entry (and without a hashchange)
  const setHash = (h) => history.replaceState(null, "", location.pathname + location.search + h);
  const hash = (...parts) => "#" + parts.map(encodeURIComponent).join("/");
  const ytSearch = (text) => "https://www.youtube.com/results?search_query=" + encodeURIComponent(text);
  // YouTube search filtered to channels (the sp value is YouTube's own)
  const ytChannel = (name) => ytSearch(name) + "&sp=EgIQAg%253D%253D";

  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const plain = new Intl.NumberFormat("en");

  function years(it) {
    if (!it.first) return "";
    return it.first === it.last ? String(it.first) : it.first + "–" + it.last;
  }

  function ago(day) {
    const d = Math.max(0, Math.floor(Date.now() / 86400000) - day);
    if (d < 1) return "today";
    if (d < 31) return d + (d === 1 ? " day ago" : " days ago");
    if (d < 365) return Math.floor(d / 30) + " mo ago";
    const y = Math.floor(d / 365);
    return y + (y === 1 ? " yr ago" : " yrs ago");
  }

  function clock(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = String(sec % 60).padStart(2, "0");
    return h ? h + ":" + String(m).padStart(2, "0") + ":" + s : m + ":" + s;
  }

  // text match for the category dropdown: every typed word must appear
  const words = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (text, ws) => ws.every((w) => text.toLowerCase().includes(w));

  /* ---------------------------------------------------------------- */
  /* Cards (DESIGN.md 3.4)                                             */
  /* ---------------------------------------------------------------- */

  // YouTube answers a missing size with a 120x90 grey placeholder, not an
  // error: step down to hqdefault, and drop the card if the video is gone
  function thumb(it, card) {
    const a = el("a", "thumb");
    a.href = watchUrl(it.vid);
    a.tabIndex = -1; // the title link is the keyboard stop
    a.setAttribute("aria-hidden", "true");
    const i = el("img");
    i.loading = "lazy";
    i.alt = "";
    let fallback = true;
    const check = () => {
      if (i.naturalWidth > 120) return;
      if (fallback) {
        fallback = false;
        i.src = img(it.vid, "hqdefault.jpg");
      } else {
        card.remove();
      }
    };
    i.addEventListener("load", check);
    i.addEventListener("error", check);
    i.src = img(it.vid, "hq720.jpg");
    a.append(i);
    if (it.duration) a.append(el("span", "duration", clock(it.duration)));
    if (it.watched) a.append(el("span", "seen", "Watched"));
    return a;
  }

  // Channel · 11K views · 10 yrs ago. Views and age need YouTube stats the
  // catalogue may not have; then the years HN recommended it stand in.
  function channelLine(it) {
    const parts = [it.channel];
    if (it.views) parts.push(compact.format(it.views) + " views");
    parts.push(it.published ? ago(it.published) : years(it) ? "HN " + years(it) : "");
    return parts.filter(Boolean).join(" · ");
  }

  function hnLine(it) {
    const line = el("div", "hn mono");
    const tip = [it.why, it.quote ? "“" + it.quote + "”" : ""].filter(Boolean).join("\n\n");
    if (tip) line.title = tip;
    if (it.points) {
      const p = el("span", "pts");
      p.append(icon("up"), plain.format(it.points));
      line.append(p);
    }
    if (it.story || it.quoteId) {
      const c = el("a", "cmts");
      c.href = hnUrl(it.story || it.quoteId);
      c.target = "_blank";
      c.rel = "noopener";
      c.append(icon("comments"));
      c.append(
        it.story
          ? plain.format(it.comments) + (it.comments === 1 ? " comment" : " comments")
          : "top comment"
      );
      line.append(c);
    }
    if (!it.points) {
      line.append(el("span", "recs", it.recs + (it.recs === 1 ? " recommender" : " recommenders")));
    }
    return line;
  }

  function card(it) {
    const c = el("article", "card");
    c.dataset.vid = it.vid;
    const t = el("a", "title", it.title);
    t.href = watchUrl(it.vid);
    t.title = it.title;
    const meta = el("div", "meta");
    meta.append(t, el("div", "sub", channelLine(it)), hnLine(it));
    const dots = button("dots", null, "more", (e) => {
      e.stopPropagation();
      openCardMenu(dots, it, c);
    });
    dots.title = "More";
    dots.setAttribute("aria-label", "More about " + it.title);
    dots.setAttribute("aria-haspopup", "menu");
    dots.setAttribute("aria-expanded", "false");
    c.append(thumb(it, c), meta, dots);
    return c;
  }

  function grid(items, cls) {
    const g = el("div", cls ? "grid " + cls : "grid");
    for (const it of items) g.append(card(it));
    return g;
  }

  /* ---------------------------------------------------------------- */
  /* Menus: ⋮ on a card, Sort, Uploaded, Type, Duration                */
  /* ---------------------------------------------------------------- */

  let menu = null; // { el, anchor }

  function closeMenu() {
    if (!menu) return;
    menu.anchor.setAttribute("aria-expanded", "false");
    menu.el.remove();
    menu = null;
  }

  // a menu inside `host` (position:relative), under `anchor`
  function showMenu(anchor, host, build, cls) {
    const same = menu && menu.anchor === anchor;
    closeMenu();
    if (same) return;
    const m = el("div", "menu " + (cls || ""));
    m.setAttribute("role", "menu");
    menu = { el: m, anchor };
    build(m);
    host.append(m);
    anchor.setAttribute("aria-expanded", "true");
    return m;
  }

  function menuItem(m, label, { iconName, role, checked, onPick, keepOpen, box }) {
    const b = el("button", "item");
    b.type = "button";
    b.setAttribute("role", role || "menuitem");
    if (checked != null) b.setAttribute("aria-checked", String(!!checked));
    if (iconName) b.append(icon(iconName));
    if (box) {
      const bx = el("span", "box");
      bx.append(icon("check"));
      b.append(bx);
    }
    b.append(el("span", null, label));
    if (checked != null && !box) b.append(icon("check", "tick"));
    b.addEventListener("click", () => {
      if (!keepOpen) closeMenu();
      onPick(b);
    });
    m.append(b);
    return b;
  }

  function openCardMenu(anchor, it, cardEl) {
    const same = menu && menu.anchor === anchor;
    closeMenu();
    if (same) return;
    const m = el("div", "menu");
    m.setAttribute("role", "menu");
    menu = { el: m, anchor };
    const item = (iconName, label, act) => menuItem(m, label, { iconName, onPick: act });
    const link = (iconName, label, href) => {
      const a = el("a", "item");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener";
      a.setAttribute("role", "menuitem");
      a.append(icon(iconName), el("span", null, label));
      a.addEventListener("click", closeMenu);
      m.append(a);
    };
    item("like", "More like this", () => (location.hash = hash("like", it.vid)));
    item("channel", "More from " + it.channel, () => (location.hash = hash("channel", it.channel)));
    link("comments", "See what HN said", "https://hackertube.org/watch/" + encodeURIComponent(it.vid));
    if (it.quoteId) link("quote", "Read the top comment", hnUrl(it.quoteId));
    item("block", "Not interested", () => {
      send({ type: "hn:block", vid: it.vid });
      cardEl.remove();
    });
    m.style.position = "absolute";
    document.body.append(m);
    anchor.setAttribute("aria-expanded", "true");
    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8));
    const top = r.bottom + h + 8 < innerHeight ? r.bottom + 4 : r.top - h - 4;
    m.style.left = left + scrollX + "px";
    m.style.top = top + scrollY + "px";
    m.querySelector(".item").focus();
  }
  document.addEventListener("pointerdown", (e) => {
    if (menu && !menu.el.contains(e.target) && !menu.anchor.contains(e.target)) closeMenu();
  });
  addEventListener("resize", closeMenu);

  /* ---------------------------------------------------------------- */
  /* Sections (the other views)                                        */
  /* ---------------------------------------------------------------- */

  function section(title, opts = {}) {
    const s = el("section", "section");
    const head = el("div", "section-head");
    const h = el("h2");
    if (opts.muted) h.append(el("span", "muted", opts.muted + " "));
    h.append(title);
    head.append(h);
    if (opts.note) head.append(el("span", "note", opts.note));
    if (opts.actions && opts.actions.length) {
      const a = el("div", "actions");
      a.append(...opts.actions);
      head.append(a);
    }
    s.append(head);
    return s;
  }

  function moreButton(onClick) {
    const wrap = el("div", "more-wrap");
    wrap.append(button("btn", "Show more", null, onClick));
    return wrap;
  }

  function empty(lines) {
    const p = el("p", "empty");
    for (const l of lines) {
      if (typeof l === "string") p.append(l);
      else p.append(el("b", null, l.b));
    }
    return p;
  }

  // a grid shown PAGE at a time from a list we already have
  function paged(sec, items, onShow) {
    let shown = 0;
    const g = grid([]);
    sec.append(g);
    let more = null;
    const step = () => {
      const next = items.slice(shown, shown + PAGE);
      for (const it of next) g.append(card(it));
      shown += next.length;
      if (onShow && next.length) onShow(next);
      if (more) more.remove();
      more = shown < items.length ? moreButton(step) : null;
      if (more) sec.append(more);
    };
    step();
  }

  const reportShown = (items) => send({ type: "hn:shown", vids: items.map((i) => i.vid) });

  function linkButton(label, href) {
    const a = el("a", "btn", label);
    a.href = href;
    a.append(icon("next"));
    return a;
  }

  function externalButton(label, href) {
    const a = el("a", "btn", label);
    a.href = href;
    a.append(icon("open"));
    return a;
  }

  function crumb(label, href) {
    const c = el("a", "crumb");
    c.href = href;
    c.append(icon("back"), el("span", null, label));
    return c;
  }

  /* ---------------------------------------------------------------- */
  /* Browse: the design's page                                         */
  /* ---------------------------------------------------------------- */

  let topicsData = { areas: [], has: {}, total: 0 };
  let areaById = new Map();
  let catById = new Map(); // topic id -> { cat, area }
  let B = null; // the live Browse page: { F, els..., pop... }

  function indexTopics(res) {
    topicsData = Object.assign({ areas: [], has: {}, total: 0 }, res || {});
    areaById = new Map(topicsData.areas.map((a) => [a.id, a]));
    catById = new Map();
    for (const a of topicsData.areas) for (const c of a.cats) catById.set(c.id, { cat: c, area: a });
  }

  const split = (s) => (s ? s.split(",").filter(Boolean) : []);

  // filters <-> the hash query, so Back, reload and shared links keep them
  function parseFilters(qs) {
    const p = new URLSearchParams(qs || "");
    const has = topicsData.has && topicsData.has.youtube;
    const f = {
      cat: areaById.has(p.get("cat")) ? p.get("cat") : "all",
      topics: split(p.get("t")).filter((id) => catById.has(id)),
      up: has && UPLOADED.includes(p.get("up")) ? p.get("up") : DEFAULTS.up,
      types: split(p.get("ty")).filter((t) => TYPES.includes(t) && !(settings.hide_music && t === "Music")),
      du: has && DURATIONS.includes(p.get("du")) ? p.get("du") : DEFAULTS.du,
      gems: p.get("gems") === "1",
      ever: p.get("ever") === "1",
      sort: DEFAULTS.sort,
    };
    const s = SORTS.find((x) => x[0] === p.get("sort") && (!x[2] || has));
    if (s) f.sort = s[0];
    // topics must belong to the category in view
    if (f.cat !== "all") f.topics = f.topics.filter((id) => catById.get(id).area.id === f.cat);
    return f;
  }

  function filtersQuery(f) {
    const p = new URLSearchParams();
    if (f.cat !== DEFAULTS.cat) p.set("cat", f.cat);
    if (f.topics.length) p.set("t", f.topics.join(","));
    if (f.up !== DEFAULTS.up) p.set("up", f.up);
    if (f.types.length) p.set("ty", f.types.join(","));
    if (f.du !== DEFAULTS.du) p.set("du", f.du);
    if (f.gems) p.set("gems", "1");
    if (f.ever) p.set("ever", "1");
    if (f.sort !== DEFAULTS.sort) p.set("sort", f.sort);
    return p.toString().replace(/%2C/g, ",");
  }

  const barFiltersSet = (f) =>
    f.up !== DEFAULTS.up || f.types.length || f.du !== DEFAULTS.du || f.gems || f.ever;

  function queryOf(f, extra) {
    return Object.assign(
      {
        category: f.cat,
        topics: f.topics,
        types: f.types.map((t) => t.toLowerCase()),
        uploaded: f.up,
        duration: f.du,
        hiddenGems: f.gems,
        evergreen: f.ever,
        sort: f.sort,
      },
      extra
    );
  }

  /* ---- applying a change ---- */

  function setFilters(patch) {
    Object.assign(B.F, patch);
    const f = B.F;
    // a topic outside the chosen category would match nothing: choosing one
    // widens the category to All; choosing a category drops other categories' topics
    if (patch.topics && f.cat !== "all" && f.topics.some((id) => catById.get(id).area.id !== f.cat)) f.cat = "all";
    if ("cat" in patch && f.cat !== "all") f.topics = f.topics.filter((id) => catById.get(id).area.id === f.cat);
    setHash("#browse" + (filtersQuery(f) ? "?" + filtersQuery(f) : ""));
    renderPills();
    updateBar();
    if (B.popOpen) syncPop();
    loadResults(true);
  }

  /* ---- results ---- */

  async function loadResults(reset) {
    const b = B;
    const id = ++b.resultsId;
    if (reset) b.offset = 0;
    const res = await ask("hn:browse", queryOf(b.F, { offset: b.offset, n: PAGE }));
    if (B !== b || id !== b.resultsId) return; // left the page, or a newer query won
    const items = (res && res.items) || [];
    if (reset) b.results.replaceChildren();
    if (b.moreEl) b.moreEl.remove();
    b.moreEl = null;
    if (reset && !items.length) {
      const e = empty([{ b: "Nothing matches." }, " Loosen a filter, or pick another category."]);
      if (barFiltersSet(b.F) || b.F.topics.length) e.append(" ", button("btn", "Clear filters", null, clearAll));
      b.results.append(e);
      return;
    }
    let g = b.results.querySelector(".grid");
    if (!g) b.results.append((g = grid([])));
    for (const it of items) g.append(card(it));
    b.offset += items.length;
    if (b.offset < ((res && res.total) || 0)) {
      b.moreEl = moreButton(() => loadResults(false));
      b.results.append(b.moreEl);
    }
  }

  function clearBar() {
    setFilters({ up: DEFAULTS.up, types: [], du: DEFAULTS.du, gems: false, ever: false });
  }
  function clearAll() {
    setFilters({ up: DEFAULTS.up, types: [], du: DEFAULTS.du, gems: false, ever: false, topics: [] });
  }

  /* ---- header: badge, title, topic search, Sort ---- */

  function buildHeader() {
    const ph = el("div", "ph");
    ph.append(el("span", "badge", "HN"), el("h1", null, "Hacker News"));

    const form = el("form", "tsearch");
    form.setAttribute("role", "search");
    form.append(icon("search"));
    const input = el("input");
    input.type = "search";
    input.placeholder = "Find a category or topic";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-label", "Find a category or topic");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-controls", "kempt-pop");
    const kbd = el("span", "kbd");
    kbd.append(el("span", "k-slash", "/"), el("span", "k-esc", "esc"));
    form.append(input, kbd);

    const sort = el("div", "sort");
    const sb = el("button", "sort-btn");
    sb.type = "button";
    sb.setAttribute("aria-haspopup", "menu");
    sb.setAttribute("aria-expanded", "false");
    const sval = el("span", "val");
    sb.append(el("span", "lbl", "Sort"), sval, icon("chevron", "chev"));
    sb.addEventListener("click", () => {
      closePop();
      showMenu(sb, sort, (m) => {
        const has = topicsData.has && topicsData.has.youtube;
        for (const [id, label, needs] of SORTS) {
          if (needs && !has) continue;
          menuItem(m, label, {
            role: "menuitemradio",
            checked: B.F.sort === id,
            onPick: () => setFilters({ sort: id }),
          });
        }
      }, "right");
    });
    sort.append(sb);

    ph.append(form, sort);
    B.input = input;
    B.search = form;
    B.sortVal = sval;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) location.hash = hash("search", text); // video search, as before
    });
    return ph;
  }

  /* ---- 3.2 pills ---- */

  function renderPills() {
    const f = B.F;
    const bar = B.pills;
    const sorted = topicsData.areas; // largest first
    const top = sorted.slice(0, PILLS);
    const shown = top.slice();
    const current = areaById.get(f.cat);
    if (current && !shown.includes(current)) shown.push(current); // never hide the active one
    const pill = (id, label, count) => {
      const b = el("button", "pill");
      b.type = "button";
      b.setAttribute("aria-pressed", String(f.cat === id));
      b.append(el("span", null, label), el("span", "count", plain.format(count)));
      b.addEventListener("click", () => {
        closePop();
        if (f.cat !== id) setFilters({ cat: id });
      });
      return b;
    };
    const more = el("button", "pill more");
    more.type = "button";
    more.setAttribute("aria-haspopup", "listbox");
    more.setAttribute("aria-expanded", String(!!B.popOpen));
    more.setAttribute("aria-controls", "kempt-pop");
    more.append(el("span", null, "More"), icon("chevron", "chev"));
    more.addEventListener("click", () => {
      if (B.popOpen) {
        closePop();
        B.input.blur();
      } else {
        B.input.focus(); // focusing the search is what opens it
        openPop();
      }
    });
    B.morePill = more;
    bar.replaceChildren(
      pill("all", "All", topicsData.total),
      ...shown.map((a) => pill(a.id, a.name, a.count)),
      more
    );
  }

  /* ---- 3.3 filter bar ---- */

  function dropdownButton(label) {
    const wrap = el("div", "dd");
    const b = el("button", "dd-btn");
    b.type = "button";
    b.setAttribute("aria-haspopup", "menu");
    b.setAttribute("aria-expanded", "false");
    const val = el("span", "val");
    b.append(el("span", "lbl", label), val, icon("chevron", "chev"));
    wrap.append(b);
    return { wrap, b, val };
  }

  function buildBar() {
    const bar = el("div", "fbar");
    const has = topicsData.has && topicsData.has.youtube;
    const bits = (B.bar = {});

    const choose = (key, label, options) => {
      const d = dropdownButton(label);
      d.b.addEventListener("click", () => {
        closePop();
        showMenu(d.b, d.wrap, (m) => {
          for (const o of options) {
            menuItem(m, o, {
              role: "menuitemradio",
              checked: B.F[key] === o,
              onPick: () => setFilters({ [key]: o }),
            });
          }
        });
      });
      bits[key] = d;
      bar.append(d.wrap);
    };

    if (has) choose("up", "Uploaded", UPLOADED);

    const t = dropdownButton("Type");
    t.b.addEventListener("click", () => {
      closePop();
      showMenu(t.b, t.wrap, (m) => {
        m.setAttribute("aria-multiselectable", "true");
        for (const type of TYPES) {
          if (settings.hide_music && type === "Music") continue;
          menuItem(m, type, {
            role: "menuitemcheckbox",
            checked: B.F.types.includes(type),
            box: true,
            keepOpen: true,
            onPick: (b) => {
              const on = !B.F.types.includes(type);
              b.setAttribute("aria-checked", String(on));
              setFilters({ types: TYPES.filter((x) => (x === type ? on : B.F.types.includes(x))) });
            },
          });
        }
      });
    });
    bits.types = t;
    bar.append(t.wrap);

    if (has) choose("du", "Duration", DURATIONS);

    const toggle = (key, label) => {
      const l = el("label", "check");
      const cb = el("input");
      cb.type = "checkbox";
      const box = el("span", "box");
      box.append(icon("check"));
      l.append(cb, box, label);
      cb.addEventListener("change", () => setFilters({ [key]: cb.checked }));
      bits[key] = cb;
      return l;
    };
    bar.append(
      el("span", "fdivider"),
      toggle("gems", "Hidden gems"),
      toggle("ever", "Evergreen only")
    );

    const clear = el("button", "clear", "Clear filters");
    clear.type = "button";
    clear.addEventListener("click", () => {
      if (barFiltersSet(B.F)) clearBar();
    });
    bits.clear = clear;
    bar.append(clear);
    return bar;
  }

  function updateBar() {
    const f = B.F;
    const b = B.bar;
    const mark = (d, text, isSet) => {
      d.val.textContent = text;
      d.b.classList.toggle("set", isSet);
    };
    if (b.up) mark(b.up, f.up, f.up !== DEFAULTS.up);
    mark(b.types, f.types.length ? f.types.join(", ") : "Any", f.types.length > 0);
    if (b.du) mark(b.du, f.du, f.du !== DEFAULTS.du);
    b.gems.checked = f.gems;
    b.ever.checked = f.ever;
    b.clear.setAttribute("aria-disabled", String(!barFiltersSet(f)));
    B.sortVal.textContent = SORTS.find((s) => s[0] === f.sort)[1];
  }

  /* ---- 3.5 the category dropdown ---- */

  function buildPop() {
    const pop = el("div", "pop");
    pop.id = "kempt-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Categories and topics");
    if ("popover" in HTMLElement.prototype) pop.setAttribute("popover", "manual");
    const body = el("div", "pop-body");
    const cats = el("div", "pop-col cats");
    cats.setAttribute("role", "listbox");
    cats.setAttribute("aria-label", "Categories");
    const topics = el("div", "pop-col topics");
    topics.setAttribute("role", "group");
    topics.setAttribute("aria-label", "Topics");
    const top = el("div", "pop-col top");
    top.setAttribute("role", "group");
    top.setAttribute("aria-label", "Top in category");
    body.append(cats, topics, top);
    const foot = el("div", "pop-foot");
    pop.append(body, foot);
    Object.assign(B, { pop, popBody: body, colCats: cats, colTopics: topics, colTop: top, popFoot: foot });
    B.q = "";
    B.active = null;

    // hovering or focusing a category shows its topics and best videos
    cats.addEventListener("pointerover", (e) => {
      const row = e.target.closest(".cat");
      if (row) setActive(row.dataset.id);
    });
    cats.addEventListener("focusin", (e) => {
      const row = e.target.closest(".cat");
      if (row) setActive(row.dataset.id);
    });
    pop.addEventListener("keydown", popKeys);
    document.body.append(pop);
  }

  const visibleAreas = () => {
    const ws = words(B.q);
    if (!ws.length) return topicsData.areas;
    return topicsData.areas.filter((a) => hit(a.name, ws) || a.cats.some((c) => hit(c.name, ws)));
  };
  const visibleTopics = (area) => {
    const ws = words(B.q);
    if (!ws.length || hit(area.name, ws)) return area.cats;
    return area.cats.filter((c) => hit(c.name, ws));
  };

  function renderCats() {
    const areas = visibleAreas();
    if (!areas.some((a) => a.id === B.active)) {
      B.active = (areas.find((a) => a.id === B.F.cat) || areas[0] || {}).id || null;
    }
    const rows = areas.map((a) => {
      const r = el("button", "cat" + (a.name === "Other" ? " other" : "") + (a.id === B.active ? " active" : ""));
      r.type = "button";
      r.dataset.id = a.id;
      r.setAttribute("role", "option");
      r.setAttribute("aria-selected", String(a.id === B.F.cat));
      r.append(el("span", "name", a.name), el("span", "n", plain.format(a.count)));
      r.addEventListener("click", () => {
        closePop();
        B.input.blur();
        setFilters({ cat: a.id });
      });
      return r;
    });
    if (!rows.length) rows.push(el("div", "pop-empty", "No category or topic matches “" + B.q + "”."));
    B.colCats.replaceChildren(...rows);
    renderTopicsCol();
    scheduleTop();
  }

  function setActive(id) {
    if (!id || id === B.active) return;
    B.active = id;
    for (const r of B.colCats.querySelectorAll(".cat")) r.classList.toggle("active", r.dataset.id === id);
    renderTopicsCol();
    scheduleTop();
  }

  function renderTopicsCol() {
    const area = areaById.get(B.active);
    const col = B.colTopics;
    if (!area) return col.replaceChildren();
    const list = visibleTopics(area);
    const head = el("div", "col-head");
    head.append(el("span", "label", "Topics"));
    const all = el("button", "aside", "View all " + area.cats.length + " →");
    all.type = "button";
    all.addEventListener("click", () => {
      const ids = new Set(B.F.topics);
      for (const c of area.cats) ids.add(c.id);
      setFilters({ topics: [...ids] });
    });
    head.append(all);
    const rows = list.map((c) => {
      const row = el("label", "trow");
      const cb = el("input");
      cb.type = "checkbox";
      cb.dataset.id = c.id;
      cb.checked = B.F.topics.includes(c.id);
      const box = el("span", "box");
      box.append(icon("check"));
      row.append(cb, box, el("span", "name", c.name), el("span", "n", plain.format(c.count)));
      cb.addEventListener("change", () => {
        const set = new Set(B.F.topics);
        if (cb.checked) set.add(c.id);
        else set.delete(c.id);
        setFilters({ topics: [...set] });
      });
      return row;
    });
    col.replaceChildren(head, ...rows);
    if (!rows.length) col.append(el("div", "pop-empty", "No topics match."));
  }

  // "Top in category": the grid's own query, best first, three of them
  let topTimer = 0;
  function scheduleTop() {
    clearTimeout(topTimer);
    topTimer = setTimeout(renderTopCol, 120);
  }
  async function renderTopCol() {
    const area = areaById.get(B.active);
    const col = B.colTop;
    if (!area) return col.replaceChildren();
    const recent = topicsData.has && topicsData.has.youtube;
    const head = el("div", "col-head");
    head.append(el("span", "label", "Top in " + area.name), el("span", "aside muted", recent ? "This year" : "On HN"));
    col.replaceChildren(head);
    B.topCache = B.topCache || new Map();
    if (!B.topCache.has(area.id)) {
      B.topCache.set(area.id, ask("hn:browse", { category: area.id, sort: "best", n: 3, uploaded: recent ? "Past year" : "Any time" }));
    }
    const res = await B.topCache.get(area.id);
    if (!B || B.active !== area.id) return;
    for (const it of (res && res.items) || []) {
      const a = el("a", "mini");
      a.href = watchUrl(it.vid);
      const th = el("span", "mthumb");
      const i = el("img");
      i.alt = "";
      i.loading = "lazy";
      i.src = img(it.vid, "mqdefault.jpg");
      th.append(i);
      if (it.duration) th.append(el("span", "duration", clock(it.duration)));
      const text = el("span", "mtext");
      const pts = el("span", "mpts mono");
      if (it.points) pts.append(icon("up"), " " + plain.format(it.points));
      else pts.textContent = it.recs + (it.recs === 1 ? " recommender" : " recommenders");
      text.append(el("span", "mtitle", it.title), pts, el("span", "msrc", it.channel));
      a.append(th, text);
      col.append(a);
    }
  }

  function renderFoot() {
    const n = B.F.topics.length;
    const sel = el("span", "sel");
    sel.append(el("b", null, String(n)), " " + (n === 1 ? "topic" : "topics") + " selected");
    const clr = el("button", "clr", "Clear");
    clr.type = "button";
    clr.addEventListener("click", () => setFilters({ topics: [] }));
    const browse = el("a", "browse", "Browse all categories →");
    browse.href = "#topics";
    B.popFoot.replaceChildren(sel, clr, browse);
  }

  // after a filter change while open: ticks and footer follow, nothing re-flows
  function syncPop() {
    for (const cb of B.colTopics.querySelectorAll("input[data-id]")) cb.checked = B.F.topics.includes(cb.dataset.id);
    for (const r of B.colCats.querySelectorAll(".cat")) r.setAttribute("aria-selected", String(r.dataset.id === B.F.cat));
    renderFoot();
  }

  function positionPop() {
    if (!B || !B.popOpen) return;
    const r = B.search.getBoundingClientRect();
    const pop = B.pop;
    const top = r.bottom + 8; // 8px gap, same width as the search
    pop.style.left = r.left + "px";
    pop.style.top = top + "px";
    pop.style.width = r.width + "px";
    // never taller than the window
    const room = innerHeight - top - 48 - 16;
    pop.style.setProperty("--pop-h", Math.max(160, Math.min(372, room)) + "px");
  }

  function openPop() {
    if (!B || B.popOpen) return;
    closeMenu();
    B.popOpen = true;
    B.input.setAttribute("aria-expanded", "true");
    B.search.classList.add("on");
    if (B.morePill) B.morePill.setAttribute("aria-expanded", "true");
    renderCats();
    renderFoot();
    B.pop.classList.add("open");
    if (B.pop.hasAttribute("popover")) {
      try {
        B.pop.showPopover();
      } catch (e) {
        // already showing
      }
    }
    positionPop();
  }

  function closePop() {
    if (!B || !B.popOpen) return;
    B.popOpen = false;
    B.input.setAttribute("aria-expanded", "false");
    B.search.classList.remove("on");
    if (B.morePill) B.morePill.setAttribute("aria-expanded", "false");
    B.pop.classList.remove("open");
    if (B.pop.hasAttribute("popover")) {
      try {
        B.pop.hidePopover();
      } catch (e) {
        // already hidden
      }
    }
  }

  // ↑/↓ within a column, ←/→ between columns, Space toggles a topic (native)
  function popKeys(e) {
    const t = e.target;
    const col = t.closest(".pop-col");
    if (!col) return;
    const rows = (c) => [...c.querySelectorAll(c === B.colCats ? ".cat" : c === B.colTopics ? "input[data-id]" : ".mini")];
    const list = rows(col);
    const at = list.indexOf(t);
    let to = null;
    if (e.key === "ArrowDown") to = list[Math.min(list.length - 1, at + 1)];
    else if (e.key === "ArrowUp") {
      if (at <= 0) {
        e.preventDefault();
        return B.input.focus();
      }
      to = list[at - 1];
    } else if (e.key === "ArrowRight") {
      const next = col === B.colCats ? B.colTopics : col === B.colTopics ? B.colTop : null;
      to = next && rows(next)[0];
    } else if (e.key === "ArrowLeft") {
      if (col === B.colTopics) to = B.colCats.querySelector(".cat.active") || rows(B.colCats)[0];
      else if (col === B.colTop) to = rows(B.colTopics)[0];
    } else if (e.key === "Home") to = list[0];
    else if (e.key === "End") to = list[list.length - 1];
    if (to) {
      e.preventDefault();
      to.focus();
    }
  }

  function wireSearch() {
    const { input, search } = B;
    input.addEventListener("focus", openPop);
    search.addEventListener("pointerdown", () => {
      // clicking into an already-focused search after Esc/pick opens it again
      if (!B.popOpen) setTimeout(openPop, 0);
    });
    input.addEventListener("input", () => {
      B.q = input.value;
      if (!B.popOpen) openPop();
      else renderCats();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey && B.popOpen)) {
        const first = B.colCats.querySelector(".cat.active") || B.colCats.querySelector(".cat");
        if (first) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === "Escape" && B.popOpen) {
        e.preventDefault();
        e.stopPropagation();
        closePop();
        input.blur();
      }
    });
  }

  async function browseView(qs, id) {
    const res = await ask("hn:topics");
    if (id !== renderId) return null; // a newer view won while we waited
    indexTopics(res);
    const page = el("div", "page");
    B = {
      F: parseFilters(qs), page, results: el("div", "results"),
      popOpen: false, resultsId: 0, offset: 0, moreEl: null,
    };
    const header = buildHeader();
    B.pills = el("div", "pills");
    B.pills.setAttribute("role", "group");
    B.pills.setAttribute("aria-label", "Categories");
    const bar = buildBar();
    page.append(header, B.pills, bar, B.results);
    buildPop();
    wireSearch();
    renderPills();
    updateBar();
    const mine = B;
    await loadResults(true);
    if (B !== mine) return null; // left Browse while the first page loaded
    return [page];
  }

  function leaveBrowse() {
    if (!B) return;
    closePop();
    B.pop.remove();
    B = null;
  }

  // page-wide: click outside, focus leaving, scroll/resize
  document.addEventListener("pointerdown", (e) => {
    if (!B || !B.popOpen) return;
    const t = e.target;
    if (B.pop.contains(t) || B.search.contains(t) || (B.morePill && B.morePill.contains(t))) return;
    closePop();
  });
  document.addEventListener("focusin", (e) => {
    if (!B || !B.popOpen) return;
    const t = e.target;
    if (B.pop.contains(t) || B.search.contains(t) || (B.morePill && B.morePill.contains(t))) return;
    closePop();
  });
  addEventListener("resize", positionPop);
  addEventListener("scroll", positionPop, { passive: true });

  /* ---------------------------------------------------------------- */
  /* The other views                                                   */
  /* ---------------------------------------------------------------- */

  // the last draw per mode survives going to YouTube and coming Back
  function cached(mode) {
    try {
      return JSON.parse(sessionStorage.getItem("kempt-draw-" + mode));
    } catch (e) {
      return null;
    }
  }
  function remember(mode, items) {
    try {
      sessionStorage.setItem("kempt-draw-" + mode, JSON.stringify(items));
    } catch (e) {
      // storage unavailable: just draw again next time
    }
  }

  async function drawn(mode, fresh) {
    let items = fresh ? null : cached(mode);
    if (!items) {
      const res = await ask("hn:feed", { mode, n: 96 });
      items = (res && res.items) || [];
      remember(mode, items);
    }
    return items;
  }

  async function forYouView(fresh) {
    const parts = [];
    const inRows = new Set();
    const res = await ask("hn:because", { rows: 2, n: 8 });
    for (const row of (res && res.rows) || []) {
      const s = section(row.seed.title, {
        muted: "Because you watched",
        actions: [linkButton("More like this", hash("like", row.seed.vid))],
      });
      s.classList.add("because");
      s.append(grid(row.items, "row"));
      for (const it of row.items) inRows.add(it.vid);
      parts.push(s);
    }
    // the cached draw stays whole; a video already in a "Because you watched"
    // row is just skipped here so it doesn't show twice on one screen
    const items = (await drawn("foryou", fresh)).filter((it) => !inRows.has(it.vid));
    const shuffle = button("btn", "Shuffle", "shuffle", () => render(true));
    const s = section("Picked for you", {
      note: "A fresh draw each time; it learns from what you watch",
      actions: [shuffle],
    });
    paged(s, items, reportShown);
    parts.push(s);
    return parts;
  }

  async function likeView(vid) {
    const res = await ask("hn:like", { vid, n: 48 });
    if (!res || !res.seed) return [empty(["That video isn't in the catalogue."])];
    const s = section(res.seed.title, { muted: "More like" });
    paged(s, res.items);
    return [crumb("Browse", "#browse"), s];
  }

  // "Browse all categories": the 16 areas
  async function topicsView() {
    const res = await ask("hn:topics");
    indexTopics(res);
    const s = section("Categories", { note: "16 categories, 150 topics" });
    const g = el("div", "areas");
    for (const a of topicsData.areas) {
      const tile = el("a", "area");
      tile.href = "#browse?cat=" + encodeURIComponent(a.id);
      tile.append(el("h3", null, a.name), el("div", "count", plain.format(a.count) + " videos"));
      tile.append(el("p", null, a.cats.slice(0, 5).map((c) => c.name).join(" · ")));
      g.append(tile);
    }
    s.append(g);
    return [crumb("Browse", "#browse"), s];
  }

  async function searchView(text) {
    const res = await ask("hn:search", { q: text, n: 96 });
    const items = (res && res.items) || [];
    const onYouTube = externalButton("Search YouTube", ytSearch(text));
    const s = section("“" + text + "”", {
      muted: "Search",
      note: items.length ? items.length + " found" : "",
      actions: [onYouTube],
    });
    if (!items.length) s.append(empty([{ b: "No matches." }, " Try a broader word, or search YouTube."]));
    else paged(s, items);
    return [crumb("Browse", "#browse"), s];
  }

  async function channelsView() {
    const res = await ask("hn:channels", { n: 120 });
    const list = (res && res.channels) || [];
    const s = section("Channels", { note: "Subscribing is the strongest signal you can send YouTube" });
    const g = el("div", "grid channels");
    for (const ch of list) {
      const t = el("article", "channel");
      const cover = el("a", "thumb");
      cover.href = hash("channel", ch.name);
      const i = el("img");
      i.loading = "lazy";
      i.alt = "";
      // cover: the channel's best video still on YouTube (gone ones give a placeholder)
      let k = 0;
      const next = () => {
        if (i.naturalWidth > 120 || ++k >= ch.top.length) return;
        i.src = img(ch.top[k].vid, "hqdefault.jpg");
      };
      i.addEventListener("load", next);
      i.addEventListener("error", next);
      i.src = img(ch.top[0].vid, "hqdefault.jpg");
      cover.append(i, el("span", "tag", ch.videos + " videos"));
      const name = el("a", "title", ch.name);
      name.href = hash("channel", ch.name);
      const best = el("p", "why", ch.top.map((v) => v.title).join(" · "));
      const acts = el("div", "channel-actions");
      acts.append(externalButton("Subscribe on YouTube", ytChannel(ch.name)));
      t.append(cover, name, el("div", "sub", ch.recs + " HN recommendations"), best, acts);
      g.append(t);
    }
    s.append(g);
    return [s];
  }

  async function channelView(name) {
    const res = await ask("hn:channel", { name });
    const items = (res && res.items) || [];
    const s = section(name, {
      note: items.length + (items.length === 1 ? " video HN recommends" : " videos HN recommends"),
      actions: [externalButton("Subscribe on YouTube", ytChannel(name))],
    });
    if (!items.length) s.append(empty(["No videos from this channel in the catalogue."]));
    else paged(s, items);
    return [crumb("All channels", "#channels"), s];
  }

  async function watchedView() {
    const res = await send({ type: "hn:history" });
    const items = (res && res.items) || [];
    const s = section("Watched", { note: "Videos from here you've opened on YouTube" });
    if (!items.length) {
      s.append(
        empty([
          "Nothing yet. Open anything from ",
          { b: "For you" },
          " or Browse and it shows up here; each one also tunes your picks.",
        ])
      );
    } else {
      paged(s, items);
    }
    return [s];
  }

  /* ---------------------------------------------------------------- */
  /* Router                                                            */
  /* ---------------------------------------------------------------- */

  function parse() {
    const raw = location.hash.replace(/^#\/?/, "");
    const at = raw.indexOf("?");
    const path = at < 0 ? raw : raw.slice(0, at);
    const parts = path.split("/").map(decodeURIComponent);
    return { name: parts[0] || "browse", args: parts.slice(1), qs: at < 0 ? "" : raw.slice(at + 1) };
  }

  let renderId = 0;
  let focusSearch = false; // "/" pressed on another view: focus once Browse is up

  const TAB_OF = {
    browse: "browse", topics: "browse", search: "browse", like: "browse",
    foryou: "foryou", channels: "channels", channel: "channels", watched: "watched",
  };

  async function render(fresh) {
    const id = ++renderId;
    closeMenu();
    leaveBrowse();
    let { name, args, qs } = parse();

    // older links land in Browse
    if (name === "classics") return redirect("#browse");
    if (name === "deep") return redirect("#browse?gems=1");
    if (name === "topic") {
      const tpc = await ask("hn:topics");
      indexTopics(tpc);
      if (args[0] === "area") return redirect("#browse?cat=" + encodeURIComponent(args[1] || ""));
      const hitCat = catById.get(args[1]);
      return redirect(
        hitCat
          ? "#browse?cat=" + encodeURIComponent(hitCat.area.id) + "&t=" + encodeURIComponent(hitCat.cat.id)
          : "#browse"
      );
    }

    for (const t of document.querySelectorAll(".views a")) {
      const on = t.dataset.tab === TAB_OF[name];
      t.classList.toggle("on", on);
      if (on) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
      if (on) reveal(t);
    }

    let parts;
    switch (name) {
      case "foryou":
        parts = await forYouView(fresh === true);
        break;
      case "like":
        parts = await likeView(args[0]);
        break;
      case "channels":
        parts = await channelsView();
        break;
      case "channel":
        parts = await channelView(args.join("/"));
        break;
      case "topics":
        parts = await topicsView();
        break;
      case "search":
        parts = await searchView(args.join("/"));
        break;
      case "watched":
        parts = await watchedView();
        break;
      default:
        parts = await browseView(qs, id);
    }
    if (id !== renderId || !parts) return; // a newer view won
    view.replaceChildren(...parts);
    document.title =
      name === "browse" || !TAB_OF[name]
        ? "Hacker News"
        : (parts.map((p) => p.querySelector && p.querySelector("h2")).find(Boolean)?.textContent || "Hacker News") + " · Hacker News";
    restoreScroll();
    if (B && focusSearch) {
      focusSearch = false;
      B.input.focus();
    }
  }

  function redirect(target) {
    setHash(target);
    return render(false);
  }

  // on narrow screens the view links scroll sideways: bring the selected one
  // into view (horizontally only, the page itself doesn't move)
  function reveal(item) {
    const strip = item.parentElement;
    const r = item.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    if (r.left < s.left || r.right > s.right) strip.scrollLeft += r.left - s.left - 16;
  }

  // keep your scroll position when coming Back from a video
  function scrollKey() {
    return "kempt-scroll-" + location.hash;
  }
  let restoring = true;
  function restoreScroll() {
    if (!restoring) return window.scrollTo(0, 0);
    restoring = false;
    let y = 0;
    try {
      y = +sessionStorage.getItem(scrollKey()) || 0;
    } catch (e) {
      // storage unavailable
    }
    window.scrollTo(0, y);
  }
  addEventListener("pagehide", () => {
    try {
      sessionStorage.setItem(scrollKey(), String(scrollY));
    } catch (e) {
      // storage unavailable
    }
  });

  addEventListener("hashchange", () => render(false));

  /* ---------------------------------------------------------------- */
  /* Keys                                                              */
  /* ---------------------------------------------------------------- */

  const typingIn = (t) =>
    t instanceof HTMLElement && (t.isContentEditable || (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== "checkbox"));

  addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (menu) {
        const a = menu.anchor;
        closeMenu();
        if (a.focus) a.focus();
      } else if (B && B.popOpen) {
        closePop();
        B.input.blur();
      }
      return;
    }
    // "/" focuses the topic search, but never while typing in a field
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typingIn(e.target)) {
      e.preventDefault();
      if (B) {
        B.input.focus();
        B.input.select();
      } else {
        focusSearch = true;
        location.hash = "#browse";
      }
    }
  });

  store.get(settings, (got) => {
    Object.assign(settings, got);
    render(false);
  });
})();
