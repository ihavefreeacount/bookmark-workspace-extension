import { DndContext } from '@dnd-kit/core';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { DraggableWorkspaceItem, WorkspaceDragAvatar, WorkspaceDropLine } from '@src/components/WorkspaceDnd';
import { WorkspaceDragOverlayPortal } from '@src/components/WorkspaceDragOverlayPortal';
import { getWorkspaceDndId } from '@src/lib/new-tab/helpers';
import { Plus } from 'lucide-react';
import type { WorkspaceDndController } from '@src/lib/new-tab/collections-board-types';
import type { BookmarkNode } from '@src/lib/new-tab/types';
import type { RefObject } from 'react';

type WorkspaceSidebarProps = {
  dragKind: 'tab' | 'collection' | null;
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
  onRequestDeleteWorkspace: (workspace: BookmarkNode) => void;
  onSaveWorkspaceEdit: () => Promise<void> | void;
  onSelectWorkspace: (workspaceId: string) => void;
  onStartWorkspaceEdit: (workspace: BookmarkNode) => void;
  onWorkspaceDrop: (event: React.DragEvent<HTMLButtonElement>, workspace: BookmarkNode) => Promise<void> | void;
  onWorkspaceHoverEnter: (workspace: BookmarkNode, anchorEl: HTMLButtonElement) => void;
  onWorkspaceHoverLeave: () => void;
  orderedWorkspaces: BookmarkNode[];
  selectedWorkspaceId: string;
  workspaceDnd: WorkspaceDndController;
  workspaceInlineBusy: boolean;
  workspaceInlineName: string;
  workspaceInlineOpen: boolean;
  workspaceInlineRef: RefObject<HTMLInputElement | null>;
  onWorkspaceInlineNameChange: (value: string) => void;
  onSubmitWorkspaceInlineInput: () => Promise<void> | void;
};

const WorkspaceSidebar = ({
  dragKind,
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
  onRequestDeleteWorkspace,
  onSaveWorkspaceEdit,
  onSelectWorkspace,
  onStartWorkspaceEdit,
  onWorkspaceDrop,
  onWorkspaceHoverEnter,
  onWorkspaceHoverLeave,
  orderedWorkspaces,
  selectedWorkspaceId,
  workspaceDnd,
  workspaceInlineBusy,
  workspaceInlineName,
  workspaceInlineOpen,
  workspaceInlineRef,
  onWorkspaceInlineNameChange,
  onSubmitWorkspaceInlineInput,
}: WorkspaceSidebarProps) => {
  const {
    activeWorkspaceDragId,
    handleWorkspaceDragCancel,
    handleWorkspaceDragEnd,
    handleWorkspaceDragMove,
    handleWorkspaceDragStart,
    handleWorkspacePointerDownCapture,
    sensors,
    workspaceDropPreview,
    workspaceOverlayModifier,
    workspaceListNodeRef,
    workspaceReorderBusy,
  } = workspaceDnd;
  const activeWorkspaceTitle =
    orderedWorkspaces.find(workspace => workspace.id === activeWorkspaceDragId)?.title || 'Untitled';

  return (
    <aside className={`panel left ${activeWorkspaceDragId ? 'workspace-dragging' : ''}`}>
      <div className="panel-content">
        <DndContext
          sensors={sensors}
          onDragStart={handleWorkspaceDragStart}
          onDragMove={handleWorkspaceDragMove}
          onDragCancel={handleWorkspaceDragCancel}
          onDragEnd={handleWorkspaceDragEnd}>
          <ul ref={workspaceListNodeRef} className="workspace-list">
            {orderedWorkspaces.map(workspace => {
              const showTopPreview =
                workspaceDropPreview?.renderId === workspace.id && workspaceDropPreview.side === 'top';
              const showBottomPreview =
                workspaceDropPreview?.renderId === workspace.id && workspaceDropPreview.side === 'bottom';

              return (
                <DraggableWorkspaceItem
                  key={workspace.id}
                  id={getWorkspaceDndId(workspace.id)}
                  data={{
                    kind: 'workspace',
                    workspaceId: workspace.id,
                  }}
                  className="workspace-reorder-item"
                  disabled={editingWorkspaceId === workspace.id || workspaceReorderBusy}
                  onPointerDownCapture={event =>
                    handleWorkspacePointerDownCapture(
                      {
                        kind: 'workspace',
                        workspaceId: workspace.id,
                      },
                      event,
                    )
                  }>
                  {showTopPreview && <WorkspaceDropLine side="top" />}
                  <ContextMenu.Root modal={false}>
                    <ContextMenu.Trigger asChild>
                      <div>
                        {editingWorkspaceId === workspace.id ? (
                          <div className="workspace-item is-editing" data-workspace-drag-origin-exempt>
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
                              dragKind === 'collection' && dropWorkspaceId === workspace.id ? 'drop-target' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            draggable={false}
                            onMouseEnter={event => onWorkspaceHoverEnter(workspace, event.currentTarget)}
                            onMouseLeave={onWorkspaceHoverLeave}
                            onClick={() => {
                              if (activeWorkspaceDragId || workspaceReorderBusy) return;
                              onSelectWorkspace(workspace.id);
                            }}
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
                  {showBottomPreview && <WorkspaceDropLine side="bottom" />}
                </DraggableWorkspaceItem>
              );
            })}
          </ul>
          <WorkspaceDragOverlayPortal modifiers={[workspaceOverlayModifier]}>
            {activeWorkspaceDragId ? <WorkspaceDragAvatar title={activeWorkspaceTitle} /> : null}
          </WorkspaceDragOverlayPortal>
        </DndContext>
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
};

export { WorkspaceSidebar };
