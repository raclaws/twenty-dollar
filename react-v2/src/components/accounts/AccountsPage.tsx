import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { useNavigate } from '@tanstack/react-router';
import { Plus, CreditCard } from 'lucide-react';
import './accounts.css';
import { ACCOUNT_TYPE_ICONS } from '@/lib/icons';
import { formatCurrency } from '@/lib/format';
import { clampMenuPosition } from '@/lib/ui';
import { useUndoKeyboard } from '@/lib/undo';
import { confirmAction } from '@/components/shared/ConfirmDialog';
import { EntityPicker, type PickerSection } from '@/components/shared/EntityPicker';
import type { Account } from '@/types';

const ACCOUNT_TYPES = [
  { id: 'checking', label: 'Checking' },
  { id: 'savings', label: 'Savings' },
  { id: 'cash', label: 'Cash' },
  { id: 'credit', label: 'Credit' },
];

const typeSections: PickerSection[] = [
  { key: 'types', label: 'Account Type', items: ACCOUNT_TYPES },
];

function typeLabel(type: string): string {
  return ACCOUNT_TYPES.find(t => t.id === type)?.label ?? type;
}

type CellField = 'name' | 'type';

export const AccountsPage = observer(function AccountsPage() {
  const { accountStore, transactionStore, payeeStore, undoStore } = useStore();
  const navigate = useNavigate();
  useUndoKeyboard();

  const accounts = accountStore.sortedAccounts;
  const allTransactions = Array.from(transactionStore.transactions.values());

  // Add dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [addMore, setAddMore] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('checking');
  const [newBalance, setNewBalance] = useState('');
  const [showNewTypePicker, setShowNewTypePicker] = useState(false);
  const [nameError, setNameError] = useState('');
  const typeTriggerRef = useRef<HTMLDivElement>(null);

  // Reconcile dialog state
  const [reconcileAccount, setReconcileAccount] = useState<Account | null>(null);
  const [reconcileInput, setReconcileInput] = useState('');

  // Per-cell edit state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<CellField | null>(null);
  const cellTriggerRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; account: Account } | null>(null);

  const accountStats = useMemo(() => {
    const stats = new Map<string, { balance: number; txCount: number }>();
    for (const acc of accounts) {
      stats.set(acc.id, { balance: 0, txCount: 0 });
    }
    for (const tx of allTransactions) {
      const s = stats.get(tx.account_id);
      if (s) {
        s.balance += tx.amount;
        s.txCount += 1;
      }
    }
    return stats;
  }, [accounts, allTransactions]);

  // --- Dialog ---
  function openDialog() { setIsDialogOpen(true); }
  function closeDialog() { setIsDialogOpen(false); resetForm(); }
  function resetForm() { setNewName(''); setNewType('checking'); setNewBalance(''); setNameError(''); setShowNewTypePicker(false); }
  function resetForAddMore() { setNewName(''); setNewBalance(''); setNameError(''); setShowNewTypePicker(false); }

  function handleAddAccount() {
    const name = newName.trim();
    if (!name) { setNameError('Account name is required'); return; }
    const duplicate = accounts.find(a => a.name.toLowerCase() === name.toLowerCase());
    if (duplicate) { setNameError(`Account "${name}" already exists`); return; }
    setNameError('');

    const id = crypto.randomUUID();
    const payeeId = crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const account: Account = { id, name, type: newType as Account['type'], sort_order: accounts.length, created_at: now, deleted_at: null };

    accountStore.createAccount(account);
    payeeStore.createPayee({ id: payeeId, name, type: 'account', account_id: id, created_at: now });

    // Starting balance transaction
    const balanceRaw = newBalance.trim();
    const balanceAmount = balanceRaw ? Math.round(parseFloat(balanceRaw.replace(/,/g, '')) * 100) : 0;

    const txId = crypto.randomUUID();
    transactionStore.createTransaction({
      id: txId, account_id: id, date: today, amount: isNaN(balanceAmount) ? 0 : balanceAmount,
      payee_id: '', category_id: null, memo: 'Starting Balance',
      cleared: 1, reconciled_at: null, linked_id: null, source: 'system', created_at: now,
    });

    undoStore.push(
      `Created account "${name}"`,
      () => { /* redo: re-create */ },
      () => {
        accountStore.deleteAccount(id);
        transactionStore.deleteTransaction(txId);
      },
    );

    if (addMore) { resetForAddMore(); } else { closeDialog(); }
  }

  // --- Cell editing ---
  function startCell(accountId: string, field: CellField, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setEditingRowId(accountId);
    setActiveCell(field);
  }

  function endCell() { setEditingRowId(null); setActiveCell(null); }

  function commitName(account: Account, newNameVal: string) {
    const name = newNameVal.trim();
    if (!name || name === account.name) { endCell(); return; }
    const oldName = account.name;
    accountStore.updateAccount(account.id, { name });
    undoStore.push(
      `Renamed account "${oldName}" → "${name}"`,
      () => accountStore.updateAccount(account.id, { name }),
      () => accountStore.updateAccount(account.id, { name: oldName }),
    );
    endCell();
  }

  function commitType(account: Account, newTypeVal: string) {
    if (newTypeVal === account.type) { endCell(); return; }
    const oldType = account.type;
    accountStore.updateAccount(account.id, { type: newTypeVal as Account['type'] });
    undoStore.push(
      `Changed account "${account.name}" type to "${newTypeVal}"`,
      () => accountStore.updateAccount(account.id, { type: newTypeVal as Account['type'] }),
      () => accountStore.updateAccount(account.id, { type: oldType }),
    );
    endCell();
  }

  // --- Delete ---
  async function deleteAccount(id: string, name: string) {
    const txns = transactionStore.transactionsForAccount(id);
    if (txns.length > 0) {
      await confirmAction({
        message: `Cannot delete "${name}" — it has ${txns.length} transaction${txns.length > 1 ? 's' : ''}. Move or delete them first.`,
        actionLabel: 'OK',
        danger: false,
      });
      return;
    }
    const confirmed = await confirmAction({ message: `Delete "${name}"?`, actionLabel: 'Delete Account' });
    if (!confirmed) return;

    accountStore.deleteAccount(id);
    undoStore.push(
      `Deleted account "${name}"`,
      () => accountStore.deleteAccount(id),
      () => { /* Can't reliably undo a delete without full record */ },
    );
  }

  // --- Reconcile ---
  function openReconcile(account: Account) { setReconcileAccount(account); setReconcileInput(''); }
  function closeReconcile() { setReconcileAccount(null); setReconcileInput(''); }

  function handleReconcile() {
    if (!reconcileAccount) return;
    const inputVal = reconcileInput.trim();
    if (!inputVal) return;

    const realBalance = Math.round(parseFloat(inputVal.replace(/,/g, '')) * 100);
    if (isNaN(realBalance)) return;

    const accId = reconcileAccount.id;
    const stats = accountStats.get(accId);
    const currentBalance = stats?.balance ?? 0;
    const diff = realBalance - currentBalance;

    if (diff === 0) { closeReconcile(); return; }

    const txId = crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    transactionStore.createTransaction({
      id: txId, account_id: accId, date: today, amount: diff,
      payee_id: '', category_id: null, memo: 'Reconciliation',
      cleared: 1, reconciled_at: null, linked_id: null, source: 'system', created_at: now,
    });

    undoStore.push(
      `Reconcile "${reconcileAccount.name}" (adjustment: ${(diff / 100).toFixed(2)})`,
      () => { /* redo */ },
      () => transactionStore.deleteTransaction(txId),
    );

    closeReconcile();
  }

  // --- Navigation ---
  function handleRowClick(account: Account) {
    if (editingRowId === account.id) return;
    void navigate({ to: '/transactions', search: { account: account.id } });
  }

  // --- Context menu ---
  function handleContextMenu(e: React.MouseEvent, account: Account) {
    e.preventDefault();
    const pos = clampMenuPosition(e.clientX, e.clientY);
    setCtxMenu({ x: pos.x, y: pos.y, account });
  }

  useEffect(() => {
    const handler = () => setCtxMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // --- Global keyboard ---
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
        e.preventDefault();
        if (!isDialogOpen) openDialog();
      }
      if (e.key === 'Escape' && isDialogOpen && !showNewTypePicker) {
        closeDialog();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isDialogOpen, showNewTypePicker]);

  return (
    <div className="accounts-view">
      <div className="accounts-view__topbar">
        <h1 className="accounts-view__title">Accounts</h1>
      </div>

      {accounts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon"><CreditCard size={32} /></div>
          <p className="empty-state__title">No accounts yet</p>
          <p className="empty-state__desc">Create your first account to start tracking transactions.</p>
          <div className="empty-state__actions">
            <button className="btn btn--primary" onClick={openDialog}>Create First Account</button>
          </div>
        </div>
      ) : (
        <div className="accounts-table">
          <div className="add-txn-trigger" onClick={openDialog}>
            <span className="add-txn-trigger__icon"><Plus size={16} /></span>
            <span className="add-txn-trigger__label">Add account...</span>
            <span className="add-txn-trigger__shortcut">⌘⇧N</span>
          </div>

          <div className="accounts-table__header">
            <div className="accounts-table__col accounts-table__col--name">NAME</div>
            <div className="accounts-table__col accounts-table__col--type">TYPE</div>
            <div className="accounts-table__col accounts-table__col--balance">BALANCE</div>
            <div className="accounts-table__col accounts-table__col--count">TRANSACTIONS</div>
          </div>

          <div className="accounts-table__body">
            {accounts.map((account) => {
              const stats = accountStats.get(account.id) ?? { balance: 0, txCount: 0 };
              const isEditing = editingRowId === account.id;
              const Icon = ACCOUNT_TYPE_ICONS[account.type] ?? CreditCard;
              return (
                <div
                  key={account.id}
                  className="accounts-table__row"
                  onClick={() => handleRowClick(account)}
                  onContextMenu={(e) => handleContextMenu(e, account)}
                >
                  <div className="accounts-table__col accounts-table__col--name cell--text" onClick={(e) => startCell(account.id, 'name', e)}>
                    {isEditing && activeCell === 'name' ? (
                      <input
                        className="txn-cell-input"
                        type="text"
                        defaultValue={account.name}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitName(account, (e.target as HTMLInputElement).value); if (e.key === 'Escape') endCell(); }}
                        onBlur={(e) => commitName(account, e.currentTarget.value)}
                        autoFocus
                      />
                    ) : (
                      <span className="accounts-table__name-content">
                        <span className="accounts-table__type-icon"><Icon size={14} /></span>
                        {account.name}
                      </span>
                    )}
                  </div>

                  <div ref={isEditing && activeCell === 'type' ? cellTriggerRef : null} className="accounts-table__col accounts-table__col--type cell--select" onClick={(e) => startCell(account.id, 'type', e)}>
                    {isEditing && activeCell === 'type' ? (
                      <EntityPicker
                        sections={typeSections}
                        value={account.type}
                        placeholder="Select type..."
                        onPick={(id) => commitType(account, id ?? 'checking')}
                        onCancel={endCell}
                        triggerRef={cellTriggerRef}
                      />
                    ) : (
                      <span>{typeLabel(account.type)}</span>
                    )}
                  </div>

                  <div className="accounts-table__col accounts-table__col--balance cell--computed">
                    <span className={stats.balance >= 0 ? 'money--positive' : 'money--negative'}>
                      {formatCurrency(stats.balance)}
                    </span>
                  </div>

                  <div className="accounts-table__col accounts-table__col--count cell--computed">{stats.txCount}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div className="ctx-menu" style={{ position: 'fixed', left: `${ctxMenu.x}px`, top: `${ctxMenu.y}px` }}>
          <div className="ctx-menu__item" onClick={() => { startCell(ctxMenu.account.id, 'name'); setCtxMenu(null); }}>Edit</div>
          <div className="ctx-menu__item" onClick={() => { openReconcile(ctxMenu.account); setCtxMenu(null); }}>Reconcile</div>
          <div className="ctx-menu__sep" />
          <div className="ctx-menu__item ctx-menu__item--danger" onClick={() => { deleteAccount(ctxMenu.account.id, ctxMenu.account.name); setCtxMenu(null); }}>Delete</div>
        </div>
      )}

      {/* Add Account Dialog */}
      {isDialogOpen && (
        <div className="add-txn-overlay" onClick={closeDialog}>
          <div className="add-txn-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape' && !showNewTypePicker) closeDialog(); }}>
            <div className="add-txn-dialog__header">
              <div className="add-txn-dialog__title">
                <span className="add-txn-dialog__icon"><Plus size={16} /></span>
                <span>New Account</span>
              </div>
              <button className="add-txn-dialog__close" onClick={closeDialog}>Esc</button>
            </div>
            <div className="add-txn-dialog__body">
              <div className="add-txn-dialog__field">
                <label className="add-txn-dialog__label">Name</label>
                <div className="add-txn-dialog__input-wrap">
                  <input
                    className={`add-txn-dialog__input ${nameError ? 'input--error' : ''}`}
                    type="text"
                    placeholder="Account name..."
                    value={newName}
                    onChange={(e) => { setNewName(e.target.value); setNameError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAddAccount(); } }}
                    autoFocus
                  />
                  {nameError && <span className="field-error">{nameError}</span>}
                </div>
              </div>
              <div className="add-txn-dialog__field">
                <label className="add-txn-dialog__label">Type</label>
                <div className="add-txn-dialog__input-wrap" style={{ position: 'relative' }}>
                  <div ref={typeTriggerRef} className="add-txn-dialog__input add-txn-dialog__input--select" onClick={() => setShowNewTypePicker(true)}>
                    {typeLabel(newType)} ▾
                  </div>
                  {showNewTypePicker && (
                    <EntityPicker
                      sections={typeSections}
                      value={newType}
                      placeholder="Select type..."
                      onPick={(id) => { setNewType(id ?? 'checking'); setShowNewTypePicker(false); }}
                      onCancel={() => setShowNewTypePicker(false)}
                      triggerRef={typeTriggerRef}
                    />
                  )}
                </div>
              </div>
              <div className="add-txn-dialog__field">
                <label className="add-txn-dialog__label">Starting Balance</label>
                <div className="add-txn-dialog__input-wrap">
                  <input
                    className="add-txn-dialog__input"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAddAccount(); } }}
                  />
                </div>
              </div>
            </div>
            <div className="add-txn-dialog__footer">
              <div className="add-txn-dialog__footer-left">
                <label className="add-txn-dialog__add-more">
                  <input type="checkbox" checked={addMore} onChange={(e) => setAddMore(e.target.checked)} />
                  <span>Add more</span>
                </label>
              </div>
              <div className="add-txn-dialog__footer-right">
                <button className="btn btn--sm btn--primary" onClick={handleAddAccount}>Add ⌘Enter</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reconcile Dialog */}
      {reconcileAccount && (() => {
        const stats = accountStats.get(reconcileAccount.id) ?? { balance: 0, txCount: 0 };
        const realBal = reconcileInput.trim() ? Math.round(parseFloat(reconcileInput.replace(/,/g, '')) * 100) : NaN;
        const diff = isNaN(realBal) ? 0 : realBal - stats.balance;
        return (
          <div className="add-txn-overlay" onClick={closeReconcile}>
            <div className="add-txn-dialog" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') closeReconcile(); }}>
              <div className="add-txn-dialog__header">
                <div className="add-txn-dialog__title">
                  <span>Reconcile &ldquo;{reconcileAccount.name}&rdquo;</span>
                </div>
                <button className="add-txn-dialog__close" onClick={closeReconcile}>Esc</button>
              </div>
              <div className="add-txn-dialog__body">
                <div className="add-txn-dialog__field">
                  <label className="add-txn-dialog__label">Current balance in app</label>
                  <div className="add-txn-dialog__input-wrap">
                    <span className={`reconcile-balance ${stats.balance >= 0 ? 'money--positive' : 'money--negative'}`}>
                      {formatCurrency(stats.balance)}
                    </span>
                  </div>
                </div>
                <div className="add-txn-dialog__field">
                  <label className="add-txn-dialog__label">Actual bank balance</label>
                  <div className="add-txn-dialog__input-wrap">
                    <input
                      className="add-txn-dialog__input"
                      type="text"
                      inputMode="decimal"
                      placeholder="Enter real balance..."
                      value={reconcileInput}
                      onChange={(e) => setReconcileInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleReconcile(); } }}
                      autoFocus
                    />
                  </div>
                </div>
                {reconcileInput.trim() && (
                  <div className="add-txn-dialog__field">
                    <label className="add-txn-dialog__label">Adjustment</label>
                    <div className="add-txn-dialog__input-wrap">
                      <span className={diff >= 0 ? 'money--positive' : 'money--negative'}>
                        {diff >= 0 ? '+' : ''}{formatCurrency(diff)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="add-txn-dialog__footer">
                <div className="add-txn-dialog__footer-left" />
                <div className="add-txn-dialog__footer-right">
                  <button className="btn btn--sm btn--ghost" onClick={closeReconcile}>Cancel</button>
                  <button className="btn btn--sm btn--primary" onClick={handleReconcile}>Reconcile</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
});
