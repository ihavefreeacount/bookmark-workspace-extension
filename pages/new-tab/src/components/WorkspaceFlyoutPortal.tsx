import { AnimatePresence, motion } from 'motion/react';
import { createPortal } from 'react-dom';
import type { WorkspaceFlyout } from '@src/lib/new-tab/types';
import type { RefObject } from 'react';

type WorkspaceFlyoutPortalProps = {
  closeFlyoutTimerRef: RefObject<number | null>;
  onMouseLeave: () => void;
  workspaceFlyout: WorkspaceFlyout | null;
};

const WorkspaceFlyoutPortal = ({ closeFlyoutTimerRef, onMouseLeave, workspaceFlyout }: WorkspaceFlyoutPortalProps) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {workspaceFlyout && (
        <motion.div
          key={workspaceFlyout.workspaceId}
          className="workspace-flyout"
          style={{ left: workspaceFlyout.x, top: workspaceFlyout.y }}
          initial={{ opacity: 0, x: -8, scale: 0.97, filter: 'blur(4px)' }}
          animate={{
            opacity: 1,
            x: 0,
            scale: 1,
            filter: 'blur(0px)',
            transition: { type: 'spring', stiffness: 450, damping: 30, mass: 0.8 },
          }}
          exit={{ opacity: 0, x: -4, scale: 0.98, transition: { duration: 0.15, ease: 'easeOut' } }}
          onMouseEnter={() => {
            if (closeFlyoutTimerRef.current) {
              window.clearTimeout(closeFlyoutTimerRef.current);
              closeFlyoutTimerRef.current = null;
            }
          }}
          onMouseLeave={onMouseLeave}>
          <div className="workspace-flyout-title">컬렉션 목록</div>
          <ul className="workspace-flyout-list">
            {workspaceFlyout.collections.map((name, index) => (
              <li key={`${workspaceFlyout.workspaceId}-${index}-${name}`}>
                <span>{name}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export { WorkspaceFlyoutPortal };
