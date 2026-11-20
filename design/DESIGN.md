# Tidy Tube — Hacker News video subpage

Design spec for the HN video page inside Tidy Tube. Source of truth is the Paper file
**Hackertube++ → Mockup page**:

| Artboard | What it shows |
|---|---|
| `v2 — HN subpage` | Default state, dropdown closed |
| `v2 — More categories open` | Search focused + category dropdown open |
| `v1 — with sidebar (old)` | **Superseded. Do not build.** Kept for history only |

Tokens live in `tokens.css` (same folder). Use the variables; never hard-code the hex values.

---

## 1. Context

- This page renders **inside YouTube** as a subpage. YouTube supplies its own masthead,
  sidebar and global search. **Do not build a sidebar or a global video search.**
- Everything is scoped under a root element with class `tidy-hn` so tokens and styles
  never leak into YouTube's DOM.
- Dark only (matches YouTube dark theme). Font: **Geist** / **Geist Mono**.
- YouTube controls the available width (its sidebar can open/close), so the layout must be
  fluid. Designed at 1440px wide; must hold up from ~900px to 1920px.

## 2. Page structure (top → bottom)

```
.tidy-hn  (padding: 32px 40px 0; vertical gap 24px)
├── Page header        [HN badge + "Hacker News"] [Topic search — fills remaining width] [Sort]
├── Category pills     All · top 6 categories · More ▾
├── Filter bar         Uploaded ▾ · Type ▾ · Duration ▾ | ☐ Hidden gems ☐ Evergreen only ······ Clear filters
│                      (bottom hairline, 20px padding-bottom)
└── Video grid         responsive cards, 24px column gap, 32px row gap
```

## 3. Components

### 3.1 Page header
- Row, `align-items: center`, gap 16px.
- **HN badge:** 28×28, radius 7px, bg `--color-accent`, text "HN" in `--font-mono` 12px/700, color `--color-on-accent`.
- **Title:** "Hacker News", 30px / 700 / line-height 36px / letter-spacing -0.025em, `--color-text`.
- **Topic search:** `flex: 1`, height 38px, radius `--radius-md`, bg `--color-surface`, 1px `--color-line` border, padding 0 8px 0 14px, gap 10px.
  - Search icon 15px (`--color-muted`) · placeholder "Find a category or topic" 14px `--color-muted` · key hint chip `/` (mono 11px, bg `--color-raised`, radius `--radius-sm`, padding 2px 6px).
  - **Focused:** border `--color-accent`, `box-shadow: var(--focus-ring)`, icon turns `--color-text`, hint chip reads `esc`.
- **Sort:** "Sort" (13px muted) + "Best first" (13px/600 text) + chevron. Options: Best first, Recently recommended, Upload date, Oldest first, View count, Like ratio.

### 3.2 Category pills
- Wrapping row, gap 8px. Pill: height 34px, radius `--radius-full`, padding 0 14px, gap 8px; label 13px/500, count `--font-mono` 12px.
- **Default:** bg `--color-raised`, label `--color-text`, count `--color-muted`.
- **Active:** bg `--color-pill-active-bg`, label `--color-pill-active-fg` 600, count #55555A. Exactly one active (single-select); "All" is the default.
- **More ▾:** transparent bg, 1px `--color-line` border. **Open:** bg `--color-raised`, border `--color-pill-open-border`, chevron rotated 180°.
- Show "All" + the 6 largest categories by count; the rest live in the More dropdown.

### 3.3 Filter bar
- Dropdown buttons: height 32px, radius `--radius-md`, 1px `--color-line` border, padding 0 10px 0 12px. Label 13px muted + value 13px/500 text + chevron 12px.
  - **Has a non-default value:** border `--color-accent`, bg `--color-accent-soft` (e.g. Type = "Talk, Lecture").
- Vertical divider 1×20px `--color-line`.
- Checkbox toggles: 14px box, radius 4px, 1.5px `--color-muted` border; checked = filled `--color-accent` with a `--color-on-accent` check.
- "Clear filters" 13px muted, pushed right.
- Filter values (from moodboard): **Uploaded:** Any time, Past year, 2020s, 2010s, 2000s. **Type:** Talk, Lecture, Explainer, Tutorial, Documentary, Interview, Demo, Commentary, Comedy, Music (multi-select). **Duration:** Any, Under 4 min, 4–20 min, 20–60 min, Over 1 hour.

### 3.4 Video card
- Column, gap 12px.
- **Thumbnail:** 16:9, radius `--radius-lg`, overflow hidden. Duration badge bottom-right 10px inset: bg `--color-duration-bg`, radius 5px, padding 2px 6px, mono 12px/500 white.
  (Mockup thumbnails are typographic placeholders; production uses the real YouTube thumbnail.)
- **Meta** (padding 0 2px, gap 6px):
  - Title: 15px / 600 / line-height 21px, `--color-text`, **clamped to 2 lines with a fixed 42px height** so every card's lower lines align across the row. This is a hard requirement.
  - Channel line: 13px / 18px `--color-muted` — `Channel · 11K views · 10 yrs ago`.
  - HN line (gap 12px): amber ▲ triangle + points (mono 12px/500 `--color-accent`) · comment icon + "86 comments" (mono 12px `--color-muted`). Comments links to the HN thread.
- **Grid:** `display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); column-gap: 24px; row-gap: 32px;` (4 columns at 1440).

### 3.5 Category dropdown ("More")
Opened by **clicking the More pill OR focusing the Topic search**. Both triggers drive one shared
`open` state; More moves focus into the search input. `Esc` / outside click closes.

- Anchored directly under the Topic search, **same width as the search**, 8px gap.
- Container: bg `--color-popover`, 1px `--color-line` border, radius `--radius-lg`, `box-shadow: var(--shadow-popover)`, overflow clip.
- **Must render in a top layer** (portal / Popover API / high z-index stacking context), never inside the header's stacking context, or grid cards will paint over it.
- Body is 3 columns, separated by 1px `--color-popover-divider` borders. The popover ground is `--color-line`, so any hairline inside the popover must use `--color-popover-divider` (a `--color-line` border would be invisible):
  1. **Category list** (236px fixed, padding 8px, gap 1px): rows 34px, padding 0 10px, radius `--radius-sm`; name 13px/500 + right-aligned mono 12px count in a fixed 32px slot. Hovered/active row: bg `--color-raised`, name 600. "Other" is muted.
  2. **Topics** (340px fixed, padding 16px 16px 12px, gap 4px): header = uppercase label (11px/600, `--tracking-label`, muted) + "View all N →" (12px/500 accent). Rows 32px: checkbox + topic 13px + mono count in a fixed 28px slot. Multi-select.
  3. **Top in category** (fills the rest, padding 16px 16px 12px, gap 6px): header "TOP IN {CATEGORY}" + "This year" muted. 3 mini rows: 112×63 thumb (radius `--radius-sm`, mono duration chip) + title 13px/600/18px (2 lines max) + `▲ points` (mono 11px accent) + source 12px muted.
- **Footer** (48px, bg `--color-popover-footer`, top hairline, padding 0 16px): "**N** topics selected" (N in accent mono) · "Clear" muted ······ "Browse all categories →" 13px/500.
- Typing in the search filters both the category list and topics.

## 4. Data model

```
Category { id, name, count, topics: Topic[] }
Topic    { id, categoryId, name, count }
Video    { id, title, channel, views, publishedAt, durationSec, thumbnailUrl,
           hn: { points, comments, itemId }, categoryIds[], topicIds[], type, flags: { hiddenGem, evergreen } }
Filters  { category: id | "all", topics: id[], uploaded, types: string[], duration, hiddenGems, evergreenOnly, sort }
```
- "View all N →" = select every topic in that category.
- The "Top in category" panel reuses the grid query: `category = hovered, sort = best, limit = 3, uploaded = past year`.

## 5. Accessibility
- Search input is a combobox (`role="combobox"`, `aria-expanded`, `aria-controls` → dropdown).
- Category list + topics are keyboard navigable (↑/↓ within a column, ←/→ between columns, Space toggles a topic).
- `/` focuses the topic search (only when focus isn't already in a text field, so it doesn't fight YouTube's own shortcuts).
- Text contrast: muted (#A6A6AB) on bg (#0E0E0F) ≈ 8:1. Do not dim text further.

## 6. Build scope & acceptance

Nothing if all the changes that Have been given for you do done without skimping on anything or causing any regressions
you can continue you work done, If you have any suggestions and changes which you will only understand when you are working ask and then only continue if you feel the need to not simply blindy do the design work and ask what to do and why to do to the user.

## 7. Known bug — sidebar "state" issue (must fix)

**Observed (user screenshot, YouTube dark theme, sidebar EXPANDED):**
- YouTube's expanded left guide shows `Home`, then a divider, then the `Subscriptions >` header.
- Tidy Tube's injected entry points — a **compass (Explore) icon** and an **"HN" label** — render
  **inline in the same row as `Subscriptions >`**, crammed to the right of the chevron.
- A channel-name tooltip ("Aidan Hall") is also floating over the `Home` item while the guide is expanded.

**Likely cause (verify in code before fixing):** the injected items are built for one sidebar
state (the collapsed mini-guide / icon rail) and are inserted by a selector that, in the expanded
guide, resolves to the Subscriptions section header. In other words the injection is not
state-aware: YouTube renders different containers for collapsed vs. expanded
(`ytd-mini-guide-renderer` vs. `ytd-guide-renderer`), and toggling the guide (hamburger, window
resize, SPA navigation via `yt-navigate-finish`) re-renders them.

**Required behaviour:**
- Exactly **one** Tidy Tube entry point per sidebar state, in the correct container:
  - *Collapsed (mini-guide):* an icon + short label tile, styled like YouTube's own mini-guide tiles.
  - *Expanded (guide):* a full-width row (icon + "Hacker News") in its own section or directly under
    YouTube's primary entries — never inside or beside a section header.
- Re-inject / move correctly when the guide toggles, the window crosses YouTube's breakpoint, or on
  SPA navigation; never duplicate entries; clean up on teardown.
- Do not leave stray tooltips/hover state from one sidebar mode visible in the other.
- Root-cause it — no CSS-only band-aid that hides the overlap.
