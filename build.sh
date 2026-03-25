#!/bin/bash
# Mojjjak: build script — creates a release zip for Chrome Web Store
# Authors: mojtaba.akbari@gwdg.de, matthias.eulert@gwdg.de

VERSION=$(grep '"version"' manifest.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')
FILENAME="mjt-translator-v${VERSION}.zip"

rm -f "$FILENAME"

zip -r "$FILENAME" \
  manifest.json \
  background.js \
  offscreen.html \
  offscreen.js \
  diarize.js \
  content.js \
  content.css \
  popup.html \
  popup.js \
  icon.svg \
  icon16.png \
  icon48.png \
  icon128.png \
  LICENSE \
  README.md

echo ""
echo "Built: $FILENAME"
echo "Size: $(du -h "$FILENAME" | cut -f1)"
echo ""
echo "To upload to Chrome Web Store:"
echo "  1. Go to https://chrome.google.com/webstore/devconsole"
echo "  2. Click 'New Item' or update existing"
echo "  3. Upload $FILENAME"
