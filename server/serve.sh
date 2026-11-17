#!/bin/bash
# Serve the Bogotá router on :8080 (simulator: http://localhost:8080; iPhone on the same Wi-Fi: http://<this Mac's IP>:8080).
cd "$(dirname "$0")" && exec ./bin/motis server
