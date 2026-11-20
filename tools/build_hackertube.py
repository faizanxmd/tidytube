#!/usr/bin/env python3
"""
Build data/hackertube.json from the HackerTube export.

HackerTube (https://hackertube.org) is Andrej Karpathy's catalogue of the
YouTube videos Hacker News commenters keep recommending to each other. Its
data is published under the Open Data Commons Attribution licence (ODC-By).

Usage:
    python3 tools/build_hackertube.py                      # download the export
    python3 tools/build_hackertube.py path/to/export.zip   # or use a local copy

numpy is optional but recommended: with it, each video's "similar" list comes
from the export's embeddings (what the video is about). Without it, only the
co-recommendation graph is used, which is mostly single shared commenters and
so much noisier.

Writes a compact file the extension bundles, so Tidy Tube never calls out to
hackertube.org at runtime (nothing about what you watch leaves the browser).

Output shape (arrays instead of objects to keep the file small):
    {
      "generated": "2026-10-31",
      "types": ["talk", ...],                # content types
      "areas": [["id", "name"], ...],        # taxonomy areas (16)
      "cats":  [["id", "name", area_index], ...],  # taxonomy categories (150)
      "v": [[vid, title, channel, why_hn, quote, quote_comment_id,
             score, recommenders, strong_recs, first_year, last_year,
             type_index, [cat_index, ...], [similar_video_index, ...],
             flags, hn_story_id, hn_points, hn_comments,
             views, duration_sec, published_day, likes], ...]
    }

flags is a bit set (1 = evergreen). The last seven columns are filled in by
tools/enrich_hackertube.py (HN story points/comments, and with a YouTube API
key views, duration, upload date and likes); this script writes 0 for them,
which the page reads as "unknown". Re-run the enrich step after a rebuild.
"""
import io
import json
import os
import re
import sys
import urllib.request
import zipfile

EXPORT_URL = "https://hackertube.org/download/hackertube-data.zip"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "hackertube.json")
SIMILAR_PER_VIDEO = 10
QUOTE_MAX = 220


def read_export(src):
    if src:
        data = open(src, "rb").read()
    else:
        req = urllib.request.Request(EXPORT_URL, headers={"User-Agent": "tidy-build"})
        data = urllib.request.urlopen(req, timeout=120).read()
    zf = zipfile.ZipFile(io.BytesIO(data))

    def member(name):
        for n in zf.namelist():
            if n.endswith("/" + name) or n == name:
                return zf.read(n).decode("utf-8")
        raise SystemExit(f"{name} missing from export")

    videos = [json.loads(l) for l in member("videos.jsonl").splitlines() if l.strip()]
    related = [json.loads(l) for l in member("related.jsonl").splitlines() if l.strip()]
    meta = member("DATA.md")
    m = re.search(r"Exported (\d{4}-\d{2}-\d{2})", meta)
    emb = None
    try:
        import numpy as np

        ids = json.loads(member("embedding_ids.json"))
        raw = next(zf.read(n) for n in zf.namelist() if n.endswith("embeddings.npy"))
        emb = (ids, np.load(io.BytesIO(raw)).astype(np.float32))
    except ImportError:
        print("numpy not installed: similar videos come from the co-recommendation graph only")
    return videos, related, emb, m.group(1) if m else ""


def embedding_neighbours(keep, emb):
    """vid -> the most similar kept videos by embedding, best first"""
    import numpy as np

    ids, mat = emb
    row = {v: i for i, v in enumerate(ids)}
    vids = [v["vid"] for v in keep if v["vid"] in row]
    m = mat[[row[v] for v in vids]]
    out = {}
    for start in range(0, len(vids), 512):
        sims = m[start:start + 512] @ m.T
        for k, srow in enumerate(sims):
            srow[start + k] = -1  # not itself
            top = np.argpartition(-srow, SIMILAR_PER_VIDEO)[:SIMILAR_PER_VIDEO]
            out[vids[start + k]] = [vids[j] for j in top[np.argsort(-srow[top])]]
    return out


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def trim(s, n):
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def main():
    videos, related, emb, generated = read_export(sys.argv[1] if len(sys.argv) > 1 else None)

    keep, seen_titles = [], set()
    for v in videos:  # export is sorted best-scored first, so dedupe keeps the best copy
        if v.get("shelf_life") == "news":
            continue  # only mattered around one event
        if not v["hn"].get("recommenders"):
            continue  # only ever cited, never recommended
        key = norm_title(v["title"])
        if key in seen_titles:
            continue  # same talk uploaded twice
        seen_titles.add(key)
        keep.append(v)

    index = {v["vid"]: i for i, v in enumerate(keep)}
    # people who recommend one also recommend the other: only a real signal
    # once at least two commenters overlap
    strong = {r["vid"]: [x["vid"] for x in r["related"] if x["shared_recommenders"] >= 2]
              for r in related}
    weak = {r["vid"]: [x["vid"] for x in r["related"]] for r in related}
    near = embedding_neighbours(keep, emb) if emb else weak

    def similar(vid):
        out = []
        for v in strong.get(vid, []) + near.get(vid, []):
            if v in index and v != vid and index[v] not in out:
                out.append(index[v])
        return out[:SIMILAR_PER_VIDEO]

    types, type_ix = [], {}
    cats, cat_ix = [], {}
    areas, area_ix = [], {}
    rows = []
    for v in keep:
        t = v.get("content_type") or "other"
        if t not in type_ix:
            type_ix[t] = len(types)
            types.append(t)
        cis = []
        for c in v.get("categories") or []:
            if c["area"] not in area_ix:
                area_ix[c["area"]] = len(areas)
                areas.append([c["area"], c["area_name"]])
            if c["id"] not in cat_ix:
                cat_ix[c["id"]] = len(cats)
                cats.append([c["id"], c["name"], area_ix[c["area"]]])
            cis.append(cat_ix[c["id"]])
        q = v.get("quote") or {}
        hn = v["hn"]
        rows.append([
            v["vid"],
            v["title"],
            v["channel"],
            v.get("why_hn") or "",
            trim(q.get("text"), QUOTE_MAX),
            q.get("hn_comment_id") or 0,
            v["score"],
            hn.get("recommenders", 0),
            hn.get("strong_recs", 0),
            hn.get("first_year", 0),
            hn.get("last_year", 0),
            type_ix[t],
            cis,
            similar(v["vid"]),
            1 if v.get("shelf_life") == "evergreen" else 0,
            0, 0, 0,  # hn story id, points, comments   (tools/enrich_hackertube.py)
            0, 0, 0, 0,  # views, duration_sec, published_day, likes
        ])

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generated": generated, "types": types, "areas": areas, "cats": cats, "v": rows},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(rows)} of {len(videos)} videos -> {os.path.relpath(OUT)} "
          f"({os.path.getsize(OUT) / 1e6:.1f} MB, export {generated})")


if __name__ == "__main__":
    main()
