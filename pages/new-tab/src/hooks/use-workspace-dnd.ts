import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { moveBookmarkNodeFromUserAction } from '@src/lib/bookmark-user-actions';
import {
  getVerticalListDropPreview,
  measureVerticalDropSlots,
  moveIdToIndex,
  reconcileOrderIds,
} from '@src/lib/dnd/sortable-helpers';
import {
  getDragPointerCoordinates,
  getPointerCoordinates,
  isWorkspaceDragOriginExempt,
} from '@src/lib/new-tab/helpers';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEndEvent, DragMoveEvent, DragStartEvent, Modifier } from '@dnd-kit/core';
import type { PointerCoordinates } from '@src/lib/dnd/sortable-helpers';
import type {
  BookmarkNode,
  WorkspaceDragData,
  WorkspaceDropPreview,
  WorkspacePointerDownOrigin,
} from '@src/lib/new-tab/types';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

type UseWorkspaceDndOptions = {
  refresh: () => Promise<void>;
  setToast: (message: string) => void;
  suppressBookmarkRefreshRef: RefObject<boolean>;
  tree: BookmarkNode | null;
  workspaces: BookmarkNode[];
};

const WORKSPACE_DRAG_ACTIVATION_DISTANCE = 8;
const WORKSPACE_DRAG_AVATAR_SIZE = { width: 220, height: 46 } as const;

const useWorkspaceDnd = ({
  refresh,
  setToast,
  suppressBookmarkRefreshRef,
  tree,
  workspaces,
}: UseWorkspaceDndOptions) => {
  const [workspaceOrderIds, setWorkspaceOrderIds] = useState<string[]>([]);
  const [workspaceReorderBusy, setWorkspaceReorderBusy] = useState(false);
  const [activeWorkspaceDrag, setActiveWorkspaceDrag] = useState<WorkspaceDragData | null>(null);
  const [workspaceDropPreview, setWorkspaceDropPreview] = useState<WorkspaceDropPreview | null>(null);

  const workspaceListNodeRef = useRef<HTMLUListElement | null>(null);
  const workspaceDragPointerOriginRef = useRef<PointerCoordinates | null>(null);
  const workspacePointerDownOriginRef = useRef<WorkspacePointerDownOrigin | null>(null);
  const workspaceCurrentPointerRef = useRef<PointerCoordinates | null>(null);
  const workspacePointerTrackingCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setWorkspaceOrderIds(previous =>
      reconcileOrderIds(
        previous,
        workspaces.map(workspace => workspace.id),
      ),
    );
  }, [workspaces]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: WORKSPACE_DRAG_ACTIVATION_DISTANCE,
      },
    }),
  );

  const stopWorkspacePointerTracking = useCallback(() => {
    workspacePointerTrackingCleanupRef.current?.();
    workspacePointerTrackingCleanupRef.current = null;
  }, []);

  const startWorkspacePointerTracking = useCallback(() => {
    stopWorkspacePointerTracking();

    const updatePointer = (event: Event) => {
      const pointer = getPointerCoordinates(event);
      if (pointer) {
        workspaceCurrentPointerRef.current = pointer;
      }
    };
    const stopTracking = () => stopWorkspacePointerTracking();

    window.addEventListener('pointermove', updatePointer, { capture: true, passive: true });
    window.addEventListener('touchmove', updatePointer, { capture: true, passive: true });
    window.addEventListener('pointerup', stopTracking, { passive: true });
    window.addEventListener('pointercancel', stopTracking, { passive: true });
    window.addEventListener('touchend', stopTracking, { passive: true });
    window.addEventListener('touchcancel', stopTracking, { passive: true });

    workspacePointerTrackingCleanupRef.current = () => {
      window.removeEventListener('pointermove', updatePointer, true);
      window.removeEventListener('touchmove', updatePointer, true);
      window.removeEventListener('pointerup', stopTracking);
      window.removeEventListener('pointercancel', stopTracking);
      window.removeEventListener('touchend', stopTracking);
      window.removeEventListener('touchcancel', stopTracking);
    };
  }, [stopWorkspacePointerTracking]);

  useEffect(() => stopWorkspacePointerTracking, [stopWorkspacePointerTracking]);

  const resetWorkspaceDragState = useCallback(() => {
    setActiveWorkspaceDrag(null);
    setWorkspaceDropPreview(null);
    workspaceDragPointerOriginRef.current = null;
    workspacePointerDownOriginRef.current = null;
    workspaceCurrentPointerRef.current = null;
    stopWorkspacePointerTracking();
  }, [stopWorkspacePointerTracking]);

  const workspaceOverlayModifier = useCallback<Modifier>(
    ({ active, activeNodeRect, overlayNodeRect, transform, windowRect }) => {
      const data = active?.data.current as WorkspaceDragData | undefined;
      const origin = workspaceDragPointerOriginRef.current;
      const livePointer = workspaceCurrentPointerRef.current;
      const baseRect = activeNodeRect;

      if (!data || data.kind !== 'workspace' || !origin || !baseRect) {
        return transform;
      }

      const pointerX = livePointer?.x ?? origin.x + transform.x;
      const pointerY = livePointer?.y ?? origin.y + transform.y;
      const avatarWidth = overlayNodeRect?.width ?? WORKSPACE_DRAG_AVATAR_SIZE.width;
      const avatarHeight = overlayNodeRect?.height ?? WORKSPACE_DRAG_AVATAR_SIZE.height;
      const offsetX = Math.min(Math.max(origin.x - baseRect.left, 16), Math.max(avatarWidth - 16, 16));
      const offsetY = Math.min(Math.max(origin.y - baseRect.top, 12), Math.max(avatarHeight - 12, 12));
      const maxLeft = windowRect ? Math.max(0, windowRect.width - avatarWidth) : pointerX - offsetX;
      const maxTop = windowRect ? Math.max(0, windowRect.height - avatarHeight) : pointerY - offsetY;
      const desiredLeft = Math.min(Math.max(0, pointerX - offsetX), maxLeft);
      const desiredTop = Math.min(Math.max(0, pointerY - offsetY), maxTop);

      return {
        ...transform,
        x: desiredLeft - baseRect.left,
        y: desiredTop - baseRect.top,
      };
    },
    [],
  );

  const updateWorkspaceDropPreview = useCallback(
    ({ activeData, pointer }: { activeData: WorkspaceDragData; pointer: PointerCoordinates | null }) => {
      const listNode = workspaceListNodeRef.current;
      if (!pointer || !listNode) {
        setWorkspaceDropPreview(null);
        return;
      }

      const listRect = listNode.getBoundingClientRect();
      const isWithinList =
        pointer.x >= listRect.left &&
        pointer.x <= listRect.right &&
        pointer.y >= listRect.top &&
        pointer.y <= listRect.bottom;

      if (!isWithinList) {
        setWorkspaceDropPreview(null);
        return;
      }

      setWorkspaceDropPreview(
        getVerticalListDropPreview({
          activeId: activeData.workspaceId,
          ids: workspaceOrderIds,
          pointer,
          slots: measureVerticalDropSlots(listNode),
        }),
      );
    },
    [workspaceOrderIds],
  );

  const handleWorkspaceDragStart = useCallback(({ active, activatorEvent }: DragStartEvent) => {
    const data = active.data.current as WorkspaceDragData | undefined;
    if (!data || data.kind !== 'workspace') return;

    setActiveWorkspaceDrag(data);
    setWorkspaceDropPreview(null);

    const currentPointer = workspaceCurrentPointerRef.current;
    const pointerDownOrigin = workspacePointerDownOriginRef.current;
    workspaceDragPointerOriginRef.current =
      currentPointer && pointerDownOrigin?.workspaceId === data.workspaceId
        ? currentPointer
        : getPointerCoordinates(activatorEvent);
  }, []);

  const handleWorkspaceDragCancel = useCallback(() => {
    resetWorkspaceDragState();
  }, [resetWorkspaceDragState]);

  const handleWorkspacePointerDownCapture = useCallback(
    (data: WorkspaceDragData, event: ReactPointerEvent<HTMLLIElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      if (isWorkspaceDragOriginExempt(event.target)) return;

      const pointer = {
        x: event.clientX,
        y: event.clientY,
      };

      workspacePointerDownOriginRef.current = {
        workspaceId: data.workspaceId,
        pointer,
      };
      workspaceCurrentPointerRef.current = pointer;
      startWorkspacePointerTracking();
    },
    [startWorkspacePointerTracking],
  );

  const handleWorkspaceDragMove = useCallback(
    ({ active, delta }: DragMoveEvent) => {
      const activeData = active.data.current as WorkspaceDragData | undefined;
      if (!activeData || activeData.kind !== 'workspace') {
        setWorkspaceDropPreview(null);
        return;
      }

      const pointer =
        workspaceCurrentPointerRef.current ?? getDragPointerCoordinates(workspaceDragPointerOriginRef.current, delta);
      updateWorkspaceDropPreview({
        activeData,
        pointer,
      });
    },
    [updateWorkspaceDropPreview],
  );

  useEffect(() => {
    if (!activeWorkspaceDrag) return;

    const handleLayoutChange = () => {
      const pointer = workspaceCurrentPointerRef.current ?? workspaceDragPointerOriginRef.current;
      updateWorkspaceDropPreview({
        activeData: activeWorkspaceDrag,
        pointer,
      });
    };

    window.addEventListener('scroll', handleLayoutChange, { capture: true, passive: true });
    window.addEventListener('resize', handleLayoutChange, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleLayoutChange, true);
      window.removeEventListener('resize', handleLayoutChange);
    };
  }, [activeWorkspaceDrag, updateWorkspaceDropPreview]);

  const handleWorkspaceDragEnd = useCallback(
    async ({ active }: DragEndEvent) => {
      const activeData = active.data.current as WorkspaceDragData | undefined;
      const preview = workspaceDropPreview;
      const previousOrderIds = workspaceOrderIds;

      resetWorkspaceDragState();

      if (!activeData || activeData.kind !== 'workspace') return;
      if (!preview || !tree) return;

      const currentIndex = workspaceOrderIds.indexOf(activeData.workspaceId);
      const boundedTargetIndex = Math.max(0, Math.min(preview.targetIndex, workspaceOrderIds.length - 1));

      if (currentIndex < 0 || currentIndex === boundedTargetIndex) return;

      const nextOrderIds = moveIdToIndex(workspaceOrderIds, activeData.workspaceId, boundedTargetIndex);
      setWorkspaceOrderIds(nextOrderIds);
      setWorkspaceReorderBusy(true);
      suppressBookmarkRefreshRef.current = true;

      try {
        for (let index = 0; index < nextOrderIds.length; index += 1) {
          const workspaceId = nextOrderIds[index];
          if (!workspaceId) continue;

          await moveBookmarkNodeFromUserAction(workspaceId, {
            parentId: tree.id,
            index,
          });
        }

        await refresh();
        setToast('워크스페이스 순서를 변경했습니다.');
      } catch (error) {
        console.error(error);
        setWorkspaceOrderIds(previousOrderIds);
        await refresh();
        setToast('워크스페이스 순서를 변경하지 못했습니다.');
      } finally {
        suppressBookmarkRefreshRef.current = false;
        setWorkspaceReorderBusy(false);
      }
    },
    [
      refresh,
      resetWorkspaceDragState,
      setToast,
      suppressBookmarkRefreshRef,
      tree,
      workspaceDropPreview,
      workspaceOrderIds,
    ],
  );

  return {
    activeWorkspaceDragId: activeWorkspaceDrag?.workspaceId ?? null,
    handleWorkspaceDragCancel,
    handleWorkspaceDragEnd,
    handleWorkspaceDragMove,
    handleWorkspaceDragStart,
    handleWorkspacePointerDownCapture,
    sensors,
    workspaceDropPreview,
    workspaceOverlayModifier,
    workspaceListNodeRef,
    workspaceOrderIds,
    workspaceReorderBusy,
  };
};

export { useWorkspaceDnd };
