#!/usr/bin/env python3
"""
Fetch Japanese municipality names via GSI reverse geocoder.

Iterate over every feature centroid in
  data/cities/japan_municipalities.geojson
and write data/cities/muni_jp_names.json :

  { "<id>": { "muniCd": "13104", "jp": "新宿区" }, ... }

Uses the public Japan GSI service which is fast (no API key, no rate limit
beyond reasonable politeness). We add a small sleep between calls.
"""
import json, time, urllib.parse, urllib.request, os
from pathlib import Path

ROOT  = Path(__file__).resolve().parent.parent
INP   = ROOT / "data" / "cities" / "japan_municipalities.geojson"
MUNI_CODES = ROOT / "scripts" / "_muni_codes.json"   # MLIT muni master, may be missing
OUT   = ROOT / "data" / "cities" / "muni_jp_names.json"

GSI = "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress"

def gsi_lookup(lon, lat, retries=3):
    url = f"{GSI}?lon={lon}&lat={lat}"
    for i in range(retries):
        try:
            with urllib.request.urlopen(url, timeout=10) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            if i + 1 == retries: raise
            time.sleep(0.5 * (i + 1))

# muniCd → 市町村日本語名  ※GSI は muniCd を返すが日本語名は別途必要
# 総務省「全国地方公共団体コード」がオンライン取得しづらいため、Wikipedia や
# その他をスクレイプするのは非効率。代わりに lv01Nm（番地レベル）から
# 末尾の「町」「字」を剥がす方針 + muniCd → 都道府県 / 市区町村名 を別途取得。
#
# ここではシンプルに reverseの結果から「muniCd と lv01Nm」だけ保存し、
# 次サイクルで muniCd → 日本語市町村名の確定マッピングを当てる。

def main():
    with INP.open(encoding="utf-8") as f:
        g = json.load(f)
    features = g["features"]
    out = {}
    if OUT.exists():
        with OUT.open(encoding="utf-8") as f:
            out = json.load(f)
        print(f"  resuming with {len(out)} cached entries")

    total = len(features)
    for i, feat in enumerate(features, 1):
        fid = feat["properties"]["id"]
        if str(fid) in out: continue
        lon, lat = feat["properties"]["centroid"]
        try:
            data = gsi_lookup(lon, lat)
            r = data.get("results") or {}
            out[str(fid)] = {
                "muniCd": r.get("muniCd"),
                "lv01":   r.get("lv01Nm"),
                "pref":   feat["properties"].get("pref_name"),
                "name_en": feat["properties"].get("name_en"),
            }
        except Exception as e:
            print(f"  [{i}/{total}] id={fid} FAIL: {e}")
            continue
        if i % 50 == 0:
            print(f"  [{i}/{total}] {feat['properties']['name_en']} -> {out[str(fid)]['muniCd']} / {out[str(fid)]['lv01']}")
            # Periodically flush partial results
            with OUT.open("w", encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, indent=1)
        time.sleep(0.25)  # be polite

    with OUT.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"  wrote {OUT}  total={len(out)}")

if __name__ == "__main__":
    main()
