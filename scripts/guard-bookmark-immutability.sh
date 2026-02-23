#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Policy:
# - bookmarks.move/update are forbidden (can silently mutate user organization)
# - bookmarks.remove/removeTree are allowed ONLY via explicit consent wrapper file

FORBIDDEN_ALWAYS='bookmarks\.(move\(|update\()'
allowed_delete_file='pages/new-tab/src/lib/bookmark-consent.ts'

always_matches=$(grep -RInE "$FORBIDDEN_ALWAYS" chrome-extension pages packages --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' || true)
if [[ -n "$always_matches" ]]; then
  echo "❌ Bookmark safety guard failed. Forbidden APIs found:"
  echo "$always_matches"
  echo
  echo "bookmarks.move/update are disallowed."
  exit 1
fi

delete_matches=$(grep -RInE 'bookmarks\.(remove\(|removeTree\()' chrome-extension pages packages --include='*.ts' --include='*.tsx' --include='*.js' --include='*.jsx' || true)
if [[ -n "$delete_matches" ]]; then
  filtered=$(echo "$delete_matches" | grep -v "$allowed_delete_file" || true)
  if [[ -n "$filtered" ]]; then
    echo "❌ Bookmark safety guard failed. Delete APIs may only be used in: $allowed_delete_file"
    echo "$filtered"
    exit 1
  fi
fi

echo "✅ Bookmark safety guard passed."
