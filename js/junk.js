/*
 * Tidy Tube: your filters.
 *
 * You describe what you don't want on the Filters page (filters.html) as
 * categories. Each one is a list of channels and a list of title words, and
 * has three switches:
 *   history  "Clean up history" on YouTube's History page removes it (js/history.js)
 *   hide     kept out of Home, search and the sidebar (js/content.js marks
 *            cards, css/content.css hides them)
 *   tell     Tidy Tube tells YouTube "Not interested" in it, a few per page (js/tell.js)
 *
 * Music and Mixes are built-in categories: on top of your lists they catch
 * what YouTube itself marks as music (the note icon, artist channels, albums,
 * "Official video" titles, "Artist - Topic" channels) and its Mix playlists.
 *
 * Matching:
 *   channels  a channel name or @handle, compared ignoring case, spaces and
 *             punctuation, so "Jimmy Kimmel Live" and "@JimmyKimmelLive" match
 *   words     a word or phrase found whole in the title, ignoring case;
 *             * stands for any letters ("election*" also finds "elections");
 *             /like this/ is a regular expression, for anything fancier
 *
 * Saved in chrome.storage.local under "tidy_filters". Until you change
 * anything the built-in DEFAULTS apply, so they keep improving with updates.
 *
 * Loaded first among the content scripts, and by filters.html and hn.html;
 * all get it as globalThis.tidyJunk.
 */
(() => {
  "use strict";

  const KEY = "tidy_filters";

  const DEFAULTS = [
    {
      id: "music",
      name: "Music",
      builtin: "music",
      history: false,
      hide: false,
      tell: false,
      channels: [],
      words: [],
    },
    {
      id: "mixes",
      name: "Mixes",
      builtin: "mixes",
      history: false,
      hide: false,
      tell: false,
      channels: [],
      words: [],
    },
    {
      id: "politics",
      name: "Politics & news",
      history: true,
      hide: false,
      tell: false,
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
        // ambiguous words only count in a political phrase ("rally" alone is also motorsport)
        "/\\b(presidential|senate|house|governor'?s?) (race|debate|election|primary|map)\\b/",
        "/\\b(campaign|political) (rally|rallies|ad|speech)\\b/",
        "/\\b(polls?|polling) (shows?|update|tracker|average|lead)\\b/",
        "/\\b20\\d\\d (map|race|predictions?|forecast)\\b/",
      ],
    },
    {
      id: "latenight",
      name: "Late night & talk shows",
      history: true,
      hide: false,
      tell: false,
      channels: [
        "The Late Show with Stephen Colbert", "@ColbertLateShow", "Jimmy Kimmel Live",
        "The Tonight Show Starring Jimmy Fallon", "@FallonTonight", "Late Night with Seth Meyers",
        "@LateNightSeth", "The Daily Show", "Last Week Tonight", "Saturday Night Live", "SNL",
        "The Late Late Show with James Corden", "@TheLateLateShow", "Real Time with Bill Maher",
        "@RealTimeHBO", "Team Coco", "Conan O'Brien", "The Graham Norton Show", "@OfficialGrahamNorton",
        "Comedy Central", "Gutfeld!", "After Midnight", "Watch What Happens Live with Andy Cohen",
        "The Kelly Clarkson Show", "The Drew Barrymore Show", "The Jennifer Hudson Show",
        "TheEllenShow", "The View", "The Jonathan Ross Show", "The Kapil Sharma Show",
        "The Great Indian Kapil Show",
      ],
      words: [
        "tonight show", "late show", "late night with", "late late show", "jimmy kimmel", "kimmel live",
        "colbert", "jimmy fallon", "seth meyers", "daily show", "last week tonight", "john oliver",
        "saturday night live", "snl", "graham norton", "james corden", "conan o'brien", "conan obrien",
        "bill maher", "real time with", "gutfeld", "kapil sharma",
      ],
    },
    {
      id: "tv",
      name: "TV clips",
      history: true,
      hide: false,
      tell: false,
      channels: [
        "Sony SAB", "SET India", "Sony TV", "StarPlus", "Star Bharat", "Colors TV", "Zee TV", "&TV",
        "@andtvchannel", "Sony Entertainment Television",
        "NBC", "CBS", "ABC", "FOX", "Bravo", "TLC", "E! Entertainment", "BBC", "BBC One", "BBC Three",
        "ITV", "Channel 4", "Peacock",
      ],
      words: [
        "full episode", "bigg boss", "indian idol", "kaun banega crorepati", "kbc", "crime patrol",
        "shark tank india", "anupamaa", "yeh rishta", "kumkum bhagya", "bhabiji ghar par",
        "super dancer", "india's got talent", "indias got talent", "khatron ke khiladi",
        "masterchef india", "cid episode",
      ],
    },
    {
      id: "aayu-pihu",
      name: "Aayu and Pihu",
      history: true,
      hide: false,
      tell: false,
      channels: ["Aayu and Pihu Show", "Aayu Pihu Show"],
      words: ["aayu", "pihu", "पीहू"],
    },
    {
      id: "tmkoc",
      name: "Taarak Mehta",
      history: true,
      hide: false,
      tell: false,
      channels: ["Taarak Mehta Ka Ooltah Chashmah", "TMKOC"],
      words: [
        "taarak mehta", "tarak mehta", "tmkoc", "ooltah chashmah", "jethalal", "gokuldham",
        "babita ji", "tapu sena", "तारक मेहता", "जेठालाल",
      ],
    },
  ];

  /* ---------------------------------------------------------------- */
  /* Built-in detectors: Music and Mixes                               */
  /* ---------------------------------------------------------------- */

  // English titles, best effort
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
  // "Artist - Topic" channels carry album tracks: songs played in YT Music
  const TOPIC = / - Topic$/;

  // the same marks css/content.css hides music and Mixes by
  const MUSIC_SEL =
    ':has(path[d^="M5.5 1.383V6.88"], path[d^="M11 2.766v10.99"], .badge-style-type-verified-artist,' +
    ' [aria-label="Official Artist Channel"], a[href*="list=OLAK5uy_"]), [data-tidy-music]';
  const MIX_SEL = ':has(a[href*="list=RD"], a[href*="start_radio=1"]), [data-tidy-mix]';

  // what only text gives away; js/content.js marks cards with these for the CSS
  const musicByText = (card) =>
    MUSIC_TITLE.test(titleOf(card)) || channelNames(card).some((n) => TOPIC.test(n));
  // user-made playlists named "mix" have no list=RD for the CSS to catch
  const mixByText = (card) => MIX_TITLE.test(titleOf(card)) && !!card.querySelector('a[href*="list="]');

  const BUILTIN = {
    music: {
      card: (c) => c.matches(MUSIC_SEL) || musicByText(c),
      text: (title, channel) => MUSIC_TITLE.test(title) || TOPIC.test(channel),
    },
    mixes: {
      card: (c) => c.matches(MIX_SEL) || mixByText(c),
      text: () => false, // a Mix is a playlist link, not words
    },
  };

  /* ---------------------------------------------------------------- */
  /* Compiling a category into matchers                                */
  /* ---------------------------------------------------------------- */

  // "Jimmy Kimmel Live", "@JimmyKimmelLive" and "jimmy kimmel live!" are one channel
  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");

  // a letter, accent mark or digit: what a whole word may not touch on either side
  const LETTER = "[\\p{L}\\p{M}\\p{N}]";
  const REGEX_LINE = /^\/(.+)\/([gimsuy]*)$/;

  // a plain word or phrase: whole, any case, any run of spaces, * = any letters
  function phraseSource(w) {
    const body = w
      .trim()
      .split(/\s+/)
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, LETTER + "*"))
      .join("\\s+");
    return "(?<!" + LETTER + ")" + body + "(?!" + LETTER + ")";
  }

  // why a word line can't be used, or null when it's fine (shown on the Filters page)
  function problem(w) {
    const m = REGEX_LINE.exec(w.trim());
    if (!m) return null;
    try {
      new RegExp(m[1], m[2]);
      return null;
    } catch (e) {
      // "Invalid regular expression: /(a/: Unterminated group" -> "Unterminated group"
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
      history: !!c.history,
      hide: !!c.hide,
      tell: !!c.tell,
      channels: new Set((c.channels || []).map(norm).filter(Boolean)),
      words: regexes,
    };
  }

  // Saved lists from older versions: "on" meant what "history" means now,
  // and Music and Mixes weren't categories yet (they're added, switched off).
  function upgrade(list) {
    const out = list.map((c) => {
      const x = Object.assign({}, c);
      if (!("history" in x)) x.history = x.on !== false;
      delete x.on;
      x.hide = !!x.hide;
      x.tell = !!x.tell;
      const d = DEFAULTS.find((d) => d.builtin && d.id === x.id);
      if (d) x.builtin = d.builtin;
      return x;
    });
    const missing = DEFAULTS.filter((d) => d.builtin && !out.some((c) => c.id === d.id));
    return JSON.parse(JSON.stringify(missing)).concat(out);
  }

  /* ---------------------------------------------------------------- */
  /* Matching                                                          */
  /* ---------------------------------------------------------------- */

  let saved = null; // the categories as saved, or null for DEFAULTS
  let compiled = [];
  let forHistoryList = [];
  let hiding = [];
  let telling = [];

  // Everything on a card that might name its channel. The extra texts are
  // harmless: "1.2M views" or "3 days ago" never equal a channel.
  function channelNames(card) {
    const out = [];
    for (const a of card.querySelectorAll('a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]')) {
      const text = a.textContent.trim();
      if (text) out.push(text);
      const handle = /^\/@([^/?#]+)/.exec(a.getAttribute("href"));
      if (handle) out.push(decodeURIComponent(handle[1]));
    }
    for (const n of card.querySelectorAll("ytd-channel-name #text, .ytContentMetadataViewModelMetadataText")) {
      out.push(n.textContent.trim());
    }
    return out;
  }

  function titleOf(card) {
    const t = card.querySelector("#video-title, h3");
    return t ? t.textContent.trim() : "";
  }

  const byLists = (c, title, keys) =>
    keys.some((k) => c.channels.has(k)) || c.words.some((r) => r.test(title));

  // the first category in `list` a card belongs to
  function matchCard(card, list) {
    if (!list.length) return null;
    const title = titleOf(card);
    const keys = channelNames(card).map(norm).filter(Boolean);
    for (const c of list) {
      if (byLists(c, title, keys) || (c.builtin && c.builtin.card(card))) return c;
    }
    return null;
  }

  // the name of the category a History entry is removed for, or null
  function forHistory(card) {
    const c = matchCard(card, forHistoryList);
    return c ? c.name : null;
  }
  const hides = (card) => !!matchCard(card, hiding);
  const tells = (card) => !!matchCard(card, telling);

  /* ---------------------------------------------------------------- */
  /* Storage                                                           */
  /* ---------------------------------------------------------------- */

  function use(categories) {
    saved = Array.isArray(categories) ? upgrade(categories) : null;
    compiled = (saved || DEFAULTS).map(compile);
    forHistoryList = compiled.filter((c) => c.history);
    hiding = compiled.filter((c) => c.hide);
    telling = compiled.filter((c) => c.tell);
    if (typeof location !== "undefined" && location.hostname.endsWith("youtube.com")) {
      const html = document.documentElement;
      const hidden = (id) => hiding.some((c) => c.id === id);
      // css/content.css hides music and Mixes straight from these, with no flicker
      html.toggleAttribute("tidy-hide-music", hidden("music"));
      html.toggleAttribute("tidy-hide-mixes", hidden("mixes"));
      html.toggleAttribute("tidy-hide-junk", hiding.length > 0);
      // js/content.js re-decides every card, js/tell.js looks again
      window.dispatchEvent(new Event("tidy-filters"));
    }
  }
  use(null);

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
    forHistory,
    hides,
    tells,
    musicByText,
    mixByText,
    problem,
    anyTell: () => telling.length > 0,
    historyNames: () => forHistoryList.map((c) => c.name),
    hidden: (id) => hiding.some((c) => c.id === id),
    // for the Filters page: categories as they stand, and a tester
    categories: () => JSON.parse(JSON.stringify(saved || DEFAULTS)),
    test: (title, channel, categories) => {
      const key = norm(channel);
      for (const c of categories.map(compile)) {
        if (!(c.history || c.hide || c.tell)) continue;
        if (byLists(c, title, key ? [key] : []) || (c.builtin && c.builtin.text(title, channel))) return c.name;
      }
      return null;
    },
  };
})();
