/*
 * Tidy Tube: filter rules.
 *
 * Each filter category has ONE simple switch: `enabled` (hide matching videos
 * on YouTube). Built-in categories (Music and Mixes) combine YouTube's own
 * markers with any extra channels or title keywords you add.
 *
 * Watch History cleanup (js/history.js) is a separate, on-demand tool that
 * reuses these same category definitions (plus optional one-off terms) when
 * you choose to run it.
 *
 * Matching:
 *   channels  a channel name or @handle, compared ignoring case, spaces and
 *             punctuation, so "Jimmy Kimmel Live" and "@JimmyKimmelLive" match
 *   words     a word or phrase found whole in the title, ignoring case;
 *             * stands for any letters ("election*" also finds "elections");
 *             /pattern/ is a regular expression for advanced rules
 *
 * Saved in chrome.storage.local under "tidy_filters". Until you edit them,
 * DEFAULTS apply. Shared across content scripts, popup.html, filters.html,
 * and hn.html as globalThis.tidyJunk.
 */
(() => {
  "use strict";

  const KEY = "tidy_filters";

  const DEFAULTS = [
    {
      id: "music",
      name: "Music",
      builtin: "music",
      enabled: true,
      channels: [],
      words: [],
    },
    {
      id: "mixes",
      name: "Mixes",
      builtin: "mixes",
      enabled: true,
      channels: [],
      words: [],
    },
    {
      id: "politics",
      name: "Politics & news",
      enabled: false,
      channels: [
        // India
        "Aaj Tak", "ABP NEWS", "ABP News Hindi", "Zee News", "India Today", "Republic World",
        "Republic Bharat", "Times Now", "Times Now Navbharat", "NDTV", "NDTV India", "News18 India",
        "CNN-News18", "TV9 Bharatvarsh", "Mirror Now", "WION", "DD News", "Sansad TV", "News24",
        "Firstpost", "ThePrint", "The Wire", "Newslaundry", "Mojo Story", "The Lallantop",
        "BBC News Hindi", "Unfiltered by Samdish", "The News Minute", "The Quint",
        "Dhruv Rathee", "Ravish Kumar Official", "The Deshbhakt", "Akash Banerjee",
        "Narendra Modi", "Rahul Gandhi", "Indian National Congress", "Bharatiya Janata Party", "BJP",
        "Aam Aadmi Party", "Arvind Kejriwal",
        // US and world
        "CNN", "Fox News", "MSNBC", "NBC News", "CBS News", "ABC News", "PBS NewsHour", "C-SPAN",
        "BBC News", "Sky News", "Al Jazeera English", "DW News", "FRANCE 24 English", "Guardian News",
        "Reuters", "Associated Press", "Forbes Breaking News", "The Hill", "NBC News NOW",
        "LiveNOW from FOX", "TLDR News", "TLDR News Global",
        "The Young Turks", "Piers Morgan Uncensored", "Ben Shapiro", "The Daily Wire", "PragerU",
        "Tucker Carlson", "Breaking Points", "Megyn Kelly", "Candace Owens", "Hasan Piker",
        "Brian Tyler Cohen", "MeidasTouch", "The White House", "Donald J Trump",
        "Let's Talk Elections", "Decision Desk HQ", "FiveThirtyEight", "270toWin",
        "Right Side Broadcasting Network", "RSBN",
      ],
      words: [
        "trump", "maga", "biden", "kamala", "jd vance", "obama", "pelosi", "desantis", "rfk jr",
        "election*", "midterm*", "electoral", "ballot*", "exit poll*", "swing state*", "battleground state*",
        "democrat*", "republican*", "gop", "white house", "oval office", "cnn", "fox news", "msnbc",
        "/\\b(presidential|senate|house|governor'?s?) (race|debate|election|primary|map)\\b/",
        "/\\b(campaign|political) (rally|rallies|ad|speech)\\b/",
        "/\\b(polls?|polling) (shows?|update|tracker|average|lead)\\b/",
        "/\\b20\\d\\d (map|race|predictions?|forecast)\\b/",
      ],
    },
    {
      id: "tv",
      name: "TV & late night",
      enabled: false,
      channels: [
        // Late night & talk shows
        "The Late Show with Stephen Colbert", "@ColbertLateShow", "Jimmy Kimmel Live",
        "The Tonight Show Starring Jimmy Fallon", "@FallonTonight", "Late Night with Seth Meyers",
        "@LateNightSeth", "The Daily Show", "Last Week Tonight", "Saturday Night Live", "SNL",
        "The Late Late Show with James Corden", "@TheLateLateShow", "Real Time with Bill Maher",
        "@RealTimeHBO", "Team Coco", "Conan O'Brien", "The Graham Norton Show", "@OfficialGrahamNorton",
        "Comedy Central", "Gutfeld!", "After Midnight", "Watch What Happens Live with Andy Cohen",
        "The Kelly Clarkson Show", "The Drew Barrymore Show", "The Jennifer Hudson Show",
        "TheEllenShow", "The View", "The Jonathan Ross Show", "The Kapil Sharma Show",
        "The Great Indian Kapil Show",
        // TV networks
        "Sony SAB", "SET India", "Sony TV", "StarPlus", "Star Bharat", "Colors TV", "Zee TV", "&TV",
        "@andtvchannel", "Sony Entertainment Television",
        "NBC", "CBS", "ABC", "FOX", "Bravo", "TLC", "E! Entertainment", "BBC", "BBC One", "BBC Three",
        "ITV", "Channel 4", "Peacock",
      ],
      words: [
        "tonight show", "late show", "late night with", "late late show", "jimmy kimmel", "kimmel live",
        "colbert", "jimmy fallon", "seth meyers", "daily show", "last week tonight", "john oliver",
        "saturday night live", "snl", "graham norton", "james corden", "conan o'brien", "conan obrien",
        "bill maher", "real time with", "gutfeld", "kapil sharma",
        "full episode", "bigg boss", "indian idol", "kaun banega crorepati", "kbc", "crime patrol",
        "shark tank india", "anupamaa", "yeh rishta", "kumkum bhagya", "bhabiji ghar par",
        "super dancer", "india's got talent", "indias got talent", "khatron ke khiladi",
        "masterchef india", "cid episode",
      ],
    },
  ];

  /* ---------------------------------------------------------------- */
  /* Built-in detectors: Music and Mixes                               */
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
  const MIX_TITLE = /\bmix(?:es)?\b/i;
  const TOPIC = / - Topic$/;

  const MUSIC_SEL =
    ':has(path[d^="M5.5 1.383V6.88"], path[d^="M11 2.766v10.99"], .badge-style-type-verified-artist,' +
    ' [aria-label="Official Artist Channel"], a[href*="list=OLAK5uy_"]), [data-tidy-music]';
  const MIX_SEL = ':has(a[href*="list=RD"], a[href*="start_radio=1"]), [data-tidy-mix]';

  const musicByText = (card) =>
    MUSIC_TITLE.test(titleOf(card)) || channelNames(card).some((n) => TOPIC.test(n));
  const mixByText = (card) =>
    MIX_TITLE.test(titleOf(card)) && !!card.querySelector('a[href*="list="]');

  const BUILTIN = {
    music: {
      card: (c) => c.matches(MUSIC_SEL) || musicByText(c),
      text: (title, channel) => MUSIC_TITLE.test(title) || TOPIC.test(channel),
    },
    mixes: {
      card: (c) => c.matches(MIX_SEL) || mixByText(c),
      text: () => false,
    },
  };

  /* ---------------------------------------------------------------- */
  /* Compiling a category into matchers                                */
  /* ---------------------------------------------------------------- */

  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
  const LETTER = "[\\p{L}\\p{M}\\p{N}]";
  const REGEX_LINE = /^\/(.+)\/([gimsuy]*)$/;

  function phraseSource(w) {
    const body = w
      .trim()
      .split(/\s+/)
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, LETTER + "*"))
      .join("\\s+");
    return "(?<!" + LETTER + ")" + body + "(?!" + LETTER + ")";
  }

  function problem(w) {
    const m = REGEX_LINE.exec(w.trim());
    if (!m) return null;
    try {
      new RegExp(m[1], m[2]);
      return null;
    } catch (e) {
      return e.message.replace(/^Invalid regular expression: \/.*\/[a-z]*: /, "");
    }
  }

  function compile(c) {
    const plain = [];
    const regexes = [];
    for (const raw of c.words || []) {
      const w = raw.trim();
      if (!w || problem(w)) continue;
      const m = REGEX_LINE.exec(w);
      if (m) regexes.push(new RegExp(m[1], m[2].includes("i") ? m[2] : m[2] + "i"));
      else plain.push(phraseSource(w));
    }
    if (plain.length) regexes.unshift(new RegExp(plain.join("|"), "iu"));
    return {
      id: c.id,
      name: c.name || "Untitled",
      builtin: BUILTIN[c.builtin] || null,
      enabled: !!c.enabled,
      channels: new Set((c.channels || []).map(norm).filter(Boolean)),
      words: regexes,
    };
  }

  // Upgrade older saved lists ({ history, hide, tell } or { on }) into the
  // simplified { enabled } schema while keeping user custom categories intact.
  function upgrade(list) {
    const out = list.map((c) => {
      const d = DEFAULTS.find((x) => x.builtin && x.id === c.id);
      const enabled = "enabled" in c ? !!c.enabled : "hide" in c ? !!c.hide : !!c.on;
      const clean = {
        id: c.id || "c" + Math.random().toString(36).slice(2, 8),
        name: c.name || (d ? d.name : "Untitled"),
        enabled,
        channels: Array.isArray(c.channels) ? c.channels : [],
        words: Array.isArray(c.words) ? c.words : [],
      };
      if (d) clean.builtin = d.builtin;
      return clean;
    });
    const missing = DEFAULTS.filter((d) => d.builtin && !out.some((c) => c.id === d.id));
    return JSON.parse(JSON.stringify(missing)).concat(out);
  }

  /* ---------------------------------------------------------------- */
  /* Card inspection & matching                                        */
  /* ---------------------------------------------------------------- */

  let saved = null;
  let compiled = [];
  let active = [];

  function channelNames(card) {
    const out = [];
    for (const a of card.querySelectorAll('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]')) {
      const text = a.textContent.trim();
      if (text) out.push(text);
      const handle = /^\/@([^/?#]+)/.exec(a.getAttribute("href"));
      if (handle) out.push(decodeURIComponent(handle[1]));
    }
    for (const n of card.querySelectorAll("ytd-channel-name #text, .ytContentMetadataViewModelMetadataText")) {
      const text = n.textContent.trim();
      if (text) out.push(text);
    }
    return out;
  }

  // Best human-readable channel label for a card (used in History Cleaner preview)
  function channelLabel(card) {
    const direct = card.querySelector(
      'ytd-channel-name #text, a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"], .ytContentMetadataViewModelMetadataText'
    );
    return direct ? direct.textContent.trim() : "";
  }

  function titleOf(card) {
    const t = card.querySelector("#video-title, h3");
    return t ? t.textContent.trim() : "";
  }

  const byLists = (c, title, keys) =>
    keys.some((k) => c.channels.has(k)) || c.words.some((r) => r.test(title));

  function matchCard(card, list) {
    if (!list.length) return null;
    const title = titleOf(card);
    const keys = channelNames(card).map(norm).filter(Boolean);
    for (const c of list) {
      if (byLists(c, title, keys) || (c.builtin && c.builtin.card(card))) return c;
    }
    return null;
  }

  const hides = (card) => !!matchCard(card, active);

  // Used by the on-demand Watch History Cleaner (js/history.js): matches a card
  // against the selected category IDs plus optional one-off terms.
  function buildCleanupMatcher(categoryIds, extraTerms) {
    const idSet = new Set(categoryIds || []);
    const list = compiled.filter((c) => idSet.has(c.id));
    const extras = (extraTerms || [])
      .map((s) => s.trim())
      .filter(Boolean);
    if (extras.length) {
      list.push(
        compile({
          id: "__custom__",
          name: "Custom match",
          enabled: true,
          channels: extras,
          words: extras,
        })
      );
    }
    return (card) => {
      const hit = matchCard(card, list);
      return hit ? hit.name : null;
    };
  }

  /* ---------------------------------------------------------------- */
  /* Storage                                                           */
  /* ---------------------------------------------------------------- */

  function use(categories) {
    saved = Array.isArray(categories) ? upgrade(categories) : null;
    compiled = (saved || DEFAULTS).map(compile);
    active = compiled.filter((c) => c.enabled);
    if (typeof location !== "undefined" && location.hostname.endsWith("youtube.com")) {
      const html = document.documentElement;
      const hidden = (id) => active.some((c) => c.id === id);
      html.toggleAttribute("tidy-hide-music", hidden("music"));
      html.toggleAttribute("tidy-hide-mixes", hidden("mixes"));
      html.toggleAttribute("tidy-hide-junk", active.length > 0);
      window.dispatchEvent(new Event("tidy-filters"));
    }
  }
  use(null);

  function saveCategories(categories, cb) {
    const clean = upgrade(categories);
    use(clean);
    chrome.storage.local.set({ [KEY]: { categories: clean } }, () => {
      if (cb) cb(chrome.runtime.lastError || null);
    });
  }

  const ready = new Promise((resolve) => {
    chrome.storage.local.get(KEY, (got) => {
      use(got[KEY] && got[KEY].categories);
      resolve();
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && KEY in changes) {
      const v = changes[KEY].newValue;
      use(v && v.categories);
    }
  });

  globalThis.tidyJunk = {
    KEY,
    DEFAULTS,
    ready,
    hides,
    musicByText,
    mixByText,
    titleOf,
    channelLabel,
    problem,
    buildCleanupMatcher,
    hidden: (id) => active.some((c) => c.id === id),
    categories: () => JSON.parse(JSON.stringify(saved || DEFAULTS)),
    save: saveCategories,
    test: (title, channel, categories) => {
      const key = norm(channel);
      for (const c of categories.map(compile)) {
        if (byLists(c, title, key ? [key] : []) || (c.builtin && c.builtin.text(title, channel))) {
          return { name: c.name, enabled: c.enabled };
        }
      }
      return null;
    },
  };
})();
