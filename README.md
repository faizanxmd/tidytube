# Tidy Tube

Make YouTube calmer and more useful: hide Shorts, music, Mixes, and noisy
categories with one-click switches, run a preview-first Watch History cleaner
whenever you want, and browse the videos Hacker News commenters recommend.

## What it does

### 1. Hide on YouTube (active)

Click the Tidy Tube icon to toggle what stays out of Home, search, and the
watch sidebar — changes apply to open YouTube tabs immediately, with dense CSS
grid reflow so hidden cards never leave holes:

- **Shorts** — hidden in the feed, search, sidebar, channel tabs, and notifications.
- **Music** — built-in detector (the ♪ badge, Official Artist channels, albums,
  `Artist - Topic` tracks, and music video titles), plus your own additions.
- **Mixes** — built-in detector for YouTube Mix and auto-radio playlists.
- **Politics & news** and **TV & late night** — curated channel and keyword
  presets, off by default until you turn them on.
- **Custom filters** — click *Customize →* (or Extension Options) to add your
  own categories, channels, or title keywords with a simple chip editor.

The Watch History page itself always shows everything you watched.

### 2. Clean watch history (one-time tool)

YouTube recommends heavily from your watch history (including YT Music).
Whenever you want a cleanup, click **Clean watch history** in the popup or on
YouTube's History page:

- Pick which categories to clean right inside the panel (or type a one-off
  channel or keyword without creating a permanent filter).
- Preview every matching video first and uncheck anything you want to keep.
- Videos in the Hacker News catalogue are automatically protected.
- Optionally load older history into the preview or enable deep-clean
  auto-scrolling (up to 300 removals per run, stoppable at any time).

Requires a signed-in, English YouTube (uses YouTube's own ⋮ → *Remove from
watch history* menu).

### 3. Hacker News video picks

Adds a clean **Hacker News** entry (with an amber `HN` badge) directly in
YouTube's left sidebar — a full-width row in the expanded sidebar and a compact
tile in the collapsed mini-sidebar (Ctrl/Cmd or middle-click for a new tab).

Opening it takes you to a dedicated page built from
[HackerTube](https://hackertube.org): 4,636 talks, lectures, documentaries, and
explainers that Hacker News commenters keep recommending, with category pills,
topic search (`/`), filters, *For you*, *Channels*, and local-only learning in
`chrome.storage.local`.

To refresh the bundled catalogue (`data/hackertube.json`) from HackerTube's
monthly export:

    python3 tools/build_hackertube.py    # numpy recommended, see the script
    python3 tools/enrich_hackertube.py   # HN points/comments (no key needed)

## Install (Load unpacked)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `tidytube` folder.

The bundled fonts are Geist and Geist Mono (`fonts/OFL-Geist.txt`, SIL Open
Font License). The Hacker News catalogue comes from the
[HackerTube dataset](https://hackertube.org/data) by Andrej Karpathy (ODC-By 1.0).
