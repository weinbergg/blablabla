#!/usr/bin/env bash
# Back-compat wrapper. Real deploy path is deploy/release.sh (atomic + static-assets).
set -euo pipefail
cd /var/www/blabla
exec bash deploy/release.sh
