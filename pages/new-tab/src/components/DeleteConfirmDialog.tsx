import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { DeleteTarget } from '@src/lib/new-tab/types';

type DeleteConfirmDialogProps = {
  deleteBusy: boolean;
  deleteTarget: DeleteTarget | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

const DeleteConfirmDialog = ({ deleteBusy, deleteTarget, onConfirm, onOpenChange }: DeleteConfirmDialogProps) => (
  <AlertDialog.Root open={!!deleteTarget} onOpenChange={onOpenChange}>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="confirm-overlay" />
      <AlertDialog.Content className="confirm-dialog">
        <AlertDialog.Title className="confirm-title">
          {deleteTarget?.kind === 'bookmark'
            ? '북마크를 삭제하시겠어요?'
            : deleteTarget?.kind === 'workspace'
              ? '워크스페이스를 삭제하시겠어요?'
              : '컬렉션을 삭제하시겠어요?'}
        </AlertDialog.Title>
        <AlertDialog.Description className="confirm-desc">
          {deleteTarget?.kind === 'bookmark'
            ? `${deleteTarget.title} 북마크를 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
            : deleteTarget?.kind === 'workspace'
              ? `${deleteTarget.title} 워크스페이스와 포함된 컬렉션, 북마크를 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
              : deleteTarget?.title
                ? `${deleteTarget.title} 컬렉션과 포함된 북마크를 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
                : '선택한 컬렉션과 포함된 북마크를 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.'}
        </AlertDialog.Description>
        <div className="confirm-actions">
          <AlertDialog.Cancel asChild>
            <button className="confirm-btn">취소</button>
          </AlertDialog.Cancel>
          <AlertDialog.Action asChild>
            <button className="confirm-btn destructive" onClick={onConfirm} disabled={deleteBusy}>
              삭제
            </button>
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
);

export { DeleteConfirmDialog };
