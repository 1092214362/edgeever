#!/usr/bin/env bash
# Archive and export a signed App Store IPA from apps/ios.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DERIVED="${EDGE_EVER_IOS_DERIVED:-$ROOT/build}"
ARCHIVE_PATH="${EDGE_EVER_IOS_ARCHIVE:-$DERIVED/EdgeEver.xcarchive}"
EXPORT_PATH="${EDGE_EVER_IOS_EXPORT:-$DERIVED/export}"
EXPORT_OPTIONS="${EDGE_EVER_IOS_EXPORT_OPTIONS:-$ROOT/ExportOptions.plist}"

# Prefer stable Xcode for App Store (beta SDKs are rejected by App Store Connect).
if [[ -z "${DEVELOPER_DIR:-}" ]]; then
  if [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
    export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
  fi
fi
echo "Using $(xcodebuild -version | tr '\n' ' ')"

cd "$ROOT"

if [[ "${EDGE_EVER_IOS_SKIP_EDITOR_BUILD:-0}" != "1" ]]; then
  bash "$ROOT/Scripts/build-editor-bundle.sh"
fi

if command -v xcodegen >/dev/null 2>&1; then
  xcodegen generate
fi

mkdir -p "$DERIVED"
rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"

echo "Archiving EdgeEver for App Store..."
xcodebuild \
  -project "$ROOT/EdgeEver.xcodeproj" \
  -scheme EdgeEver \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  -derivedDataPath "$DERIVED/DerivedData" \
  archive

echo "Exporting IPA..."
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS"

IPA="$(find "$EXPORT_PATH" -name '*.ipa' | head -1)"
if [[ -z "$IPA" || ! -f "$IPA" ]]; then
  echo "Export did not produce an IPA under $EXPORT_PATH" >&2
  exit 1
fi

echo "IPA=$IPA"
echo "ARCHIVE=$ARCHIVE_PATH"
