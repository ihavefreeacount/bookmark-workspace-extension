export const removeBookmarkAfterUserConsent = async (id: string) => {
  await chrome.bookmarks.remove(id);
  return { ok: true as const };
};

export const removeBookmarkWithUserConsent = async (id: string, title?: string) => {
  const ok = window.confirm(`북마크를 삭제할까요?\n\n${title || id}\n\n이 작업은 되돌릴 수 없습니다.`);
  if (!ok) return { ok: false, reason: 'cancelled' as const };
  return removeBookmarkAfterUserConsent(id);
};

export const removeBookmarkTreeAfterUserConsent = async (id: string) => {
  await chrome.bookmarks.removeTree(id);
  return { ok: true as const };
};

export const removeBookmarkTreeWithUserConsent = async (id: string, title?: string) => {
  const ok = window.confirm(`폴더와 하위 북마크를 모두 삭제할까요?\n\n${title || id}\n\n이 작업은 되돌릴 수 없습니다.`);
  if (!ok) return { ok: false, reason: 'cancelled' as const };
  return removeBookmarkTreeAfterUserConsent(id);
};
