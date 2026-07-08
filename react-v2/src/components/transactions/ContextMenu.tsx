import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: ContextMenuPosition;
  transactionId: string;
  selectedCount: number;
  onClose: () => void;
}

export const ContextMenu = observer(function ContextMenu({
  position,
  transactionId,
  selectedCount,
  onClose,
}: ContextMenuProps) {
  const { transactionStore } = useStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const transaction = transactionStore.getById(transactionId);
  const isBulk = selectedCount > 1;

  // Viewport clamping
  const clampedPosition = useRef(position);
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = position;
    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 8;
    }
    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 8;
    }
    if (x < 0) x = 8;
    if (y < 0) y = 8;
    clampedPosition.current = { x, y };
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [position]);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleMarkCleared = useCallback(() => {
    if (isBulk) {
      const ids = Array.from(transactionStore.selectedIds);
      transactionStore.bulkAction('clear', ids);
      transactionStore.clearSelection();
    } else {
      transactionStore.updateTransaction(transactionId, { cleared: 1 });
    }
    onClose();
  }, [isBulk, transactionId, transactionStore, onClose]);

  const handleMarkUncleared = useCallback(() => {
    if (isBulk) {
      const ids = Array.from(transactionStore.selectedIds);
      transactionStore.bulkAction('unclear', ids);
      transactionStore.clearSelection();
    } else {
      transactionStore.updateTransaction(transactionId, { cleared: 0 });
    }
    onClose();
  }, [isBulk, transactionId, transactionStore, onClose]);

  const handleDuplicate = useCallback(() => {
    if (!transaction) return;
    const dup = {
      ...transaction,
      id: crypto.randomUUID(),
      cleared: 0 as const,
      reconciled_at: null,
      created_at: new Date().toISOString(),
    };
    transactionStore.createTransaction(dup);
    onClose();
  }, [transaction, transactionStore, onClose]);

  const handleDelete = useCallback(() => {
    if (isBulk) {
      const ids = Array.from(transactionStore.selectedIds);
      transactionStore.bulkAction('delete', ids);
      transactionStore.clearSelection();
    } else {
      transactionStore.deleteTransaction(transactionId);
    }
    onClose();
  }, [isBulk, transactionId, transactionStore, onClose]);

  const isCleared = transaction?.cleared === 1;

  const menu = (
    <div
      ref={menuRef}
      className="fixed bg-zinc-900 border border-zinc-700 rounded shadow-lg py-1 min-w-[180px] z-50"
      style={{ left: position.x, top: position.y }}
      role="menu"
    >
      {/* Mark cleared / uncleared */}
      {isBulk ? (
        <>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            onClick={handleMarkCleared}
            role="menuitem"
          >
            Mark {selectedCount} cleared
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            onClick={handleMarkUncleared}
            role="menuitem"
          >
            Mark {selectedCount} uncleared
          </button>
        </>
      ) : (
        <button
          className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
          onClick={isCleared ? handleMarkUncleared : handleMarkCleared}
          role="menuitem"
        >
          {isCleared ? 'Mark uncleared' : 'Mark cleared'}
        </button>
      )}

      {/* Duplicate (single mode only) */}
      {!isBulk && (
        <button
          className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
          onClick={handleDuplicate}
          role="menuitem"
        >
          Duplicate
        </button>
      )}

      {/* Separator */}
      <div className="border-t border-zinc-800 my-1" role="separator" />

      {/* Delete */}
      <button
        className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 cursor-pointer"
        onClick={handleDelete}
        role="menuitem"
      >
        {isBulk ? `Delete ${selectedCount} transactions` : 'Delete'}
      </button>
    </div>
  );

  return createPortal(menu, document.body);
});
