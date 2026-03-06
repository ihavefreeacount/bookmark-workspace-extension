import '@src/Popup.css';
import { t } from '@extension/i18n';
import { PROJECT_URL_OBJECT, useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);
  const logo = isLight ? 'popup/logo_vertical.svg' : 'popup/logo_vertical_dark.svg';
  const notificationOptions = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon-34.png'),
    title: t('popupActionErrorTitle'),
    message: t('popupActionErrorDescription'),
  } as const;

  const goGithubSite = () => chrome.tabs.create(PROJECT_URL_OBJECT);

  const injectContentScript = async () => {
    const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });

    if (tab.url!.startsWith('about:') || tab.url!.startsWith('chrome:')) {
      chrome.notifications.create('inject-error', notificationOptions);
    }

    await chrome.scripting
      .executeScript({
        target: { tabId: tab.id! },
        files: ['/content-runtime/example.iife.js', '/content-runtime/all.iife.js'],
      })
      .catch(err => {
        // Handling errors related to other paths
        if (err.message.includes('Cannot access a chrome:// URL')) {
          chrome.notifications.create('inject-error', notificationOptions);
        }
      });
  };

  return (
    <div className={cn('App', isLight ? 'bg-slate-50' : 'bg-gray-800')}>
      <header className={cn('App-header', isLight ? 'text-gray-900' : 'text-gray-100')}>
        <button onClick={goGithubSite}>
          <img src={chrome.runtime.getURL(logo)} className="App-logo" alt="logo" />
        </button>
        <div className="App-copy-block">
          <h1 className="App-title">Bookmark Workspace</h1>
          <p className="App-copy">{t('popupDescription')}</p>
          <p className="App-copy">{t('popupActionDescription')}</p>
        </div>
        <div className="App-actions">
          <button
            className={cn(
              'rounded px-4 py-1 font-bold shadow hover:scale-105',
              isLight ? 'bg-blue-200 text-black' : 'bg-gray-700 text-white',
            )}
            onClick={injectContentScript}>
            {t('injectButton')}
          </button>
          <ToggleButton>{t('toggleTheme')}</ToggleButton>
        </div>
      </header>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
