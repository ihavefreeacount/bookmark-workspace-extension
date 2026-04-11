import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createPortal } from 'react-dom';
import type { WorkspaceFlyout } from '@src/lib/new-tab/types';
import type { RefObject } from 'react';

type WorkspaceFlyoutPortalProps = {
  closeFlyoutTimerRef: RefObject<number | null>;
  onMouseLeave: () => void;
  workspaceFlyout: WorkspaceFlyout | null;
};

const WorkspaceFlyoutPortal = ({ closeFlyoutTimerRef, onMouseLeave, workspaceFlyout }: WorkspaceFlyoutPortalProps) => {
  const shouldReduceMotion = useReducedMotion();

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {workspaceFlyout && (
        <motion.div
          key={workspaceFlyout.workspaceId}
          className="workspace-flyout"
          style={{ left: workspaceFlyout.x, top: workspaceFlyout.y }}
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: shouldReduceMotion ? 0.01 : 0.1, ease: 'easeOut' } }}
          exit={{ opacity: 0, transition: { duration: shouldReduceMotion ? 0.01 : 0.08, ease: 'easeOut' } }}
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
