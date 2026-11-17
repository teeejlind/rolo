#!/usr/bin/env python3
"""Download TransMilenio's newest usable GTFS export and build it into server/data/build/.

TransMilenio drops a GTFS_YYYYMMDD.zip into the public gtfs-estaticos bucket most days, with no
stable "latest" URL, and some exports are partial (holiday-dated ones; 2026-09-20 was missing
stop_times for 1,686 trips). So: walk the exports newest-first and keep the first one that
prepare_gtfs.py accepts.
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "server", "data", "raw")
OUT = os.path.join(ROOT, "server", "data", "build", "bogota-gtfs.zip")
STATIONS = os.path.join(ROOT, "server", "data", "ref", "troncal_stations.csv")
LISTING = "https://storage.googleapis.com/storage/v1/b/gtfs-estaticos/o?maxResults=1000"
NAME = re.compile(r"^GTFS[_-](\d{4})-?(\d{2})-?(\d{2})\.zip$")


def list_exports():
    names, token = [], None
    while True:
        url = LISTING + (f"&pageToken={token}" if token else "")
        with urllib.request.urlopen(url, timeout=30) as r:
            page = json.load(r)
        for item in page.get("items", []):
            m = NAME.match(item["name"])
            if m:
                names.append(("".join(m.groups()), item["name"], item["mediaLink"]))
        token = page.get("nextPageToken")
        if not token:
            return sorted(names, reverse=True)


def main():
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    for date, name, link in list_exports()[:6]:
        path = os.path.join(RAW, name)
        if not os.path.exists(path):
            print(f"downloading {name} ...", flush=True)
            urllib.request.urlretrieve(link, path)
        print(f"checking {name}", flush=True)
        candidate = OUT + ".candidate"
        result = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "prepare_gtfs.py"),
                                 path, candidate, "--stations", STATIONS, "--max-dropped", "500"])
        if result.returncode == 0:
            os.replace(candidate, OUT)  # only a validated feed ever replaces the live one
            print(f"built {OUT} from {name}")
            return
        if os.path.exists(candidate):
            os.remove(candidate)
        print(f"rejected {name}, trying the one before it", flush=True)
    sys.exit("no usable export in the last six")


if __name__ == "__main__":
    main()
