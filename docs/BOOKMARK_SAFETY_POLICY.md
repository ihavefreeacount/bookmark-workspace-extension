# Bookmark Safety Policy

This project treats bookmarks as user-owned data.

## Rules

- `chrome.bookmarks.move(...)` and `chrome.bookmarks.update(...)` are disallowed.
- Delete APIs are allowed only with explicit user consent:
  - `chrome.bookmarks.remove(...)`
  - `chrome.bookmarks.removeTree(...)`
- Delete APIs may only be called from consent wrapper:
  - `pages/new-tab/src/lib/bookmark-consent.ts`

## Consent requirement

Before any delete action:

1. Show a clear confirmation dialog
2. Include target title/id in prompt
3. Explain irreversibility (cannot be undone)
4. Only proceed when user explicitly confirms

## Enforcement

CI/local pre-check uses:

- `scripts/guard-bookmark-immutability.sh`

Build/check fails if forbidden usage is detected outside policy.
