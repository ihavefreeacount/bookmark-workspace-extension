export async function removeBookmarkWithUserConsent(id: string, title?: string) {
  const ok = window.confirm(`북마크를 삭제할까요?\n\n${title || id}\n\n이 작업은 되돌릴 수 없습니다.`);
  if (!ok) return { ok: false, reason: 'cancelled' as const };
  await chrome.bookmarks.remove(id);
  return { ok: true as const };
}

export async function removeBookmarkTreeWithUserConsent(id: string, title?: string) {
  const ok = window.confirm(
    `폴더와 하위 북마크를 모두 삭제할까요?\n\n${title || id}\n\n이 작업은 되돌릴 수 없습니다.`,
  );
  if (!ok) return { ok: false, reason: 'cancelled' as const };
  await chrome.bookmarks.removeTree(id);
  return { ok: true as const };
}
