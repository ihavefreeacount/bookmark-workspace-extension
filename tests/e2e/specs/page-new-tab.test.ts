import { canSwitchTheme } from '../helpers/theme.js';

describe('Webextension New Tab', () => {
  it('should open the extension page when a new tab is opened', async () => {
    const extensionPath = await browser.getExtensionPath();
    const newTabUrl =
      process.env.CLI_CEB_FIREFOX === 'true' ? `${extensionPath}/new-tab/index.html` : 'chrome://newtab';

    await browser.url(newTabUrl);

    const appDiv = await $('.App').getElement();
    await expect(appDiv).toBeExisting();
    await canSwitchTheme();
  });

  it('should search bookmarks with synonym and keyboard-layout correction', async () => {
    const extensionPath = await browser.getExtensionPath();
    const newTabUrl =
      process.env.CLI_CEB_FIREFOX === 'true' ? `${extensionPath}/new-tab/index.html` : 'chrome://newtab';

    await browser.url(newTabUrl);

    const seeded = await browser.executeAsync(done => {
      const rootFolder = 'My Little Bookmark';

      void (async () => {
        const nodes = await chrome.bookmarks.search({ title: rootFolder });
        const root = nodes.find(node => !node.url);

        if (!root) {
          done('missing-root-folder');
          return;
        }

        const [subtree] = await chrome.bookmarks.getSubTree(root.id);
        for (const child of subtree.children || []) {
          if (child.url) {
            await chrome.bookmarks.remove(child.id);
          } else {
            await chrome.bookmarks.removeTree(child.id);
          }
        }

        const workspace = await chrome.bookmarks.create({ parentId: root.id, title: 'Search Test Workspace' });
        const collection = await chrome.bookmarks.create({ parentId: workspace.id, title: 'Engineering' });

        await chrome.bookmarks.create({
          parentId: collection.id,
          title: '리액트 베타 문서',
          url: 'https://beta.react.dev/learn',
        });
        await chrome.bookmarks.create({
          parentId: collection.id,
          title: 'GitHub Repository',
          url: 'https://github.com/example/repo',
        });

        done('ok');
      })().catch(error => done(String(error)));
    });

    expect(seeded).toBe('ok');

    await browser.waitUntil(async () => (await $('body').getText()).includes('Search Test Workspace'));

    const openSearchButton = await $('button[aria-label="검색 및 명령"]');
    await openSearchButton.click();

    const input = await $('.cmdk-input');
    await input.waitForExist();

    await input.setValue('beta');
    await browser.waitUntil(async () => (await $('.cmdk-list').getText()).includes('동의어'));
    const synonymResultText = await $('.cmdk-list').getText();
    if (!synonymResultText.includes('리액트 베타 문서')) {
      throw new Error(`Expected synonym result to include bookmark title, received: ${synonymResultText}`);
    }

    await input.setValue('fldorxm');
    await browser.waitUntil(async () => (await $('.cmdk-list').getText()).includes('한영 보정'));
    const layoutCorrectedText = await $('.cmdk-list').getText();
    if (!layoutCorrectedText.includes('리액트 베타 문서')) {
      throw new Error(`Expected layout-corrected result to include bookmark title, received: ${layoutCorrectedText}`);
    }
  });
});
