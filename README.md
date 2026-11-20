# Tidy Tube

Clean YouTube up your way: decide what counts as junk, then clear it out of
your watch history, hide it, or tell YouTube you're not interested. It also
adds a page of videos Hacker News keeps recommending.

## Filters

The Filters page (popup → *Edit filters*, or the extension's Options) holds
categories. Each is a list of channels (name or @handle) and title words
(`*` for any letters, `/regex/` for anything fancier), with three switches:

- **History**: *Clean up history*, a button on YouTube's History page, removes
  matching entries via each one's ⋮ → Remove from watch history, loading more
  as it goes, up to 300 a run, stoppable. Removing from history is a stronger
  signal than "Not interested", and it takes the video out of what YouTube
  recommends from (YT Music shares the same history). Videos Hacker News
  recommends are never removed. Nothing happens unless you press it.
- **Hide**: kept out of Home, search and the sidebar beside videos. The feed is
  re-laid as a dense grid, so hidden cards don't leave holes. The History page
  itself always shows everything.
- **Tell**: on Home and in the sidebar beside videos, Tidy Tube opens YouTube's
  own ⋮ menu on matching cards and picks "Not interested", as you would by
  hand: at most 6 per page, a few seconds apart, never the same video twice,
  with the menu kept invisible.

**Music** and **Mixes** are built-in categories: besides your lists they catch
what YouTube itself marks as music (the ♪ on the duration badge, artist and
"Artist - Topic" channels, albums, music shelves and chips, English titles like
"Official Music Video") and Mix playlists. It also starts with politics and news,
late-night shows, TV clips, Aayu and Pihu, and Taarak Mehta, all set to History
only. Changes apply to open tabs at once. The rules live in `js/junk.js`.

**Shorts** is a plain switch in the popup: hidden in the feed, search, watch
sidebar, channel tabs, notifications and YouTube's sidebar.

History and Tell need a signed-in, English YouTube; they look for the menu
items by name and back off when they can't find them.

## What it adds: Hacker News

Hiding things alone leaves a thin feed, so Tidy Tube adds its own page beside
YouTube: **Hacker News**, built from [HackerTube](https://hackertube.org), the
talks, lectures, documentaries and explainers Hacker News commenters keep
pointing each other to. It doesn't dress up as YouTube and isn't mixed into
YouTube's pages; it's a separate arm you open from YouTube's sidebar. Its
design spec and tokens are in `design/` (`DESIGN.md`, `tokens.css`).

- **Open it** from the "Hacker News" entry in YouTube's sidebar: a full-width
  row under Home/Subscriptions in the expanded sidebar, an "HN" tile in the
  collapsed one (same tab; Ctrl/Cmd or middle click for a new one), or from the
  popup.
- **Browse** (the default): category pills (the six largest, the rest under
  *More ▾*), a topic search (press `/`) that opens a three-column dropdown of
  categories, topics (tick several) and the top videos in the category,
  filters (Type; Uploaded and Duration once the data has them; *Hidden gems*;
  *Evergreen only*), Sort, and a grid of cards with HN points and comments.
  Filters live in the URL, so Back and reload keep them. Enter in the search
  searches titles, channels and HN's reasons.
- **For you**: "Because you watched…" rows, then a fresh weighted draw with
  Shuffle. **Channels**: the channels HN trusts, to subscribe to. **Watched**.
  (Classics is Browse sorted Best first; Deep cuts is *Hidden gems*.)
- A card's ⋮ menu (over the thumbnail) has *More like this*, *More from
  channel*, *See what HN said* (the HackerTube page with the comments), *Read
  the top comment* and *Not interested*; hover the HN line for why HN
  recommends it.
- Videos open on youtube.com, so watching them also teaches YouTube's own
  algorithm. Back returns to the same draw and scroll position.
- **It learns, locally.** Watching a catalogued video on YouTube raises its
  topics and the videos most like it; *Not interested* lowers them; cards you
  keep skipping fade out. All of it stays in `chrome.storage.local`. Reset it
  from the popup.
- Music videos are left out while your Music filter has Hide on.

The catalogue (4,636 videos after dropping news clips, never-recommended
citations and duplicate uploads) is bundled in `data/hackertube.json`. To
refresh it from HackerTube's monthly export:

    python3 tools/build_hackertube.py    # numpy recommended, see the script
    python3 tools/enrich_hackertube.py   # HN points/comments (no key needed)

The export has no HN points, comment counts, views, durations or upload dates.
`enrich_hackertube.py` adds the evergreen flag and, from the public HN APIs,
the points and comments of the story each video's top recommendation was posted
under. With `YOUTUBE_API_KEY` set it also adds views, duration, upload date and
likes, which switches on the Uploaded and Duration filters, the duration badge,
and the Upload date / Oldest first / View count / Like ratio sorts. All of this
happens when you build the data; the extension itself never calls out.

## How it works

1. The popup's switches (Shorts, the sidebar entry) live in `chrome.storage.sync`
   (falls back to `local`); your filters live in `chrome.storage.local` under
   `tidy_filters`, edited by `filters.html` (`js/filters.js`, `css/filters.css`).
2. `js/junk.js` turns your filters into matchers, shared by every script and
   page, and mirrors what's hidden as presence-attributes on `<html>` (e.g.
   `<html tidy-hide-music>`), as `js/content.js` does for the popup's switches.
3. `css/content.css` does the hiding declaratively, so toggling is instant.
4. `js/content.js` marks what CSS can't recognise, re-checking only the cards
   that changed: music and Mixes known only by their text (`data-tidy-music` /
   `data-tidy-mix`), videos a category with Hide matches (`data-tidy-junk`),
   and shelves and chips.
5. `js/guide.js` adds the Hacker News sidebar entry (`css/guide.css`) and notes
   which catalogued videos you watch. YouTube keeps two sidebars in the page
   and shows one (the full guide or the icon rail), so each gets exactly one
   entry of its own kind, in its own list of primary entries, re-checked on
   every navigation and page scan. `hn.html` (`js/hn.js`, `css/hn.css`, styled
   by `design/tokens.css`) is the Hacker News page; `js/background.js` filters
   and ranks it and keeps what Tidy Tube learned.
6. `js/ytmenu.js` drives YouTube's own ⋮ menu; `js/tell.js` uses it for "Not
   interested" (categories with Tell) and `js/history.js` for "Remove from watch
   history" (categories with History).

## Install (Load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `tidytube` folder.

The bundled fonts are Inter (`fonts/OFL.txt`, popup) and Geist / Geist Mono
(`fonts/OFL-Geist.txt`, Hacker News page), both under the SIL Open Font License.

The Hacker News picks come from the [HackerTube dataset](https://hackertube.org/data)
by Andrej Karpathy, under the Open Data Commons Attribution License (ODC-By 1.0).
