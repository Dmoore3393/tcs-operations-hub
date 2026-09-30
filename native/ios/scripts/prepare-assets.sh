#!/bin/sh
set -eu

if [ -z "${SRCROOT:-}" ]; then
  echo "Xcode SRCROOT is not available to the app-icon build phase." >&2
  exit 1
fi

ROOT="$(cd "$SRCROOT/../.." && pwd)"
ASSET_DIR="$SRCROOT/TheHub/Assets.xcassets/AppIcon.appiconset"
SOURCE="$ROOT/public/app-icon-512.png"
OUTPUT="$ASSET_DIR/AppIcon-1024.png"

if [ ! -f "$SOURCE" ]; then
  echo "Missing official Hub app icon source: $SOURCE" >&2
  exit 1
fi

mkdir -p "$ASSET_DIR"
/usr/bin/sips -z 1024 1024 "$SOURCE" --out "$OUTPUT" >/dev/null

echo "Prepared official 1024×1024 Hub App Store icon."
