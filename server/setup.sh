#!/bin/bash
# One-time setup: MOTIS binary + Bogotá street map + the current TransMilenio feed, then import.
set -euo pipefail
cd "$(dirname "$0")"
MOTIS_VERSION=v2.11.3
mkdir -p bin data/raw data/build
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)               PLATFORM=macos-arm64 ;;
  Linux-x86_64)               PLATFORM=linux-amd64 ;;
  Linux-aarch64|Linux-arm64)  PLATFORM=linux-arm64 ;;
  *) echo "No MOTIS $MOTIS_VERSION build for $(uname -s) $(uname -m). See github.com/motis-project/motis/releases" >&2; exit 1 ;;
esac
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }
if [ ! -x bin/motis ]; then
  curl -fsSL -o bin/motis.tar.bz2 "https://github.com/motis-project/motis/releases/download/$MOTIS_VERSION/motis-$PLATFORM.tar.bz2"
  tar xjf bin/motis.tar.bz2 -C bin && rm bin/motis.tar.bz2
fi
[ -f data/raw/bogota.osm.pbf ] || curl -fsSL -o data/raw/bogota.osm.pbf https://download.bbbike.org/osm/bbbike/Bogota/Bogota.osm.pbf
python3 ../tools/fetch_latest_gtfs.py
./bin/motis import
echo "Ready. Start the router with: server/serve.sh"
