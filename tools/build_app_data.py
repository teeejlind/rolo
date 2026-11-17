#!/usr/bin/env python3
"""Build ios/Rolo/Resources/network.json: trunk stations + corridor lines bundled in the app.

Inputs (server/data/ref/):
  troncal_stations.csv        GTFS stations joined to TransMilenio's ArcGIS station layer
  trazados_troncales.geojson  ArcGIS trunk corridor geometry (tipo_tra 1 = in operation)
"""
import csv
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, "server", "data", "ref")
OUT = os.path.join(ROOT, "ios", "Rolo", "Resources", "network.json")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prepare_gtfs import ZONE_COLORS  # noqa: E402


def clean_name(s):
    return " ".join((s or "").split())


def main():
    stations = []
    with open(os.path.join(REF, "troncal_stations.csv"), encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r.get("served_by_troncal_trips") != "True":
                continue
            stations.append({
                "id": r["gtfs_station_id"],
                "name": clean_name(r["gtfs_name"]),
                "lat": round(float(r["lat"]), 6),
                "lon": round(float(r["lon"]), 6),
                "letter": r.get("corridor_letter") or "",
            })

    corridors = []
    with open(os.path.join(REF, "trazados_troncales.geojson"), encoding="utf-8") as f:
        gj = json.load(f)
    for i, feat in enumerate(gj["features"]):
        p, g = feat["properties"], feat["geometry"]
        if p.get("tipo_tra") != 1 or p.get("le_troncal") not in ZONE_COLORS:
            continue
        lines = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        for j, line in enumerate(lines):
            corridors.append({
                "id": f"{i}-{j}",
                "letter": p["le_troncal"],
                "name": p.get("nom_tronc") or "",
                "coords": [[round(lat, 5), round(lon, 5)] for lon, lat, *_ in line],
            })

    out = {"stations": stations, "corridors": corridors, "zoneColors": ZONE_COLORS}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(stations)} stations, {len(corridors)} corridor lines -> {OUT} ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    main()
