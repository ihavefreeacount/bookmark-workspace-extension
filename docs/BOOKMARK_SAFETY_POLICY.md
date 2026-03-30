# Bookmark Safety Policy

This project treats bookmarks as user-owned data.

## Rules

- `chrome.bookmarks.move(...)` and `chrome.bookmarks.update(...)` are allowed only from the user-action wrapper:
  - `pages/new-tab/src/lib/bookmark-user-actions.ts`
- Callers must only use that wrapper for explicit user-driven interactions such as drag-and-drop or inline rename.
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

Build/check fails if bookmark mutation APIs are detected outside the approved wrapper files.
