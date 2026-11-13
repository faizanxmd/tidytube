# kempt

*(adj.) — neatly kept, tidy. From Old English "cemban", to comb. Your feed, combed.*

Hides music, Mixes and Shorts from YouTube, tells YouTube to stop sending them,
and fills the gap with videos Hacker News keeps recommending.

## What it hides

- **Music** — videos YouTube itself tags with a ♪ on the duration badge, Official
  Artist Channels, auto-generated "Artist - Topic" channels, album playlists, music shelves and chips, and the Music links in
  YouTube's sidebar. As a fallback, anything whose title reads as music ("Official
  Music Video", "Full Album", "Songs Playlist"...); that part is English-only and
  best effort.
- **Mixes** — radio and Mix playlists (`list=RD...`, `start_radio=1`) in the feed,
  search, watch sidebar and end-of-video wall, plus Mix shelves and chips.
- **Shorts** — in the feed, search, watch sidebar, channel tabs, notifications and
  YouTube's sidebar.

Each one toggles from the popup and applies to open tabs immediately. The feed
is re-laid as a dense grid while anything is hidden, so hidden cards don't leave holes.

## Send YouTube the right signals

YouTube learns from what you subscribe to, watch, like and search for, and
from what you remove or reject. YT Music shares the same watch history, so
every song played there tells YouTube you want music. kempt pushes the other way:

- **Tell YouTube** (popup toggle): on Home and in the sidebar beside videos,
  kempt opens YouTube's own ⋮ menu on music and Mix cards it hid and picks "Not
  interested", as you would by hand: at most 6 per page, a few seconds apart,
  never the same video twice, with the menu kept invisible. It uses "Not
  interested" (one video) rather than "Don't recommend channel" (a whole
  artist), so it says as little as possible to YT Music.
- **Remove music from history**: a button on YouTube's History page. After a
  confirm, it removes entries kempt recognises as music or Mixes, via each one's
  ⋮ → Remove from watch history, scrolling for more, up to 300 a run, stoppable.
  Removing from history is a stronger signal than "Not interested", and it takes
  YT Music plays out of what YouTube recommends from. Nothing happens unless you
  press it.
- **Channels** on the Hacker News page: the channels HN trusts most, each with *Subscribe on
  YouTube*. Subscriptions are the strongest positive signal.
- Hacker News videos open on youtube.com, so watching them counts, and a search with
  no HN result offers *Search YouTube*.

Both automations need a signed-in, English YouTube; they look for the menu
items by name and back off when they can't find them.

## What it adds: Hacker News

Hiding things alone leaves a thin feed, so kempt adds its own page beside
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
- Music videos are left out while Music is hidden.

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

1. Settings live in `chrome.storage.sync` (falls back to `local`).
2. `js/content.js` runs at `document_start` and mirrors each setting as a
   presence-attribute on `<html>` (e.g. `<html kempt-hide-mixes>`).
3. `css/content.css` does the hiding declaratively, so toggling is instant.
4. `js/content.js` also marks what CSS can't recognise: titles, shelves and chips
   that are only identifiable by their text (`data-kempt-music` / `data-kempt-mix`).
5. `js/guide.js` adds the Hacker News sidebar entry (`css/guide.css`) and notes
   which catalogued videos you watch. YouTube keeps two sidebars in the page
   and shows one (the full guide or the icon rail), so each gets exactly one
   entry of its own kind, in its own list of primary entries, re-checked on
   every navigation and page scan. `hn.html` (`js/hn.js`, `css/hn.css`, styled
   by `design/tokens.css`) is the Hacker News page; `js/background.js` filters
   and ranks it and keeps what kempt learned.
6. `js/ytmenu.js` drives YouTube's own ⋮ menu; `js/tell.js` uses it for "Not
   interested" and `js/history.js` for "Remove from watch history".

## Install (Load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `kempt` folder.

The bundled fonts are Inter (`fonts/OFL.txt`, popup) and Geist / Geist Mono
(`fonts/OFL-Geist.txt`, Hacker News page), both under the SIL Open Font License.

The Hacker News picks come from the [HackerTube dataset](https://hackertube.org/data)
by Andrej Karpathy, under the Open Data Commons Attribution License (ODC-By 1.0).
