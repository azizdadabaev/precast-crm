#!/bin/sh
# Runs as root. Ensures the drawings output directory is writable by the
# bridge user before dropping privileges and exec-ing the server.
set -e
mkdir -p "${DRAWINGS_DIR:-/data/drawings}"
chown -R bridge:bridge /data
exec su-exec bridge "$@"
