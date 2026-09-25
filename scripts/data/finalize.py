"""Stage 3: merge badge-derived colours into world.json for clubs without curated kit colours."""
import colorsys
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
wp = os.path.join(ROOT, "public", "data", "world.json")
w = json.load(open(wp))
cols = json.load(open(os.path.join(ROOT, "scripts", "data", "out", "badge_colours.json")))


def lum(hx):
    r, g, b = (int(hx[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def theme_of(p, s):
    # pick the more usable UI accent: avoid near-white / near-black
    for c in (p, s):
        if 0.08 < lum(c) < 0.8:
            return c
    return "#2A5CAA"


n = 0
for c in w["clubs"]:
    if not c.get("kit"):
        pc = cols.get(str(c["id"]))
        if pc:
            c["kit"] = pc
            c["theme"] = theme_of(*pc)
            c["colorSource"] = "badge"
        else:
            c["kit"] = ["#2A3346", "#FFFFFF"]
            c["theme"] = "#3A4A6B"
            c["colorSource"] = "neutral"
        n += 1
json.dump(w, open(wp, "w"), ensure_ascii=False, separators=(",", ":"))
print("patched colours for", n, "clubs; size", os.path.getsize(wp) // 1024, "KB")
