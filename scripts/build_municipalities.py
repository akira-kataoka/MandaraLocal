#!/usr/bin/env python3
"""
Spatial-join: assign each ADM2 municipality (geoBoundaries) to its parent
prefecture by point-in-polygon of its centroid, then write a slimmer
GeoJSON with augmented properties:

  properties:
    name_en   : original English shapeName
    pref_code : 1..47 prefecture code
    pref_name : 都道府県の日本語名
    id        : pref_code * 1000 + sequence within prefecture   (synthetic)
    centroid  : [lon, lat]

The output is consumed by js/map.js (municipality level).
"""
import json, sys, os, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PREF_PATH = ROOT / "data" / "japan_prefectures.geojson"
MUNI_RAW  = ROOT / "data" / "cities" / "japan_municipalities_raw.geojson"
MUNI_OUT  = ROOT / "data" / "cities" / "japan_municipalities.geojson"

def signed_area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0]*ring[i+1][1] - ring[i+1][0]*ring[i][1]
    return a / 2.0

def ring_centroid(ring):
    cx = cy = a = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i+1]
        cr = x0*y1 - x1*y0
        cx += (x0 + x1)*cr
        cy += (y0 + y1)*cr
        a  += cr
    a /= 2.0
    if abs(a) < 1e-12: return None
    return [cx/(6*a), cy/(6*a)]

def feature_centroid(feat):
    g = feat.get("geometry") or {}
    rings = []
    if g["type"] == "Polygon":
        rings = [g["coordinates"][0]]
    elif g["type"] == "MultiPolygon":
        best, ba = None, 0
        for poly in g["coordinates"]:
            a = abs(signed_area(poly[0]))
            if a > ba: ba, best = a, poly[0]
        if best: rings = [best]
    if not rings: return None
    return ring_centroid(rings[0])

def feature_bbox(feat):
    minx = miny = float("inf"); maxx = maxy = -float("inf")
    g = feat.get("geometry") or {}
    def feed(rings):
        nonlocal minx, miny, maxx, maxy
        for ring in rings:
            for x, y in ring:
                if x < minx: minx = x
                if x > maxx: maxx = x
                if y < miny: miny = y
                if y > maxy: maxy = y
    if g["type"] == "Polygon": feed(g["coordinates"])
    elif g["type"] == "MultiPolygon":
        for p in g["coordinates"]: feed(p)
    return (minx, miny, maxx, maxy)

def point_in_ring(pt, ring):
    x, y = pt
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]; xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-30) + xi):
            inside = not inside
        j = i
    return inside

def point_in_polygon(pt, poly_rings):
    if not point_in_ring(pt, poly_rings[0]):
        return False
    for hole in poly_rings[1:]:
        if point_in_ring(pt, hole):
            return False
    return True

def point_in_geometry(pt, geom):
    if geom["type"] == "Polygon":
        return point_in_polygon(pt, geom["coordinates"])
    if geom["type"] == "MultiPolygon":
        return any(point_in_polygon(pt, poly) for poly in geom["coordinates"])
    return False

def main():
    print("[Data] loading prefectures…")
    with PREF_PATH.open(encoding="utf-8") as f:
        prefs = json.load(f)
    print(f"  {len(prefs['features'])} prefectures")

    # Build prefecture index: id -> (feature, bbox, name_ja)
    pref_idx = []
    for f in prefs["features"]:
        code = f["properties"]["id"]
        bbox = feature_bbox(f)
        pref_idx.append((code, f["geometry"], bbox, f["properties"].get("nam_ja"), f["properties"].get("nam")))

    print("[Data] loading municipalities…")
    with MUNI_RAW.open(encoding="utf-8") as f:
        munis = json.load(f)
    print(f"  {len(munis['features'])} municipalities")

    matched = 0
    pref_counts = {}
    out_features = []
    unmatched = []

    for i, mf in enumerate(munis["features"]):
        c = feature_centroid(mf)
        if not c:
            unmatched.append(mf["properties"].get("shapeName"))
            continue
        cx, cy = c
        chosen = None
        for code, geom, bbox, name_ja, name_en in pref_idx:
            mnx, mny, mxx, mxy = bbox
            if cx < mnx or cx > mxx or cy < mny or cy > mxy: continue
            if point_in_geometry((cx, cy), geom):
                chosen = (code, name_ja); break
        if not chosen:
            # fallback: nearest by bbox center distance
            best_d = float("inf"); best = None
            for code, geom, bbox, name_ja, _ in pref_idx:
                mnx, mny, mxx, mxy = bbox
                bcx = (mnx + mxx)/2; bcy = (mny + mxy)/2
                d = (cx-bcx)**2 + (cy-bcy)**2
                if d < best_d:
                    best_d = d; best = (code, name_ja)
            chosen = best
        if not chosen:
            unmatched.append(mf["properties"].get("shapeName"))
            continue
        code, name_ja = chosen
        pref_counts[code] = pref_counts.get(code, 0) + 1
        seq = pref_counts[code]
        mid = code * 1000 + seq
        mf["properties"] = {
            "name_en":   mf["properties"].get("shapeName"),
            "pref_code": code,
            "pref_name": name_ja,
            "id":        mid,
            "centroid":  [round(cx, 5), round(cy, 5)],
        }
        out_features.append(mf)
        matched += 1
        if matched % 200 == 0:
            print(f"  matched {matched}/{len(munis['features'])} …")

    out = {"type": "FeatureCollection", "features": out_features}
    MUNI_OUT.parent.mkdir(parents=True, exist_ok=True)
    with MUNI_OUT.open("w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"[Data] wrote {MUNI_OUT}  ({os.path.getsize(MUNI_OUT)/1024:.0f} KB)")
    print(f"  matched: {matched}")
    print(f"  unmatched: {len(unmatched)}  e.g.{unmatched[:5]}")
    print(f"  per-pref counts (sample):  Hokkaido={pref_counts.get(1,0)}, Tokyo={pref_counts.get(13,0)}, Osaka={pref_counts.get(27,0)}, Okinawa={pref_counts.get(47,0)}")
    print(f"  total prefectures with matches: {len(pref_counts)}")

if __name__ == "__main__":
    main()
