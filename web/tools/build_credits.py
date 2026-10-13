# Credits for every third-party asset in the site (D7): writes web/content/credits.json, which build_archive.mjs turns into
# /archive/credits.html. Run with Windows Python: python -I tools/build_credits.py
# Sketchfab models: the license.txt that ships with each download (title, author, licence, the exact credit line).
# Poly Haven (CC0, credited anyway): authors from the public API. Only assets that are actually in the build are listed.
import json, os, re, urllib.request

SRC = "C:/Users/surya/asset-src/main-website/"
WEB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
scene = json.load(open(os.path.join(WEB, "public/assets/scene.json"), encoding="utf-8"))
shipped = {s["name"] for s in scene["statics"]}

# authors who renamed their Sketchfab account since the download: the licence's name stays, the link follows the account
# (checked 2026-10-13 against api.sketchfab.com/v3/models/<uid>; the old profile URLs 404)
RENAMED = {"https://sketchfab.com/drvrstudio": ("andreidrmb", "https://sketchfab.com/andreidrmb"),
           "https://sketchfab.com/vruderkuss": ("lil_bentley", "https://sketchfab.com/lil_bentley")}

def sketchfab(folder):
    t = open(os.path.join(folder, "license.txt"), encoding="utf-8").read()
    g = lambda k: (re.search(r"\* " + k + r":\s*(.+)", t) or [None, ""])[1].strip()
    author = g("author"); m = re.match(r"(.+?)\s*\((https?://[^)]+)\)", author)
    lic = g("license type"); lm = re.match(r"(.+?)\s*\((https?://[^)]+)\)", lic)
    c = {"title": g("title"), "url": g("source"), "author": m[1] if m else author, "author_url": m[2] if m else "",
            "license": lm[1] if lm else lic, "license_url": lm[2] if lm else "", "source": "Sketchfab"}
    if c["author_url"] in RENAMED:
        now, url = RENAMED[c["author_url"]]; c["author"] = f"{c['author']} (now {now})"; c["author_url"] = url
    return c

out = {"statues": [], "structures": [], "forest": []}
# the three Act I heroes, then the thirteen forest statues
for n in ["engel", "milan_mourning", "maternal_affection"] + sorted(x[3:] for x in shipped if x.startswith("ST_")):
    c = sketchfab(SRC + "sketchfab/" + n); c["where"] = "Act I" if n in ("engel", "milan_mourning", "maternal_affection") else "The forest"
    out["statues"].append(c)

ph_cache = {}
def polyhaven(pid):
    if pid not in ph_cache:
        info = json.load(urllib.request.urlopen(urllib.request.Request(f"https://api.polyhaven.com/info/{pid}", headers={"User-Agent": "suryansh-credits"})))
        ph_cache[pid] = {"title": info.get("name", pid), "url": f"https://polyhaven.com/a/{pid}", "author": ", ".join(info.get("authors", {})),
                         "author_url": "", "license": "CC0", "license_url": "https://creativecommons.org/publicdomain/zero/1.0/", "source": "Poly Haven"}
    return dict(ph_cache[pid])

st = json.load(open(os.path.join(WEB, "../docs/revamp/g1-assets/structures.json"), encoding="utf-8"))
for cat in st["categories"]:
    for i, cand in enumerate(cat["candidates"]):
        if f"SX_{cat['key']}_{i}" not in shipped: continue
        if cand["source"] == "sketchfab": c = sketchfab(SRC + f"sketchfab_struct/{cat['key']}_{i}")
        else: c = polyhaven(cand["uid"] if "uid" in cand else cand["id"])
        c["where"] = cat["key"]; out["structures"].append(c)

for pid in sorted(os.listdir(SRC + "polyhaven")):
    if any(s.get("url", "").endswith("/" + pid) for s in out["structures"]): continue
    c = polyhaven(pid); c["where"] = "The forest, the door and the sky"; out["forest"].append(c)

# the forest's sound (public/assets/audio/forest.ogg): the two recordings mixed, looped and levelled
GS = {"author": "Gravity Sound", "author_url": "https://www.gravitysound.studio/", "license": "CC BY 4.0",
      "license_url": "https://creativecommons.org/licenses/by/4.0/", "source": "Wikimedia Commons"}
out["sound"] = [dict(GS, title=t, url="https://commons.wikimedia.org/wiki/File:" + t.replace(" ", "_") + ".wav",
                     where="The forest's sound, mixed with the other recording, looped and levelled")
                for t in ("Wind in forest (Gravity Sound)", "Forest ambience (Gravity Sound)")]

json.dump(out, open(os.path.join(WEB, "content/credits.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print({k: len(v) for k, v in out.items()})
