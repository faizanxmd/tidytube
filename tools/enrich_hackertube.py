#!/usr/bin/env python3
"""
Add what the HN Picks page needs but the HackerTube export doesn't carry to the
bundled catalogue (data/hackertube.json), in place.

Columns written (see tools/build_hackertube.py for the row layout):
  14 flags        bit 1 = evergreen (the export's shelf_life == "evergreen")
  15 hn_story_id  the Hacker News story the video's top recommendation was posted under
  16 hn_points    that story's points
  17 hn_comments  that story's comment count
  18-21           views, duration (s), upload day (days since 1970), likes
                  — only with YOUTUBE_API_KEY set; otherwise left 0 = unknown

Usage:
    python3 tools/enrich_hackertube.py [export.zip]       # HN only, no key needed
    YOUTUBE_API_KEY=... python3 tools/enrich_hackertube.py   # plus YouTube stats

HN data comes from Algolia's HN API (comment -> story) and the official HN
Firebase API (story score/descendants); both are public and need no key.
Results are cached in tools/.cache/ so an interrupted run resumes and a rerun
only asks for what's new. Nothing is requested at runtime by the extension.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_hackertube as bh  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "hackertube.json")
CACHE_DIR = os.path.join(HERE, ".cache")
UA = {"User-Agent": "kempt-build"}
FLAGS, STORY, POINTS, COMMENTS, VIEWS, DUR, PUB, LIKES = 14, 15, 16, 17, 18, 19, 20, 21
WIDTH = 22


def get_json(url, tries=5):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (404, 400):
                return None  # really not there
            time.sleep(2 ** k)
        except Exception:
            time.sleep(2 ** k)
    raise RuntimeError(url)  # throttled or offline: don't remember it as "nothing there"


def load_cache(name):
    try:
        with open(os.path.join(CACHE_DIR, name), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def save_cache(name, obj):
    os.makedirs(CACHE_DIR, exist_ok=True)
    tmp = os.path.join(CACHE_DIR, name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, separators=(",", ":"))
    os.replace(tmp, os.path.join(CACHE_DIR, name))


def parallel(fn, keys, workers, cache, name):
    todo = [k for k in keys if str(k) not in cache]
    print(f"{name}: {len(keys) - len(todo)} cached, {len(todo)} to fetch", flush=True)
    done = 0

    def safe(k):
        try:
            return True, fn(k)
        except RuntimeError:
            return False, None

    with ThreadPoolExecutor(workers) as ex:
        for k, (ok, res) in zip(todo, ex.map(safe, todo)):
            if ok:
                cache[str(k)] = res  # None = looked up, nothing there
            done += 1
            if done % 250 == 0:
                save_cache(name, cache)
                print(f"  {done}/{len(todo)}", flush=True)
    save_cache(name, cache)


def top_comment_ids(export, vids):
    """vid -> the HN comment that best recommends it (the quote shown on the card, else a rec)."""
    zip_path = export
    import zipfile, io
    if zip_path:
        raw = open(zip_path, "rb").read()
    else:
        req = urllib.request.Request(bh.EXPORT_URL, headers=UA)
        raw = urllib.request.urlopen(req, timeout=120).read()
    zf = zipfile.ZipFile(io.BytesIO(raw))

    def member(name):
        for n in zf.namelist():
            if n.endswith("/" + name) or n == name:
                return zf.read(n).decode("utf-8")
        raise SystemExit(f"{name} missing from export")

    flags, quote = {}, {}
    for l in member("videos.jsonl").splitlines():
        if not l.strip():
            continue
        v = json.loads(l)
        if v["vid"] in vids:
            flags[v["vid"]] = 1 if v.get("shelf_life") == "evergreen" else 0
            q = (v.get("quote") or {}).get("hn_comment_id")
            if q:
                quote[v["vid"]] = q
    first_rec = {}
    for l in member("mentions.jsonl").splitlines():
        if not l.strip():
            continue
        m = json.loads(l)
        if m["vid"] in vids and m["vid"] not in quote and m["stance"] in ("rec", "strong_rec"):
            first_rec.setdefault(m["vid"], m["hn_comment_id"])
    return flags, {**first_rec, **quote}


def iso8601_seconds(d):
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d or "")
    if not m:
        return 0
    dd, h, mi, s = (int(x or 0) for x in m.groups())
    return dd * 86400 + h * 3600 + mi * 60 + s


def main():
    export = sys.argv[1] if len(sys.argv) > 1 else None
    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    rows = data["v"]
    vids = {r[0] for r in rows}

    flags, comment_of = top_comment_ids(export, vids)

    # comment -> story (Algolia), story -> points/comments (HN Firebase)
    c2s = load_cache("hn_comment_story.json")
    parallel(
        lambda cid: (get_json(f"https://hn.algolia.com/api/v1/items/{cid}") or {}).get("story_id"),
        sorted(set(comment_of.values())), 8, c2s, "hn_comment_story.json",
    )
    stories = sorted({s for s in c2s.values() if s})
    st = load_cache("hn_story.json")

    def story(sid):
        d = get_json(f"https://hacker-news.firebaseio.com/v0/item/{sid}.json")
        if not d or d.get("deleted") or d.get("dead") or d.get("type") != "story":
            return None
        return [d.get("score", 0), d.get("descendants", 0)]

    parallel(story, stories, 16, st, "hn_story.json")

    yt = {}
    key = os.environ.get("YOUTUBE_API_KEY")
    if key:
        ytc = load_cache("youtube.json")
        todo = [v for v in sorted(vids) if v not in ytc]
        print(f"youtube: {len(vids) - len(todo)} cached, {len(todo)} to fetch", flush=True)
        for i in range(0, len(todo), 50):
            chunk = todo[i:i + 50]
            url = ("https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet"
                   f"&id={','.join(chunk)}&key={key}")
            try:
                res = get_json(url) or {}
            except RuntimeError:
                continue  # try again on the next run
            got = {it["id"]: it for it in res.get("items", [])}
            for v in chunk:
                it = got.get(v)
                if not it:
                    ytc[v] = None
                    continue
                stt = it.get("statistics", {})
                pub = it["snippet"]["publishedAt"][:10]
                y, mth, d = (int(x) for x in pub.split("-"))
                import datetime
                days = (datetime.date(y, mth, d) - datetime.date(1970, 1, 1)).days
                ytc[v] = [int(stt.get("viewCount", 0)), iso8601_seconds(it["contentDetails"]["duration"]),
                          days, int(stt.get("likeCount", 0))]
            save_cache("youtube.json", ytc)
        yt = ytc

    hit_hn = hit_yt = 0
    for r in rows:
        del r[WIDTH:]
        r.extend([0] * (WIDTH - len(r)))
        vid = r[0]
        r[FLAGS] = flags.get(vid, 0)
        sid = c2s.get(str(comment_of.get(vid)))
        info = st.get(str(sid)) if sid else None
        if info:
            r[STORY], r[POINTS], r[COMMENTS] = sid, info[0], info[1]
            hit_hn += 1
        y = yt.get(vid)
        if y:
            r[VIEWS], r[DUR], r[PUB], r[LIKES] = y
            hit_yt += 1
    data["has"] = {"hn": hit_hn > 0, "youtube": hit_yt > 0}
    tmp = DATA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, DATA)
    print(f"{len(rows)} videos: {hit_hn} with HN points/comments, {hit_yt} with YouTube stats; "
          f"{sum(r[FLAGS] for r in rows)} evergreen -> {os.path.relpath(DATA)}")


if __name__ == "__main__":
    main()
