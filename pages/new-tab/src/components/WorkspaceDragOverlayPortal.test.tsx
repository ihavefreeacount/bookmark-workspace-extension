// @vitest-environment jsdom

import { WorkspaceDragOverlayPortal } from './WorkspaceDragOverlayPortal';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsWithChildren } from 'react';

vi.mock('@dnd-kit/core', () => ({
  DragOverlay: ({ children }: PropsWithChildren) => <div data-testid="drag-overlay">{children}</div>,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('WorkspaceDragOverlayPortal', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders the drag overlay directly under document.body', async () => {
    await act(async () => {
      root.render(
        <WorkspaceDragOverlayPortal modifiers={[]}>
          <span>Workspace Ghost</span>
        </WorkspaceDragOverlayPortal>,
      );
    });

    expect(container.querySelector('[data-testid="drag-overlay"]')).toBeNull();

    const overlay = document.body.querySelector('[data-testid="drag-overlay"]');

    expect(overlay).not.toBeNull();
    expect(overlay?.parentElement).toBe(document.body);
    expect(overlay?.textContent).toContain('Workspace Ghost');
  });
});
