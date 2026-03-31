import { getDomain, getFallbackFavicon, getFaviconCandidates } from '@src/lib/favicon-resolver';
import { DND_TAB_MIME } from '@src/lib/new-tab/helpers';
import { Globe, Link2 } from 'lucide-react';
import type { DragEventHandler } from 'react';

type OpenTabsPanelProps = {
  tabs: chrome.tabs.Tab[];
  onBeginTabDrag: () => void;
  onEndTabDrag: () => void;
  onFocusTab: (tabId?: number) => Promise<void> | void;
};

const OpenTabsPanel = ({ tabs, onBeginTabDrag, onEndTabDrag, onFocusTab }: OpenTabsPanelProps) => {
  const handleDragStart: DragEventHandler<HTMLLIElement> = event => {
    const tab = tabs.find(candidate => candidate.id?.toString() === event.currentTarget.dataset.tabId);
    if (!tab) return;

    onBeginTabDrag();
    event.dataTransfer.setData(
      DND_TAB_MIME,
      JSON.stringify({ title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl }),
    );
  };

  return (
    <aside className="panel right">
      <div className="panel-content">
        <div className="panel-section-header">
          <Globe className="panel-section-icon" size={15} aria-hidden="true" />
          <strong>열린 탭</strong>
        </div>
        <ul className="tab-list">
          {tabs.map(tab => {
            const faviconSrc = getFaviconCandidates(tab.url)[0];
            const isFallbackIcon = faviconSrc === getFallbackFavicon();

            return (
              <li
                className={tab.active ? 'active' : ''}
                key={tab.id}
                data-tab-id={tab.id}
                draggable
                onDragStart={handleDragStart}
                onDragEnd={onEndTabDrag}>
                <button
                  type="button"
                  className="link-row tab-row-btn"
                  onClick={() => {
                    void onFocusTab(tab.id);
                  }}>
                  {isFallbackIcon ? (
                    <span className="fav-fallback" aria-hidden>
                      <Link2 size={14} />
                    </span>
                  ) : (
                    <img className="fav" src={faviconSrc} alt="" />
                  )}
                  <div>
                    <div className="tab-title">{tab.title || tab.url}</div>
                    <div className="tab-domain">{getDomain(tab.url)}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
};

export { OpenTabsPanel };
