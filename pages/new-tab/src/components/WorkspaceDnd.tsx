import { useDraggable } from '@dnd-kit/core';
import { motion } from 'motion/react';
import type { WorkspaceDragData } from '@src/lib/new-tab/types';
import type { PointerEventHandler, ReactNode } from 'react';

const DraggableWorkspaceItem = ({
  id,
  data,
  disabled,
  className,
  children,
  onPointerDownCapture,
}: {
  id: string;
  data: WorkspaceDragData;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  onPointerDownCapture?: PointerEventHandler<HTMLLIElement>;
}) => {
  const { attributes, listeners, isDragging, setNodeRef } = useDraggable({
    id,
    data,
    disabled,
  });

  return (
    <motion.li
      ref={setNodeRef}
      className={[className, isDragging ? 'is-dragging' : ''].filter(Boolean).join(' ')}
      data-workspace-id={data.workspaceId}
      onPointerDownCapture={onPointerDownCapture}
      {...attributes}
      {...listeners}>
      {children}
    </motion.li>
  );
};

const WorkspaceDropLine = ({ side }: { side: 'top' | 'bottom' }) => (
  <div className={`workspace-drop-line ${side}`} aria-hidden />
);

const WorkspaceDragAvatar = ({ title }: { title: string }) => (
  <div className="workspace-drag-avatar" aria-hidden>
    <div className="workspace-drag-avatar-title">{title.trim() || 'Untitled'}</div>
  </div>
);

export { DraggableWorkspaceItem, WorkspaceDragAvatar, WorkspaceDropLine };
