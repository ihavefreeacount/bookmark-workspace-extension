import * as ContextMenu from '@radix-ui/react-context-menu';
import { Plus } from 'lucide-react';
import { Reorder } from 'motion/react';
import type { BookmarkNode } from '@src/lib/new-tab/types';
import type { RefObject } from 'react';

type WorkspaceSidebarProps = {
  dragKind: 'tab' | 'collection' | null;
  draggingWorkspaceId: string | null;
  dropWorkspaceId: string | null;
  onCancelWorkspaceEdit: () => void;
  onDropWorkspaceHighlight: (workspaceId: string | null) => void;
  editingWorkspaceBusy: boolean;
  editingWorkspaceId: string | null;
  editingWorkspaceName: string;
  editingWorkspaceRef: RefObject<HTMLInputElement | null>;
  onCloseWorkspaceInlineInput: () => void;
  onEditingWorkspaceNameChange: (value: string) => void;
  onOpenWorkspaceInlineInput: () => void;
  onPersistWorkspaceOrder: () => Promise<void> | void;
  onRequestDeleteWorkspace: (workspace: BookmarkNode) => void;
  onSaveWorkspaceEdit: () => Promise<void> | void;
  onSelectWorkspace: (workspaceId: string) => void;
  onStartWorkspaceDrag: (workspaceId: string) => void;
  onStartWorkspaceEdit: (workspace: BookmarkNode) => void;
  onWorkspaceDrop: (event: React.DragEvent<HTMLButtonElement>, workspace: BookmarkNode) => Promise<void> | void;
  onWorkspaceHoverEnter: (workspace: BookmarkNode, anchorEl: HTMLButtonElement) => void;
  onWorkspaceHoverLeave: () => void;
  onWorkspaceOrderChange: (workspaceIds: string[]) => void;
  onWorkspaceReorderEnd: () => void;
  orderedWorkspaces: BookmarkNode[];
  selectedWorkspaceId: string;
  workspaceInlineBusy: boolean;
  workspaceInlineName: string;
  workspaceInlineOpen: boolean;
  workspaceInlineRef: RefObject<HTMLInputElement | null>;
  workspaceOrderIds: string[];
  onWorkspaceInlineNameChange: (value: string) => void;
  onSubmitWorkspaceInlineInput: () => Promise<void> | void;
};

const WorkspaceSidebar = ({
  dragKind,
  draggingWorkspaceId,
  dropWorkspaceId,
  onCancelWorkspaceEdit,
  onDropWorkspaceHighlight,
  editingWorkspaceBusy,
  editingWorkspaceId,
  editingWorkspaceName,
  editingWorkspaceRef,
  onCloseWorkspaceInlineInput,
  onEditingWorkspaceNameChange,
  onOpenWorkspaceInlineInput,
  onPersistWorkspaceOrder,
  onRequestDeleteWorkspace,
  onSaveWorkspaceEdit,
  onSelectWorkspace,
  onStartWorkspaceDrag,
  onStartWorkspaceEdit,
  onWorkspaceDrop,
  onWorkspaceHoverEnter,
  onWorkspaceHoverLeave,
  onWorkspaceOrderChange,
  onWorkspaceReorderEnd,
  orderedWorkspaces,
  selectedWorkspaceId,
  workspaceInlineBusy,
  workspaceInlineName,
  workspaceInlineOpen,
  workspaceInlineRef,
  workspaceOrderIds,
  onWorkspaceInlineNameChange,
  onSubmitWorkspaceInlineInput,
}: WorkspaceSidebarProps) => (
  <aside className={`panel left ${draggingWorkspaceId ? 'workspace-dragging' : ''}`}>
    <div className="panel-content">
      <Reorder.Group
        axis="y"
        values={workspaceOrderIds}
        onReorder={onWorkspaceOrderChange}
        layoutScroll
        className="workspace-list">
        {orderedWorkspaces.map(workspace => (
          <Reorder.Item
            key={workspace.id}
            value={workspace.id}
            className={`workspace-reorder-item ${draggingWorkspaceId === workspace.id ? 'dragging' : ''}`}
            layout="position"
            dragMomentum={false}
            whileDrag={{
              scale: 1,
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            }}
            transition={draggingWorkspaceId ? { type: 'spring', stiffness: 400, damping: 30 } : { duration: 0 }}
            onDragStart={() => onStartWorkspaceDrag(workspace.id)}
            onDragEnd={() => {
              onWorkspaceReorderEnd();
              void onPersistWorkspaceOrder();
            }}>
            <ContextMenu.Root modal={false}>
              <ContextMenu.Trigger asChild>
                <div>
                  {editingWorkspaceId === workspace.id ? (
                    <div className="workspace-item is-editing">
                      <input
                        ref={editingWorkspaceRef}
                        className="workspace-edit-input"
                        value={editingWorkspaceName}
                        onChange={event => onEditingWorkspaceNameChange(event.currentTarget.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void onSaveWorkspaceEdit();
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            onCancelWorkspaceEdit();
                          }
                        }}
                        onBlur={() => {
                          void onSaveWorkspaceEdit();
                        }}
                        disabled={editingWorkspaceBusy}
                      />
                    </div>
                  ) : (
                    <button
                      className={[
                        'workspace-item',
                        selectedWorkspaceId === workspace.id ? 'active' : '',
                        dropWorkspaceId === workspace.id ? 'drop-target' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onMouseEnter={event => onWorkspaceHoverEnter(workspace, event.currentTarget)}
                      onMouseLeave={onWorkspaceHoverLeave}
                      onClick={() => onSelectWorkspace(workspace.id)}
                      onDragOver={event => {
                        if (dragKind !== 'collection') return;
                        event.preventDefault();
                        onDropWorkspaceHighlight(workspace.id);
                      }}
                      onDragLeave={() => onDropWorkspaceHighlight(null)}
                      onDrop={event => {
                        void onWorkspaceDrop(event, workspace);
                      }}>
                      {workspace.title}
                    </button>
                  )}
                </div>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className="col-context-menu">
                  <div className="col-context-label">워크스페이스 메뉴 · {workspace.title}</div>
                  <ContextMenu.Separator className="col-context-separator" />
                  <ContextMenu.Item className="col-context-item" onSelect={() => onStartWorkspaceEdit(workspace)}>
                    수정
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    className="col-context-item col-context-item-destructive"
                    onSelect={() => onRequestDeleteWorkspace(workspace)}>
                    워크스페이스 삭제
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <ul className="workspace-list workspace-list-static">
        {workspaceInlineOpen && (
          <li className="workspace-inline-input-item">
            <input
              ref={workspaceInlineRef}
              className="workspace-inline-input"
              type="text"
              placeholder="워크스페이스 이름..."
              value={workspaceInlineName}
              onChange={event => onWorkspaceInlineNameChange(event.currentTarget.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void onSubmitWorkspaceInlineInput();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  onCloseWorkspaceInlineInput();
                }
              }}
              onBlur={() => {
                void onSubmitWorkspaceInlineInput();
              }}
              disabled={workspaceInlineBusy}
            />
          </li>
        )}
        <li>
          <button
            className="workspace-add-button"
            onClick={onOpenWorkspaceInlineInput}
            title="워크스페이스 추가"
            aria-label="워크스페이스 추가">
            <Plus size={14} aria-hidden="true" />
            <span>워크스페이스 추가</span>
          </button>
        </li>
      </ul>
    </div>
  </aside>
);

export { WorkspaceSidebar };
