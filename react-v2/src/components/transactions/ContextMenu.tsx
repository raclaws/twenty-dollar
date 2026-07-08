import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import type { Transaction } from '@/types';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: ContextMenuPosition;
  transaction: Transaction;
  selectedIds: Set<string>;
  onClose: () => void;
  onEdit: (tx: Transaction) => void;
  onBulkDelete: () => void;
  onBulkClear: (cleared: boolean) => void;
  onDeselectAll: () => void;
}

export const ContextMenu = observer(function ContextMenu({
  position,
  transaction,
  selectedIds,
  onClose,
  onEdit,
  onBulkDelete,
  onBulkClear,
  onDeselectAll,
}: ContextMenuProps) {
  const { transactionStore, undoStore, payeeStore } = useStore();
  const menuRef = useRef<HTMLDivElement>(null);
  const isBulk = selectedIds.size > 1;

  // Viewport clamping
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = position;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    if (x < 0) x = 8;
    if (y < 0) y = 8;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [position]);

  // Close on click outside or Escape
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

  const handleToggleCleared = () => {
    const newCleared = transaction.cleared === 1 ? 0 : 1;
    const oldCleared = transaction.cleared;
    const id = transaction.id;
    transactionStore.updateTransaction(id, { cleared: newCleared as 0 | 1 });
    undoStore.push(
      `Toggle cleared: ${payeeStore.getById(transaction.payee_id)?.name ?? 'transaction'}`,
      () => transactionStore.updateTransaction(id, { cleared: newCleared as 0 | 1 }),
      () => transactionStore.updateTransaction(id, { cleared: oldCleared }),
    );
    onClose();
  };

  const handleDuplicate = () => {
    const dup: Transaction = {
      ...transaction,
      id: crypto.randomUUID(),
      cleared: 0,
      reconciled_at: null,
      linked_id: null,
      created_at: new Date().toISOString(),
    };
    transactionStore.createTransaction(dup);
    undoStore.push(
      `Duplicated transaction`,
      () => transactionStore.createTransaction(dup),
      () => transactionStore.deleteTransaction(dup.id),
    );
    onClose();
  };

  const handleDelete = () => {
    const id = transaction.id;
    const payeeName = payeeStore.getById(transaction.payee_id)?.name ?? 'transaction';
    if (!window.confirm(`Delete "${payeeName}"?`)) return;

    const oldRecord = { ...transaction };
    const linkedId = transaction.linked_id;
    let linkedRecord: Transaction | undefined;
    if (linkedId) {
      linkedRecord = transactionStore.getById(linkedId);
    }

    if (linkedRecord) transactionStore.deleteTransaction(linkedId!);
    transactionStore.deleteTransaction(id);

    undoStore.push(
      `Deleted transaction: ${payeeName}`,
      () => {
        if (linkedRecord) transactionStore.deleteTransaction(linkedId!);
        transactionStore.deleteTransaction(id);
      },
      () => {
        transactionStore.createTransaction(oldRecord);
        if (linkedRecord) transactionStore.createTransaction(linkedRecord);
      },
    );
    onClose();
  };

  const handleEdit = () => {
    onEdit(transaction);
    onClose();
  };

  const menu = (
    <div
      ref={menuRef}
      className="fixed bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px] z-50"
      style={{ left: position.x, top: position.y }}
      role="menu"
    >
      {isBulk ? (
        <>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            onClick={() => { onBulkClear(true); onClose(); }}
            role="menuitem"
          >
            Mark {selectedIds.size} cleared
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            onClick={() => { onBulkClear(false); onClose(); }}
            role="menuitem"
          >
            Mark {selectedIds.size} uncleared
          </button>
          <div className="border-t border-zinc-800 my-1" role="separator" />
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 cursor-pointer"
            onClick={() => { onBulkDelete(); onClose(); }}
            role="menuitem"
          >
            Delete {selectedIds.size} transactions
          </button>
          <div className="border-t border-zinc-800 my-1" role="separator" />
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            onClick={() => { onDeselectAll(); onClose(); }}
            role="menuitem"
          >
            Deselect all
          </button>
        </>
      ) : (
        <>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            onClick={handleEdit}
            role="menuitem"
          >
            Edit
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            onClick={handleToggleCleared}
            role="menuitem"
          >
            {transaction.cleared === 1 ? 'Mark uncleared' : 'Mark cleared'}
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            onClick={handleDuplicate}
            role="menuitem"
          >
            Duplicate
          </button>
          <div className="border-t border-zinc-800 my-1" role="separator" />
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 cursor-pointer"
            onClick={handleDelete}
            role="menuitem"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );

  return createPortal(menu, document.body);
});
