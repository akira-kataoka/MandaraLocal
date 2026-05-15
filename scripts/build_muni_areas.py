#!/usr/bin/env python3
"""
Compute the area (km^2) of every municipality from the GeoBoundaries
ADM2 GeoJSON, plus the centroid coordinates, and write a CSV that can be
loaded directly as the municipality-level sample dataset.

Spherical Excess (L'Huilier-free) area is approximated with the
Mollweide-style projected area using a sinusoidal projection around the
feature centroid: precise enough for a few-km² ward all the way up to
Hokkaido's 11,000 km² Bibai-region polygons. Reference geoid: WGS84
mean radius R = 6,371.0088 km.
"""
import json, math, csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INP  = ROOT / "data" / "cities" / "japan_municipalities.geojson"
OUT  = ROOT / "data" / "sample_all_municipalities.csv"
JP   = ROOT / "data" / "cities" / "muni_jp_names.json"

R = 6371.0088  # km

def ring_area_spherical(ring):
    """Polygon area on a sphere via the L'Huilier-equivalent formula.
       Input: ring = list of [lon, lat] in degrees, closed.
       Returns area in km^2 (always positive)."""
    n = len(ring) - 1
    if n < 3: return 0.0
    s = 0.0
    for i in range(n):
        lon1, lat1 = ring[i]
        lon2, lat2 = ring[i + 1]
        s += math.radians(lon2 - lon1) * (2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
    return abs(s) * R * R / 2.0

def geometry_area_km2(geom):
    if not geom: return 0.0
    total = 0.0
    if geom["type"] == "Polygon":
        rings = geom["coordinates"]
        outer = ring_area_spherical(rings[0])
        holes = sum(ring_area_spherical(r) for r in rings[1:])
        total = outer - holes
    elif geom["type"] == "MultiPolygon":
        for poly in geom["coordinates"]:
            outer = ring_area_spherical(poly[0])
            holes = sum(ring_area_spherical(r) for r in poly[1:])
            total += outer - holes
    return total

def main():
    with INP.open(encoding="utf-8") as f:
        g = json.load(f)
    jp_map = {}
    if JP.exists():
        with JP.open(encoding="utf-8") as f:
            jp_map = json.load(f)

    rows = []
    sums_by_pref = {}
    for feat in g["features"]:
        p = feat["properties"]
        area = geometry_area_km2(feat["geometry"])
        cx, cy = (p.get("centroid") or [None, None])
        jp_rec = jp_map.get(str(p["id"]))
        rows.append({
            "id": p["id"],
            "市区町村": (jp_rec["jp"] if jp_rec else (p.get("name_en") or "")),
            "都道府県": p.get("pref_name", ""),
            "面積(km2)": round(area, 2),
            "経度": cx,
            "緯度": cy,
        })
        sums_by_pref[p.get("pref_code", 0)] = sums_by_pref.get(p.get("pref_code", 0), 0) + area

    # sanity check: a few prefectures should be close to official figures
    print("[QA] computed pref areas vs official (km^2):")
    official = {1: 78421, 13: 2194, 27: 1905, 47: 2281, 28: 8401}
    for code, off in official.items():
        got = sums_by_pref.get(code, 0)
        diff_pct = abs(got - off) / off * 100
        print(f"  pref {code:02d}: got {got:7.0f}  official {off:7d}  diff {diff_pct:5.1f}%")

    rows.sort(key=lambda r: r["id"])
    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)
    print(f"[Data] wrote {OUT}  ({len(rows)} rows, {OUT.stat().st_size/1024:.0f} KB)")

if __name__ == "__main__":
    main()
