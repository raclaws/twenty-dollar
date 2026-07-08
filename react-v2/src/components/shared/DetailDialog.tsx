import { useState, useEffect, useRef, type ReactNode } from 'react';

interface DetailDialogProps {
  open: boolean;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose: () => void;
  onRename?: (newName: string) => void;
  children?: ReactNode;
}

export function DetailDialog({ open, title, subtitle, icon, onClose, onRename, children }: DetailDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => dialogRef.current?.focus());
    }
  }, [open]);

  function handleKeydown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      if (editingTitle) {
        setEditingTitle(false);
        e.stopPropagation();
        return;
      }
      const picker = dialogRef.current?.querySelector('.entity-picker');
      if (picker) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && active.tagName === 'INPUT' && active.closest('.detail-dialog')) {
        active.blur();
        e.stopPropagation();
        return;
      }
      onClose();
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('add-txn-overlay')) {
      onClose();
    }
  }

  function startRename() {
    if (!onRename) return;
    setTitleDraft(title);
    setEditingTitle(true);
  }

  function commitRename() {
    const name = titleDraft.trim();
    if (name && name !== title) {
      onRename?.(name);
    }
    setEditingTitle(false);
  }

  if (!open) return null;

  return (
    <div className="add-txn-overlay detail-dialog-overlay" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="detail-dialog"
        tabIndex={-1}
        onKeyDown={handleKeydown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-dialog__header">
          <div className="detail-dialog__title">
            {icon}
            {editingTitle ? (
              <input
                className="detail-dialog__title-input"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); }}
                onBlur={commitRename}
                autoFocus
              />
            ) : (
              <span
                className={onRename ? 'detail-dialog__title-text--editable' : ''}
                onClick={startRename}
              >
                {title}
              </span>
            )}
            {subtitle && !editingTitle && (
              <span className="detail-dialog__subtitle">{subtitle}</span>
            )}
          </div>
          <button className="detail-dialog__close" onClick={onClose}>Esc</button>
        </div>
        <div className="detail-dialog__body">
          {children}
        </div>
      </div>
    </div>
  );
}
