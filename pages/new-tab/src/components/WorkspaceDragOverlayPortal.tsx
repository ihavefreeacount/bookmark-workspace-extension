import { DragOverlay } from '@dnd-kit/core';
import { createPortal } from 'react-dom';
import type { Modifier } from '@dnd-kit/core';
import type { ReactNode } from 'react';

type WorkspaceDragOverlayPortalProps = {
  children: ReactNode;
  modifiers: Modifier[];
};

const WorkspaceDragOverlayPortal = ({ children, modifiers }: WorkspaceDragOverlayPortalProps) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <DragOverlay dropAnimation={null} modifiers={modifiers} zIndex={1000}>
      {children}
    </DragOverlay>,
    document.body,
  );
};

export { WorkspaceDragOverlayPortal };
