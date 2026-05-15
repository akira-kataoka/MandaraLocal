#!/usr/bin/env python3
"""
Build romaji-to-japanese municipality mapping by combining:

  1. data/cities/japan_municipalities.geojson
       — GeoBoundaries ADM2, has English shapeName ("Chiyoda", ...) and
         our injected pref_code/pref_name (1..47).

  2. Geolonia japanese-addresses dictionary (CC-BY 4.0)
       — https://geolonia.github.io/japanese-addresses/api/ja.json
         returns {"東京都":["千代田区","中央区",...], ...}.

For each prefecture we romanise every Geolonia municipality name with
pykakasi (Hepburn) after stripping the 「区/市/町/村」 suffix, and look for
the matching GeoBoundaries shapeName (case-insensitive). The map is
written to data/cities/muni_jp_names.json :

  { "<id>":  { "jp": "新宿区", "en": "Shinjuku", "pref": "東京都" }, ... }

Coverage is reported per prefecture; unmatched entries are listed so a
follow-up cycle can hand-fix the long tail.
"""
import json, urllib.request, re, sys
from pathlib import Path
from pykakasi import kakasi

ROOT = Path(__file__).resolve().parent.parent
MUNI_GJ = ROOT / "data" / "cities" / "japan_municipalities.geojson"
OUT     = ROOT / "data" / "cities" / "muni_jp_names.json"

GEOLONIA = "https://geolonia.github.io/japanese-addresses/api/ja.json"

SUFFIXES = ["区", "市", "町", "村"]

def normalize_romaji(s: str) -> str:
    """Collapse common variations across Hepburn / Kunrei / Geo-Boundaries
    spellings so 'toukyou' / 'tokyo' / 'tōkyō' all hash to the same key."""
    s = s.lower()
    s = re.sub(r"[^a-z]", "", s)
    # macron / long-vowel folding
    s = s.replace("ou", "o").replace("oo", "o")
    s = s.replace("uu", "u")
    s = s.replace("ee", "e")
    s = s.replace("ii", "i")
    s = s.replace("aa", "a")
    # geminate consonant simplification (e.g. "happou" -> "hapo")
    s = re.sub(r"([bcdfghjklmnpqrstvwxyz])\1", r"\1", s)
    # kunrei <-> hepburn
    s = s.replace("si", "shi").replace("ti", "chi").replace("tu", "tsu")
    s = s.replace("zi", "ji").replace("hu", "fu")
    # strip optional " city" suffix that occasionally appears in raw data
    s = s.replace("city", "")
    return s

def strip_to_muni(name: str) -> str:
    """Reduce a Geolonia full name down to just the municipal portion.

    Geolonia entries often look like "岩手郡岩手町" or "下閉伊郡岩泉町" —
    we want the part *after* the 郡 (or 支庁 in Hokkaido).  Then we strip
    the trailing 区/市/町/村 suffix to align with GeoBoundaries' bare name."""
    bare = name
    for sep in ("郡", "支庁", "総合振興局", "振興局"):
        idx = bare.rfind(sep)
        if idx >= 0:
            bare = bare[idx + len(sep):]
            break
    for s in SUFFIXES:
        if bare.endswith(s):
            bare = bare[:-1]
            break
    return bare

def romanize(name: str, k: kakasi) -> str:
    bare = strip_to_muni(name)
    bare = bare.replace("ヶ", "ga").replace("ヵ", "ka").replace("ケ", "ga")
    parts = k.convert(bare)
    rom = "".join(p["hepburn"] for p in parts)
    return normalize_romaji(rom)

def main():
    print("[Data] loading municipalities GeoJSON…")
    with MUNI_GJ.open(encoding="utf-8") as f:
        g = json.load(f)

    # Group GeoBoundaries features by prefecture
    by_pref = {}
    for feat in g["features"]:
        p = feat["properties"]
        by_pref.setdefault(p["pref_name"], []).append(feat)
    print(f"  {sum(len(v) for v in by_pref.values())} features across {len(by_pref)} prefectures")

    print("[Data] downloading Geolonia ja.json…")
    with urllib.request.urlopen(GEOLONIA, timeout=20) as r:
        geolonia = json.loads(r.read().decode("utf-8"))
    total_geolonia = sum(len(v) for v in geolonia.values())
    print(f"  geolonia has {total_geolonia} entries across {len(geolonia)} prefectures")

    k = kakasi()
    out = {}
    coverage = []
    unmatched_examples = []

    for pref_name, geo_list in geolonia.items():
        feats = by_pref.get(pref_name, [])
        if not feats:
            print(f"  [warn] no GeoBoundaries features in pref '{pref_name}'")
            continue
        # Index by normalised lowercase name_en
        by_en = {}
        for feat in feats:
            ne = feat["properties"].get("name_en")
            if ne: by_en[normalize_romaji(ne)] = feat
        # Romanise each Geolonia name and try to match
        matched = 0
        for jp in geo_list:
            rom = romanize(jp, k)
            if rom in by_en:
                feat = by_en.pop(rom)
                out[str(feat["properties"]["id"])] = {
                    "jp":   jp,
                    "en":   feat["properties"]["name_en"],
                    "pref": pref_name,
                }
                matched += 1
        cov = (matched / len(feats)) * 100 if feats else 0
        coverage.append((pref_name, matched, len(feats), cov))
        if by_en:
            unmatched_examples.append((pref_name, list(by_en.keys())[:5]))

    # Report
    coverage.sort(key=lambda x: x[3], reverse=True)
    total_m = sum(m for _, m, _, _ in coverage)
    total_f = sum(t for _, _, t, _ in coverage)
    print(f"\n[Data] coverage: {total_m}/{total_f} ({total_m/total_f*100:.1f}%)")
    print("  top 5 prefectures by coverage:")
    for n, m, t, c in coverage[:5]:
        print(f"    {n}: {m}/{t} ({c:.0f}%)")
    print("  worst 5 by coverage:")
    for n, m, t, c in coverage[-5:]:
        print(f"    {n}: {m}/{t} ({c:.0f}%)")

    if unmatched_examples:
        print("\n  unmatched (first 5 shown per pref):")
        for n, exs in unmatched_examples[:10]:
            print(f"    {n}: {exs}")

    with OUT.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\n[Data] wrote {OUT}  entries={len(out)}")

if __name__ == "__main__":
    main()
