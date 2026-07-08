import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { confirmDialogStore } from './confirm-dialog-store';

export const ConfirmDialog = observer(function ConfirmDialog() {
  const { open, message, actionLabel, danger } = confirmDialogStore.state;

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        confirmDialogStore.dismiss();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        confirmDialogStore.confirm();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={() => confirmDialogStore.dismiss()}>
      <div className="dialog dialog--confirm" onClick={(e) => e.stopPropagation()}>
        <p className="dialog__text">{message}</p>
        <div className="dialog__actions">
          <button className="btn btn--secondary" onClick={() => confirmDialogStore.dismiss()}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => confirmDialogStore.confirm()}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
});

export { confirmAction } from './confirm-dialog-store';
