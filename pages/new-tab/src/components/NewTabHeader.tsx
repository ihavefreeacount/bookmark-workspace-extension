import { PanelLeft, PanelRight, Plus, Search } from 'lucide-react';

type NewTabHeaderProps = {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onAddCollection: () => void;
  onOpenCommand: () => void;
  onToggleLeft: () => void;
  onToggleRight: () => void;
};

const NewTabHeader = ({
  leftCollapsed,
  rightCollapsed,
  onAddCollection,
  onOpenCommand,
  onToggleLeft,
  onToggleRight,
}: NewTabHeaderProps) => (
  <header className="nt-header">
    <div className="header-left-actions">
      <button
        className="tool-btn"
        onClick={onToggleLeft}
        title={leftCollapsed ? '사이드바 열기' : '사이드바 닫기'}
        aria-label={leftCollapsed ? '사이드바 열기' : '사이드바 닫기'}
        aria-expanded={!leftCollapsed}>
        <PanelLeft size={18} aria-hidden="true" />
      </button>
    </div>
    <div className="header-right-actions">
      <button className="tool-btn" onClick={onAddCollection} title="컬렉션 추가" aria-label="컬렉션 추가">
        <Plus size={18} aria-hidden="true" />
      </button>
      <button className="tool-btn" onClick={onOpenCommand} title="검색 및 명령 (⌘K)" aria-label="검색 및 명령">
        <Search size={18} aria-hidden="true" />
      </button>
      <button
        className="tool-btn"
        onClick={onToggleRight}
        title={rightCollapsed ? '추가 액션 열기' : '추가 액션 닫기'}
        aria-label="추가 액션">
        <PanelRight size={18} aria-hidden="true" />
      </button>
    </div>
  </header>
);

export { NewTabHeader };
