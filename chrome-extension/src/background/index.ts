import 'webextension-polyfill';

const ROOT_FOLDER = 'Bookmark Workspace';

async function ensureRootFolder() {
  const nodes = await chrome.bookmarks.search({ title: ROOT_FOLDER });
  const existing = nodes.find(n => !n.url);
  if (existing) return existing.id;
  const created = await chrome.bookmarks.create({ parentId: '1', title: ROOT_FOLDER });
  return created.id;
}

chrome.runtime.onInstalled.addListener(() => {
  ensureRootFolder().catch(console.error);
});

chrome.runtime.onStartup.addListener(() => {
  ensureRootFolder().catch(console.error);
});

console.log('Bookmark Workspace background ready');
