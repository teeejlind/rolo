#!/usr/bin/env python3
"""Clean TransMilenio's official GTFS export into the feed Rolo's router imports.

The official daily export (storage.googleapis.com/gtfs-estaticos/GTFS_YYYYMMDD.zip)
has carried the trunk system since 2026-03-17, but ships with three defects we fix:

  * every Troncal route is ff0000 and every Dual route 00ff00. We recolor Troncal by
    TransMilenio zone (the letter on the station signage), taken from the route code
    prefix, or from the destination station's corridor for number-only services.
  * trip_headsign is blank everywhere. We fill it with route_long_name, which the
    export uses for the destination.
  * some exports (holiday-dated ones, 2026-09-20) have trips with no stop_times.
    We drop those trips instead of letting the router import half a timetable.

Usage: prepare_gtfs.py IN.zip OUT.zip [--stations troncal_stations.csv]
"""
import argparse
import csv
import io
import sys
import unicodedata
import zipfile
from collections import Counter

# TransMilenio zone palette (approximation of the official system map colors).
ZONE_COLORS = {
    "A": "0B5FB0",  # Caracas
    "B": "6CB33F",  # Autonorte
    "C": "F2A900",  # Suba
    "D": "7B3F98",  # Calle 80
    "E": "9B8BC4",  # NQS Central
    "F": "E1251B",  # Américas
    "G": "1BA3DC",  # NQS Sur / Soacha
    "H": "F0781E",  # Caracas Sur / Usme
    "J": "C99B2F",  # Eje Ambiental
    "K": "A77B5B",  # Calle 26
    "L": "00A19A",  # Carrera 10
    "M": "D4267D",  # Carrera 7
    "Z": "8C6D46",  # Av. Ciudad de Cali
}
# Text color per zone: dark text on the light swatches, white elsewhere.
DARK_TEXT_ZONES = {"B", "C", "E", "J"}
DUAL_COLOR, DUAL_TEXT = "0E7C86", "FFFFFF"

AGENCY_TRONCAL, AGENCY_DUAL = "1", "6"

# The export paints zonal services pure 0000ff / 00ff00. SITP's own system colors:
# urbano blue, alimentador green, complementario orange, especial wine.
SITP_COLORS = {
    "2": ("3AAA35", "FFFFFF"),  # Alimentadores
    "3": ("1D63B8", "FFFFFF"),  # Zonal-Urbano
    "4": ("F28C28", "FFFFFF"),  # Zonal-Complementario
    "5": ("8E1F4F", "FFFFFF"),  # Zonal-Especial
}
PLACEHOLDER_COLORS = {"0000ff", "00ff00", "ff0000", ""}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return " ".join(s.lower().replace(".", " ").split())


def read_csv(zf, name):
    with zf.open(name) as f:
        text = io.TextIOWrapper(f, encoding="utf-8-sig", newline="")
        reader = csv.DictReader(text)
        return reader.fieldnames, list(reader)


def write_csv(zout, name, fields, rows):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=fields, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    zout.writestr(name, buf.getvalue())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--stations", help="station->corridor letter CSV (troncal_stations.csv)")
    ap.add_argument("--max-dropped", type=int, default=None,
                    help="reject the export (exit 3) if more trips than this lack stop_times")
    args = ap.parse_args()

    zin = zipfile.ZipFile(args.src)
    names = set(zin.namelist())

    route_fields, routes = read_csv(zin, "routes.txt")
    trip_fields, trips = read_csv(zin, "trips.txt")
    stop_fields, stops = read_csv(zin, "stops.txt")

    station_letter = {}
    if args.stations:
        with open(args.stations, encoding="utf-8-sig") as f:
            for r in csv.DictReader(f):
                if r.get("corridor_letter"):
                    station_letter[r["gtfs_station_id"]] = r["corridor_letter"]
    parent_of = {s["stop_id"]: s.get("parent_station") or s["stop_id"] for s in stops}

    agency_of_route = {r["route_id"]: r["agency_id"] for r in routes}
    route_of_trip = {t["trip_id"]: t["route_id"] for t in trips}
    trunkish = {rid for rid, a in agency_of_route.items() if a in (AGENCY_TRONCAL, AGENCY_DUAL)}

    # One pass over stop_times: which trips have any, and each trunk trip's last stop.
    has_times = set()
    last_stop = {}  # trip_id -> (seq, stop_id), trunk routes only
    with zin.open("stop_times.txt") as f:
        reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig", newline=""))
        for r in reader:
            tid = r["trip_id"]
            has_times.add(tid)
            if route_of_trip.get(tid) in trunkish:
                seq = int(r["stop_sequence"])
                if tid not in last_stop or seq > last_stop[tid][0]:
                    last_stop[tid] = (seq, r["stop_id"])

    # Destination corridor per trunk route: most common last-stop station letter.
    dest_letters = {}
    for tid, (_, sid) in last_stop.items():
        letter = station_letter.get(parent_of.get(sid, sid))
        if letter:
            dest_letters.setdefault(route_of_trip[tid], Counter())[letter] += 1

    recolored, unzoned = 0, []
    for r in routes:
        if r["agency_id"] == AGENCY_TRONCAL:
            code = r["route_short_name"].strip().upper()
            letter = code[0] if code[:1] in ZONE_COLORS else None
            if not letter and r["route_id"] in dest_letters:
                letter = dest_letters[r["route_id"]].most_common(1)[0][0]
            if letter in ZONE_COLORS:
                r["route_color"] = ZONE_COLORS[letter]
                r["route_text_color"] = "1A1A1A" if letter in DARK_TEXT_ZONES else "FFFFFF"
                r["route_desc"] = f"Zona {letter}"
                recolored += 1
            else:
                unzoned.append(code)
        elif r["agency_id"] == AGENCY_DUAL:
            r["route_color"], r["route_text_color"] = DUAL_COLOR, DUAL_TEXT
            r["route_desc"] = "Dual"
        elif r["agency_id"] in SITP_COLORS and r["route_color"].lower() in PLACEHOLDER_COLORS:
            r["route_color"], r["route_text_color"] = SITP_COLORS[r["agency_id"]]
    if "route_desc" not in route_fields:
        route_fields.append("route_desc")

    long_name = {r["route_id"]: r["route_long_name"] for r in routes}
    kept_trips, dropped = [], Counter()
    for t in trips:
        if t["trip_id"] not in has_times:
            dropped[agency_of_route.get(t["route_id"])] += 1
            continue
        if not (t.get("trip_headsign") or "").strip():
            t["trip_headsign"] = long_name.get(t["route_id"], "")
        kept_trips.append(t)
    if "trip_headsign" not in trip_fields:
        trip_fields.append("trip_headsign")

    with zipfile.ZipFile(args.dst, "w", zipfile.ZIP_DEFLATED) as zout:
        write_csv(zout, "routes.txt", route_fields, routes)
        write_csv(zout, "trips.txt", trip_fields, kept_trips)
        for name in sorted(names - {"routes.txt", "trips.txt"}):
            if name.endswith("/"):
                continue
            with zin.open(name) as src, zout.open(name, "w") as dst:
                while chunk := src.read(1 << 20):
                    dst.write(chunk)

    by_agency = Counter(r["agency_id"] for r in routes)
    print(f"routes by agency: {dict(sorted(by_agency.items()))}")
    print(f"troncal recolored: {recolored}  unzoned: {sorted(set(unzoned)) or 'none'}")
    print(f"trips kept: {len(kept_trips)}  dropped (no stop_times) by agency: {dict(dropped) or 'none'}")
    if by_agency.get(AGENCY_TRONCAL, 0) < 50:
        print("REJECT: fewer than 50 troncal routes; this export is probably partial", file=sys.stderr)
        sys.exit(2)
    if args.max_dropped is not None and sum(dropped.values()) > args.max_dropped:
        print(f"REJECT: {sum(dropped.values())} trips have no stop_times", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
