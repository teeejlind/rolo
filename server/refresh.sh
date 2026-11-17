#!/bin/bash
# Pull TransMilenio's newest usable export and re-import. Stop serve.sh first: the server maps the data files.
set -euo pipefail
cd "$(dirname "$0")"
python3 ../tools/fetch_latest_gtfs.py
./bin/motis import
echo "Imported. Start the router again with: server/serve.sh"
