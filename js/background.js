/*
 * kempt background: Hacker News picks.
 *
 * Holds the bundled HackerTube catalogue (data/hackertube.json), answers the
 * Hacker News page (hn.html) and keeps what kempt learns. Everything is local:
 * what you watch only ever updates chrome.storage.local.
 *
 * Taste model, deliberately small:
 *   - aff[cat]   category affinity. Watching a catalogued video raises its
 *                categories; "Not interested" lowers them.
 *   - watched    catalogued videos you've opened on YouTube (most recent last).
 *                They leave For you, and the videos most like them get a boost.
 *   - blocked    videos you dismissed.
 *   - shown      how often a video was on screen without being opened, so For
 *                you keeps moving instead of showing the same cards forever.
 * For you is a weighted random sample, so every visit is a fresh draw.
 */
"use strict";

const STATE_KEY = "kempt_hn";
const MAX_WATCHED = 400;
const MAX_SHOWN = 3000;

// row layout from tools/build_hackertube.py
const VID = 0, TITLE = 1, CHANNEL = 2, WHY = 3, QUOTE = 4, QUOTE_ID = 5, SCORE = 6,
  RECS = 7, STRONG = 8, FIRST = 9, LAST = 10, TYPE = 11, CATS = 12, SIM = 13,
  FLAGS = 14, STORY = 15, POINTS = 16, COMMENTS = 17, VIEWS = 18, DUR = 19, PUB = 20, LIKES = 21;
const EVERGREEN = 1;
// "Hidden gems" = the Deep cuts rule: loved by few
const isGem = (r) => r[SCORE] <= 6 && r[STRONG] >= 1;

const MODES = {
  foryou: { base: (r) => Math.pow(r[SCORE], 0.8) },
  classics: { base: (r) => Math.pow(r[SCORE], 2.5) },
  deep: { base: (r) => 1 + r[STRONG], keep: isGem },
};

let data = null;
let state = null; // { aff, watched, blocked, shown }

async function load() {
  if (!data) {
    const res = await fetch(chrome.runtime.getURL("data/hackertube.json"));
    const d = await res.json();
    d.byVid = new Map(d.v.map((r, i) => [r[VID], i]));
    d.musicType = d.types.indexOf("music");
    d.musicCats = new Set(
      d.cats.map((c, i) => (c[0] === "music-performance" ? i : -1)).filter((i) => i >= 0)
    );
    data = d;
  }
  if (!state) {
    const got = await chrome.storage.local.get(STATE_KEY);
    state = Object.assign({ aff: {}, watched: [], blocked: [], shown: {} }, got[STATE_KEY]);
  }
}

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ [STATE_KEY]: state }), 300);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function isMusic(r) {
  return r[TYPE] === data.musicType || r[CATS].some((c) => data.musicCats.has(c));
}

// may this video be shown at all?
function allowed(i, noMusic) {
  const r = data.v[i];
  return !state.blocked.includes(r[VID]) && !(noMusic && isMusic(r));
}

function card(i) {
  const r = data.v[i];
  return {
    vid: r[VID],
    title: r[TITLE],
    channel: r[CHANNEL],
    why: r[WHY],
    quote: r[QUOTE],
    quoteId: r[QUOTE_ID],
    recs: r[RECS],
    first: r[FIRST],
    last: r[LAST],
    type: data.types[r[TYPE]],
    topic: r[CATS].length ? data.cats[r[CATS][0]][1] : "",
    watched: state.watched.includes(r[VID]),
    // 0 = unknown for everything below (tools/enrich_hackertube.py fills them)
    story: r[STORY] || 0,
    points: r[POINTS] || 0,
    comments: r[COMMENTS] || 0,
    views: r[VIEWS] || 0,
    duration: r[DUR] || 0,
    published: r[PUB] || 0,
    likes: r[LIKES] || 0,
    gem: isGem(r),
    evergreen: !!((r[FLAGS] || 0) & EVERGREEN),
  };
}

/* ------------------------------------------------------------------ */
/* For you, Classics, Deep cuts                                        */
/* ------------------------------------------------------------------ */

function catBoost(r) {
  let s = 0;
  r[CATS].forEach((c, i) => (s += (state.aff[c] || 0) * (i === 0 ? 1 : 0.5)));
  return Math.exp(0.3 * Math.max(-5, Math.min(8, s)));
}

function similarToWatched() {
  const set = new Set();
  for (const vid of state.watched.slice(-40)) {
    const i = data.byVid.get(vid);
    if (i !== undefined) for (const j of data.v[i][SIM]) set.add(j);
  }
  return set;
}

// Efraimidis–Spirakis weighted sampling without replacement
function sample(weighted, n) {
  return weighted
    .map(([i, w]) => [i, Math.pow(Math.random(), 1 / w)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([i]) => i);
}

function feed({ mode = "foryou", n = 48, noMusic = false }) {
  const m = MODES[mode] || MODES.foryou;
  const watched = new Set(state.watched);
  const similar = similarToWatched();
  const weighted = [];
  data.v.forEach((r, i) => {
    if (watched.has(r[VID]) || !allowed(i, noMusic)) return;
    if (m.keep && !m.keep(r)) return;
    let w = m.base(r) * catBoost(r);
    if (similar.has(i)) w *= 4;
    w *= Math.pow(0.7, Math.min(state.shown[r[VID]] || 0, 10));
    weighted.push([i, w]);
  });
  return sample(weighted, n).map(card);
}

/* ------------------------------------------------------------------ */
/* Because you watched, More like this                                 */
/* ------------------------------------------------------------------ */

// similar videos first, then ones sharing the most topics, best first
function likeThis(i, n, noMusic, skipWatched) {
  const out = [];
  const seen = new Set([i]);
  const ok = (j) =>
    !seen.has(j) && allowed(j, noMusic) && !(skipWatched && state.watched.includes(data.v[j][VID]));
  for (const j of data.v[i][SIM]) {
    if (ok(j)) out.push(j);
    seen.add(j);
  }
  if (out.length < n) {
    const cats = data.v[i][CATS];
    const shared = (j) => data.v[j][CATS].filter((c) => cats.includes(c)).length;
    const rest = [];
    data.v.forEach((r, j) => {
      if (!ok(j)) return;
      const s = shared(j) + (r[CATS][0] === cats[0] ? 1 : 0);
      if (s) rest.push([j, s, r[SCORE]]);
    });
    rest.sort((a, b) => b[1] - a[1] || b[2] - a[2]);
    for (const [j] of rest) {
      if (out.length >= n) break;
      out.push(j);
    }
  }
  return out.slice(0, n).map(card);
}

function because({ rows = 2, n = 8, noMusic = false }) {
  const out = [];
  for (const vid of [...state.watched].reverse()) {
    const i = data.byVid.get(vid);
    if (i === undefined) continue;
    const items = likeThis(i, n, noMusic, true);
    if (items.length >= 4) out.push({ seed: card(i), items });
    if (out.length >= rows) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Topics and search                                                   */
/* ------------------------------------------------------------------ */

// areas and their categories with counts, as the page's pills and "More"
// dropdown need them. Counts follow what can be shown (Music hidden or not,
// "Not interested" removed); cheap enough to recompute on each ask.
function topics(noMusic) {
  const catCount = new Array(data.cats.length).fill(0);
  const areaCount = new Array(data.areas.length).fill(0);
  let total = 0;
  data.v.forEach((r, i) => {
    if (!allowed(i, noMusic)) return;
    total++;
    const areas = new Set();
    for (const c of r[CATS]) {
      catCount[c]++;
      areas.add(data.cats[c][2]);
    }
    for (const a of areas) areaCount[a]++;
  });
  const list = data.areas
    .map(([id, name], a) => ({
      id,
      name,
      count: areaCount[a],
      cats: data.cats
        .map(([cid, cname, ca], c) => ({ id: cid, name: cname, count: catCount[c], area: ca }))
        .filter((c) => c.area === a)
        .sort((x, y) => y.count - x.count)
        .map(({ id, name, count }) => ({ id, name, count })),
    }))
    .sort((x, y) => y.count - x.count);
  return { list, total };
}

function topic({ area, cat, offset = 0, n = 48, noMusic = false }) {
  const ci = cat ? data.cats.findIndex((c) => c[0] === cat) : -1;
  const ai = area ? data.areas.findIndex((a) => a[0] === area) : -1;
  const hits = [];
  data.v.forEach((r, i) => {
    if (!allowed(i, noMusic)) return;
    if (ci >= 0 ? r[CATS].includes(ci) : r[CATS].some((c) => data.cats[c][2] === ai)) hits.push(i);
  });
  hits.sort((a, b) => data.v[b][SCORE] - data.v[a][SCORE]);
  return { total: hits.length, items: hits.slice(offset, offset + n).map(card) };
}

/* ------------------------------------------------------------------ */
/* Browse: the Hacker News page's category / filter / sort query       */
/* ------------------------------------------------------------------ */

const DAY = 86400;
const THIS_DECADES = { "2020s": [2020, 2029], "2010s": [2010, 2019], "2000s": [2000, 2009] };
// duration buckets in seconds: [min, max)
const DURATIONS = {
  "Under 4 min": [0, 240],
  "4–20 min": [240, 1200],
  "20–60 min": [1200, 3600],
  "Over 1 hour": [3600, Infinity],
};
const yearOf = (day) => new Date(day * DAY * 1000).getUTCFullYear();

function sorter(sort) {
  const best = (a, b) => b[SCORE] - a[SCORE];
  switch (sort) {
    case "recent":
      return (a, b) => b[LAST] - a[LAST] || best(a, b);
    case "newest":
      return (a, b) => b[PUB] - a[PUB] || best(a, b);
    case "oldest":
      return (a, b) => (a[PUB] || Infinity) - (b[PUB] || Infinity) || best(a, b);
    case "views":
      return (a, b) => b[VIEWS] - a[VIEWS] || best(a, b);
    case "likes":
      return (a, b) => b[LIKES] / (b[VIEWS] || Infinity) - a[LIKES] / (a[VIEWS] || Infinity) || best(a, b);
    default:
      return best; // Array.sort is stable, so ties keep the export's order
  }
}

// category = area id | "all"; topics = category ids (any of them); the rest
// are the filter bar. Unknown (0) upload date / duration never matches a
// Uploaded / Duration filter, so those filters are only offered once the
// data has them (data.has.youtube).
function browse(f) {
  const ai = f.category && f.category !== "all" ? data.areas.findIndex((a) => a[0] === f.category) : -1;
  const tix = new Set((f.topics || []).map((id) => data.cats.findIndex((c) => c[0] === id)).filter((i) => i >= 0));
  const types = new Set((f.types || []).map((t) => data.types.indexOf(t)).filter((i) => i >= 0));
  const dur = DURATIONS[f.duration];
  const dec = THIS_DECADES[f.uploaded];
  const yearAgo = Math.floor(Date.now() / 1000 / DAY) - 365;
  const hits = [];
  data.v.forEach((r, i) => {
    if (!allowed(i, f.noMusic)) return;
    if (ai >= 0 && !r[CATS].some((c) => data.cats[c][2] === ai)) return;
    if (tix.size && !r[CATS].some((c) => tix.has(c))) return;
    if (types.size && !types.has(r[TYPE])) return;
    if (f.hiddenGems && !isGem(r)) return;
    if (f.evergreen && !((r[FLAGS] || 0) & EVERGREEN)) return;
    if (dur && !(r[DUR] > 0 && r[DUR] >= dur[0] && r[DUR] < dur[1])) return;
    if (f.uploaded === "Past year" && !(r[PUB] >= yearAgo)) return;
    if (dec && !(r[PUB] > 0 && yearOf(r[PUB]) >= dec[0] && yearOf(r[PUB]) <= dec[1])) return;
    hits.push(r);
  });
  hits.sort(sorter(f.sort));
  const offset = f.offset || 0;
  const n = f.n || 24;
  return {
    total: hits.length,
    items: hits.slice(offset, offset + n).map((r) => card(data.byVid.get(r[VID]))),
  };
}

let hay = null; // lowercased search fields per video
function search({ q, n = 60, noMusic = false }) {
  const terms = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  if (!hay) {
    hay = data.v.map((r) => [
      r[TITLE].toLowerCase(),
      r[CHANNEL].toLowerCase(),
      r[CATS].map((c) => data.cats[c][1]).join(" ").toLowerCase(),
      r[WHY].toLowerCase(),
    ]);
  }
  const W = [3, 2, 2, 1];
  const hits = [];
  hay.forEach((h, i) => {
    let s = 0;
    for (const t of terms) {
      let best = 0;
      h.forEach((f, k) => f.includes(t) && (best = Math.max(best, W[k])));
      if (!best) return; // every term must match somewhere
      s += best;
    }
    if (allowed(i, noMusic)) hits.push([i, s + Math.log(1 + data.v[i][SCORE])]);
  });
  hits.sort((a, b) => b[1] - a[1]);
  return hits.slice(0, n).map(([i]) => card(i));
}

/* ------------------------------------------------------------------ */
/* Channels                                                            */
/* ------------------------------------------------------------------ */

// channels HN keeps recommending, best first (2+ catalogued videos)
function channels({ n = 120, noMusic = false }) {
  const by = new Map();
  data.v.forEach((r, i) => {
    if (!allowed(i, noMusic)) return;
    let c = by.get(r[CHANNEL]);
    if (!c) by.set(r[CHANNEL], (c = { name: r[CHANNEL], videos: 0, recs: 0, score: 0, top: [] }));
    c.videos++;
    c.recs += r[RECS];
    c.score += r[SCORE];
    c.top.push(i); // data.v is best-first, so these are too
  });
  return [...by.values()]
    .filter((c) => c.videos >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((c) => ({
      name: c.name,
      videos: c.videos,
      recs: c.recs,
      top: c.top.slice(0, 3).map((i) => ({ vid: data.v[i][VID], title: data.v[i][TITLE] })),
    }));
}

function channel({ name, noMusic = false }) {
  const out = [];
  data.v.forEach((r, i) => r[CHANNEL] === name && allowed(i, noMusic) && out.push(card(i)));
  return out;
}

/* ------------------------------------------------------------------ */
/* Learning                                                            */
/* ------------------------------------------------------------------ */

function nudge(i, by) {
  data.v[i][CATS].forEach((c, k) => {
    state.aff[c] = Math.round(((state.aff[c] || 0) + by * (k === 0 ? 1 : 0.5)) * 100) / 100;
  });
}

function watched(vid) {
  const i = data.byVid.get(vid);
  if (i === undefined) return;
  const at = state.watched.indexOf(vid);
  if (at >= 0) state.watched.splice(at, 1); // move to most recent
  else nudge(i, 1);
  state.watched.push(vid);
  if (state.watched.length > MAX_WATCHED) state.watched.splice(0, state.watched.length - MAX_WATCHED);
  delete state.shown[vid];
  save();
}

function blocked(vid) {
  const i = data.byVid.get(vid);
  if (i === undefined || state.blocked.includes(vid)) return;
  state.blocked.push(vid);
  nudge(i, -1);
  save();
}

function shown(vids) {
  for (const v of vids) state.shown[v] = (state.shown[v] || 0) + 1;
  const keys = Object.keys(state.shown);
  if (keys.length > MAX_SHOWN) {
    for (const k of keys.slice(0, keys.length - MAX_SHOWN)) delete state.shown[k];
  }
  save();
}

/* ------------------------------------------------------------------ */
/* Messages from the page, the YouTube content script and the popup   */
/* ------------------------------------------------------------------ */

async function handle(msg, sender) {
  if (msg.type === "hn:open") {
    // from the YouTube sidebar entry: open the page in that tab, or a new one
    const url = chrome.runtime.getURL("hn.html");
    if (msg.newTab || !sender.tab) await chrome.tabs.create({ url, active: !msg.newTab });
    else await chrome.tabs.update(sender.tab.id, { url });
    return { ok: true };
  }
  await load();
  switch (msg.type) {
    case "hn:feed":
      return { items: feed(msg) };
    case "hn:because":
      return { rows: because(msg) };
    case "hn:like": {
      const i = data.byVid.get(msg.vid);
      if (i === undefined) return { seed: null, items: [] };
      return { seed: card(i), items: likeThis(i, msg.n || 48, msg.noMusic, false) };
    }
    case "hn:topics":
      {
      const t = topics(msg.noMusic);
      return { areas: t.list, total: t.total, has: data.has || {} };
    }
    case "hn:browse":
      return browse(msg);
    case "hn:topic":
      return topic(msg);
    case "hn:channels":
      return { channels: channels(msg) };
    case "hn:channel":
      return { items: channel(msg) };
    case "hn:search":
      return { items: search(msg) };
    case "hn:history":
      return {
        items: [...state.watched]
          .reverse()
          .map((v) => data.byVid.get(v))
          .filter((i) => i !== undefined)
          .map(card),
      };
    case "hn:watch":
      watched(msg.vid);
      return { ok: true };
    case "hn:block":
      blocked(msg.vid);
      return { ok: true };
    case "hn:shown":
      shown(msg.vids || []);
      return { ok: true };
    case "hn:stats":
      return {
        videos: data.v.length,
        generated: data.generated,
        learned: state.watched.length + state.blocked.length,
      };
    case "hn:reset":
      state = { aff: {}, watched: [], blocked: [], shown: {} };
      await chrome.storage.local.set({ [STATE_KEY]: state });
      return { ok: true };
  }
  return null;
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("hn:")) return false;
  handle(msg, sender).then(reply, (e) => reply({ error: String(e) }));
  return true; // async reply
});
