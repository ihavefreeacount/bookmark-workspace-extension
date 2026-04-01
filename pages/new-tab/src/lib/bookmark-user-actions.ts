type BookmarkNodeDestination = chrome.bookmarks.MoveDestination;
type BookmarkNodeChanges = chrome.bookmarks.UpdateChanges;

// Callers must only invoke these helpers from explicit user gestures such as
// drag-and-drop, inline rename, or other direct interactions in the New Tab UI.
export const moveBookmarkNodeFromUserAction = async (id: string, destination: BookmarkNodeDestination) =>
  chrome.bookmarks.move(id, destination);

export const updateBookmarkNodeFromUserAction = async (id: string, changes: BookmarkNodeChanges) =>
  chrome.bookmarks.update(id, changes);
