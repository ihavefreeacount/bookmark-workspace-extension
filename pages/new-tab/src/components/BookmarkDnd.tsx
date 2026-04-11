import { useSortable } from '@dnd-kit/sortable';
import { motion } from 'motion/react';
import type { BookmarkDragData, BookmarkDragOverlayData } from '@src/lib/new-tab/types';
import type { PointerEventHandler, ReactNode } from 'react';

const SortableBookmarkItem = ({
  id,
  data,
  disabled,
  dragging,
  className,
  children,
  onPointerDownCapture,
  motionProps,
}: {
  id: string;
  data: BookmarkDragData;
  disabled?: boolean;
  dragging?: boolean;
  className?: string;
  children: ReactNode;
  onPointerDownCapture?: PointerEventHandler<HTMLLIElement>;
  motionProps?: Record<string, unknown>;
}) => {
  const { attributes, listeners, setNodeRef } = useSortable({
    id,
    data,
    disabled,
  });

  return (
    <motion.li
      ref={setNodeRef}
      className={[className, dragging ? 'is-dragging' : ''].filter(Boolean).join(' ')}
      onPointerDownCapture={onPointerDownCapture}
      {...attributes}
      {...listeners}
      {...motionProps}>
      {children}
    </motion.li>
  );
};

const BookmarkDropLine = ({ side }: { side: 'left' | 'right' }) => (
  <div className={`bookmark-drop-line ${side}`} aria-hidden />
);

const BookmarkDragAvatar = ({ title, domain }: BookmarkDragOverlayData) => (
  <div className="bookmark-drag-avatar" aria-hidden>
    <div className="bookmark-drag-avatar-title">{title}</div>
    <div className="bookmark-drag-avatar-domain">{domain}</div>
  </div>
);

export { BookmarkDragAvatar, BookmarkDropLine, SortableBookmarkItem };
