import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { Upload, FileText, Check, AlertTriangle, Tag } from 'lucide-react';
import { parse, type Transaction as ParsedTx } from '@/lib/tx-parser';
import { extractTextFromPDF } from '@/lib/tx-parser/pdf-extract';
import { clusterDescriptions, matchAgainstRules, signatureKey, type DescriptionCluster } from '@/lib/tx-parser/clusterer';
import { formatCurrency } from '@/lib/format';
import { confirmAction } from '@/components/shared/ConfirmDialog';
import { EntityPicker, type PickerSection } from '@/components/shared/EntityPicker';
import { PayeePicker } from '@/components/shared/PayeePicker';
import { CategoryPicker } from '@/components/shared/CategoryPicker';

type ImportState = 'idle' | 'processing' | 'preview' | 'importing' | 'categorize' | 'done';

function dayBefore(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export const ImportPage = observer(function ImportPage() {
  const { accountStore, transactionStore, payeeStore, categoryStore, importRuleStore, undoStore } = useStore();

  const [state, setState] = useState<ImportState>('idle');
  const [transactions, setTransactions] = useState<ParsedTx[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [accountId, setAccountId] = useState('');
  const [showAccountPicker, setShowAccountPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importCount, setImportCount] = useState(0);
  const [fileName, setFileName] = useState('');
  const [clusters, setClusters] = useState<DescriptionCluster[]>([]);
  const [clusterAssignments, setClusterAssignments] = useState<Map<string, { payeeId: string | null; categoryId: string | null }>>(new Map());
  const [editingCluster, setEditingCluster] = useState<{ key: string; field: 'payee' | 'category' } | null>(null);
  const [importedTxIds, setImportedTxIds] = useState<string[]>([]);
  const [prefilledKeys, setPrefilledKeys] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accountTriggerRef = useRef<HTMLDivElement>(null);

  const activeAccounts = accountStore.sortedAccounts;

  const accountSections: PickerSection[] = useMemo(() => [{
    key: 'accounts',
    label: 'Account',
    items: activeAccounts.map(a => ({ id: a.id, label: a.name })),
  }], [activeAccounts]);

  const selectedAccount = activeAccounts.find(a => a.id === accountId);

  const summary = useMemo(() => {
    const selectedTxns = transactions.filter((_, i) => selected.has(i));
    const income = selectedTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expense = selectedTxns.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
    return { count: selectedTxns.length, income, expense };
  }, [transactions, selected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // If navigating away mid-import, we just leave them (server has them)
    };
  }, []);

  async function handleFile(file: File) {
    setState('processing');
    setError(null);
    setFileName(file.name);

    try {
      let text: string;
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        text = await extractTextFromPDF(file);
      } else {
        text = await file.text();
      }

      const txns = parse(text, { contextYear: new Date().getFullYear() });
      if (txns.length === 0) {
        setError('No transactions detected in this file.');
        setState('idle');
        return;
      }

      setTransactions(txns);
      setSelected(new Set(txns.map((_, i) => i)));
      setState('preview');
    } catch (err: any) {
      setError(`Failed to parse file: ${err.message ?? 'unknown error'}`);
      setState('idle');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handlePaste(text: string) {
    if (!text.trim()) return;
    setState('processing');
    setError(null);
    setFileName('(pasted text)');

    try {
      const txns = parse(text, { contextYear: new Date().getFullYear() });
      if (txns.length === 0) {
        setError('No transactions detected in pasted text.');
        setState('idle');
        return;
      }
      setTransactions(txns);
      setSelected(new Set(txns.map((_, i) => i)));
      setState('preview');
    } catch (err: any) {
      setError(`Failed to parse: ${err.message ?? 'unknown error'}`);
      setState('idle');
    }
  }

  function toggleRow(idx: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(transactions.map((_, i) => i))); }
  function selectNone() { setSelected(new Set()); }

  async function confirmImport() {
    if (!accountId) { setError('Select an account first.'); return; }
    setState('importing');
    setError(null);

    const toImport = transactions.filter((_, i) => selected.has(i));
    let imported = 0;
    const txIds: string[] = [];
    const batchSize = 10;

    for (let i = 0; i < toImport.length; i += batchSize) {
      const batch = toImport.slice(i, i + batchSize);
      await Promise.all(batch.map(async (tx) => {
        const id = crypto.randomUUID();
        txIds.push(id);
        const txn = {
          id,
          account_id: accountId,
          payee_id: '',
          category_id: null,
          date: tx.date,
          amount: tx.amount,
          memo: tx.description,
          cleared: 0 as const,
          reconciled_at: null,
          linked_id: null,
          source: 'import',
          created_at: new Date().toISOString(),
        };
        transactionStore.createTransaction(txn);
        imported++;
      }));
    }

    setImportCount(imported);
    setImportedTxIds(txIds);

    const importedIds = [...txIds];
    undoStore.push(
      `Imported ${imported} transactions`,
      () => { /* redo not supported */ },
      () => { for (const id of importedIds) transactionStore.deleteTransaction(id); },
    );

    // Build clusters for categorize step
    const descriptions = toImport.map(t => t.description);
    const amounts = toImport.map(t => t.amount);
    const importClusters = clusterDescriptions(descriptions, amounts);

    // Pre-fill from saved rules
    const rules = Array.from(importRuleStore.rules.values()).map(r => ({
      tokens: r.tokens.split(' '),
      payeeId: r.payee_id,
      categoryId: r.category_id,
    }));

    const assignments = new Map<string, { payeeId: string | null; categoryId: string | null }>();
    const matched = new Set<string>();
    for (const cluster of importClusters) {
      const match = matchAgainstRules(cluster.sampleDescription, rules);
      if (match) {
        assignments.set(cluster.key, match);
        matched.add(cluster.key);
      }
    }

    setClusters(importClusters);
    setClusterAssignments(assignments);
    setPrefilledKeys(matched);

    if (importClusters.length > 0) {
      setState('categorize');
    } else {
      setState('done');
    }
  }

  function setClusterPayee(key: string, payeeId: string | null) {
    setClusterAssignments(prev => {
      const next = new Map(prev);
      const existing = next.get(key) ?? { payeeId: null, categoryId: null };
      next.set(key, { ...existing, payeeId });
      return next;
    });
    setEditingCluster(null);
  }

  function setClusterCategory(key: string, categoryId: string | null) {
    setClusterAssignments(prev => {
      const next = new Map(prev);
      const existing = next.get(key) ?? { payeeId: null, categoryId: null };
      next.set(key, { ...existing, categoryId });
      return next;
    });
    setEditingCluster(null);
  }

  async function applyCategorization() {
    const toImport = transactions.filter((_, i) => selected.has(i));
    const txIds = importedTxIds;
    const assignMap = clusterAssignments;

    for (const cluster of clusters) {
      const assignment = assignMap.get(cluster.key);
      if (!assignment || (!assignment.payeeId && !assignment.categoryId)) continue;

      for (const idx of cluster.indices) {
        const txId = txIds[idx];
        if (!txId) continue;

        const patch: Partial<{ payee_id: string; category_id: string }> = {};
        if (assignment.payeeId) patch.payee_id = assignment.payeeId;
        if (assignment.categoryId) patch.category_id = assignment.categoryId;

        transactionStore.updateTransaction(txId, patch);
      }
    }

    // Save new rules
    for (const cluster of clusters) {
      const assignment = assignMap.get(cluster.key);
      if (!assignment || (!assignment.payeeId && !assignment.categoryId)) continue;

      importRuleStore.createRule({
        id: crypto.randomUUID(),
        tokens: signatureKey(cluster.tokens),
        payee_id: assignment.payeeId,
        category_id: assignment.categoryId,
        created_at: new Date().toISOString(),
      });
    }

    setState('done');
  }

  function skipCategorize() { setState('done'); }

  async function cancelImport() {
    const ids = importedTxIds;
    if (ids.length === 0) return;

    const confirmed = await confirmAction({
      message: `Cancel import? This will delete ${ids.length} imported transaction${ids.length > 1 ? 's' : ''}.`,
      actionLabel: 'Cancel Import',
    });
    if (!confirmed) return;

    for (const id of ids) {
      transactionStore.deleteTransaction(id);
    }
    reset();
  }

  function reset() {
    setState('idle');
    setTransactions([]);
    setSelected(new Set());
    setError(null);
    setFileName('');
    setImportCount(0);
    setClusters([]);
    setClusterAssignments(new Map());
    setEditingCluster(null);
    setImportedTxIds([]);
    setPrefilledKeys(new Set());
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const payees = Array.from(payeeStore.payees.values()).filter(p => p.type !== 'account');
  const categories = Array.from(categoryStore.categories.values());
  const groups = Array.from(categoryStore.groups.values());

  return (
    <div className="import-view">
      <div className="import-view__topbar">
        <h1 className="import-view__title">Smart Import</h1>
      </div>

      <div className="import-view__content">
        {(state === 'idle' || state === 'processing') && (
          <>
            <div
              className={`import-dropzone ${state === 'processing' ? 'import-dropzone--processing' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".pdf,.csv,.txt" style={{ display: 'none' }} onChange={handleFileInput} />
              <div className="import-dropzone__icon">
                {state === 'processing' ? <FileText size={32} /> : <Upload size={32} />}
              </div>
              <p className="import-dropzone__title">
                {state === 'processing' ? 'Parsing...' : 'Drop bank statement here'}
              </p>
              <p className="import-dropzone__desc">PDF, CSV, or TXT file</p>
            </div>

            <div className="import-paste">
              <textarea
                className="import-paste__textarea"
                placeholder="Or paste statement text here..."
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handlePaste((e.target as HTMLTextAreaElement).value);
                  }
                }}
              />
              <p className="import-paste__hint">Ctrl+Enter to parse</p>
            </div>

            {error && (
              <div className="import-error">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}
          </>
        )}

        {state === 'preview' && (
          <div className="import-preview">
            <div className="import-preview__header">
              <span className="import-preview__file">{fileName}</span>
              <span className="import-preview__count">{summary.count} of {transactions.length} selected</span>
              <button className="btn btn--sm btn--ghost" onClick={selectAll}>All</button>
              <button className="btn btn--sm btn--ghost" onClick={selectNone}>None</button>
              <button className="btn btn--sm btn--ghost" onClick={reset}>Cancel</button>
            </div>

            <div className="import-preview__account">
              <label>Import to:</label>
              <div className="import-preview__account-picker" style={{ position: 'relative' }}>
                <div
                  ref={accountTriggerRef}
                  className="add-txn-dialog__input add-txn-dialog__input--select"
                  onClick={() => setShowAccountPicker(true)}
                >
                  {selectedAccount ? selectedAccount.name : 'Select account...'} ▾
                </div>
                {showAccountPicker && (
                  <EntityPicker
                    sections={accountSections}
                    value={accountId}
                    placeholder="Search account..."
                    onPick={(id) => { setAccountId(id ?? ''); setShowAccountPicker(false); }}
                    onCancel={() => setShowAccountPicker(false)}
                    triggerRef={accountTriggerRef}
                  />
                )}
              </div>
            </div>

            <div className="import-preview__table">
              <div className="import-preview__table-header">
                <div className="import-col--check" />
                <div className="import-col--date">Date</div>
                <div className="import-col--desc">Description</div>
                <div className="import-col--amount">Amount</div>
              </div>
              <div className="import-preview__table-body">
                {transactions.map((tx, i) => (
                  <div key={i} className={`import-row ${selected.has(i) ? '' : 'import-row--deselected'}`} onClick={() => toggleRow(i)}>
                    <div className="import-col--check">
                      <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} />
                    </div>
                    <div className="import-col--date">{tx.date}</div>
                    <div className="import-col--desc">{tx.description.slice(0, 60)}</div>
                    <div className={`import-col--amount ${tx.amount >= 0 ? 'money--positive' : 'money--negative'}`}>
                      {tx.amount < 0 ? '-' : ''}{formatCurrency(Math.abs(tx.amount)).replace(/^-/, '')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="import-preview__footer">
              {error && (
                <div className="import-error">
                  <AlertTriangle size={14} />
                  <span>{error}</span>
                </div>
              )}
              <div className="import-preview__summary">
                <span>Income: +{formatCurrency(summary.income)}</span>
                <span>Expense: {formatCurrency(summary.expense)}</span>
              </div>
              <button
                className="btn btn--primary"
                disabled={!accountId || summary.count === 0}
                onClick={confirmImport}
              >
                Import {summary.count} transactions
              </button>
            </div>
          </div>
        )}

        {state === 'importing' && (
          <div className="import-progress">
            <FileText size={32} />
            <p>Importing transactions...</p>
          </div>
        )}

        {state === 'categorize' && (
          <div className="import-categorize">
            <div className="import-categorize__header">
              <div className="import-categorize__title">
                <Tag size={16} />
                <span>Categorize {importCount} transactions</span>
              </div>
              <p className="import-categorize__desc">Assign payee and category per group. These rules auto-apply on future imports.</p>
            </div>

            <div className="import-categorize__list">
              {clusters.map((cluster) => {
                const assignment = clusterAssignments.get(cluster.key);
                const isEditingPayee = editingCluster?.key === cluster.key && editingCluster?.field === 'payee';
                const isEditingCategory = editingCluster?.key === cluster.key && editingCluster?.field === 'category';

                const pid = assignment?.payeeId;
                const payee = pid ? payees.find(p => p.id === pid) : null;
                const payeeLabel = payee ? payee.name : null;
                const isPayeeAuto = pid && prefilledKeys.has(cluster.key);

                const cid = assignment?.categoryId;
                const cat = cid ? categories.find(c => c.id === cid) : null;
                const catLabel = cat ? cat.name : null;
                const isCatAuto = cid && prefilledKeys.has(cluster.key);

                return (
                  <div key={cluster.key} className="import-cluster">
                    <div className="import-cluster__info">
                      <div className="import-cluster__sample">{cluster.sampleDescription.slice(0, 80)}</div>
                      <div className="import-cluster__meta">
                        <span className="import-cluster__count">{cluster.indices.length} txn{cluster.indices.length > 1 ? 's' : ''}</span>
                        <span className="import-cluster__range">
                          {cluster.amountMin < 0 ? '-' : ''}{formatCurrency(Math.abs(cluster.amountMin)).replace(/^-/, '')}
                          {cluster.amountMin !== cluster.amountMax ? ` – ${cluster.amountMax < 0 ? '-' : ''}${formatCurrency(Math.abs(cluster.amountMax)).replace(/^-/, '')}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="import-cluster__assignments">
                      <div className="import-cluster__field" style={{ position: 'relative' }}>
                        <div
                          className={`import-cluster__pill ${payeeLabel ? (isPayeeAuto ? 'import-cluster__pill--auto' : 'import-cluster__pill--set') : ''}`}
                          onClick={() => setEditingCluster({ key: cluster.key, field: 'payee' })}
                        >
                          {payeeLabel ? (isPayeeAuto ? `⚡ ${payeeLabel}` : payeeLabel) : 'Set payee...'}
                        </div>
                        {isEditingPayee && (
                          <PayeePicker
                            value={assignment?.payeeId ?? null}
                            onPick={(id) => setClusterPayee(cluster.key, id)}
                            onCancel={() => setEditingCluster(null)}
                            onTab={() => setEditingCluster({ key: cluster.key, field: 'category' })}
                          />
                        )}
                      </div>
                      <div className="import-cluster__field" style={{ position: 'relative' }}>
                        <div
                          className={`import-cluster__pill ${catLabel ? (isCatAuto ? 'import-cluster__pill--auto' : 'import-cluster__pill--set') : ''}`}
                          onClick={() => setEditingCluster({ key: cluster.key, field: 'category' })}
                        >
                          {catLabel ? (isCatAuto ? `⚡ ${catLabel}` : catLabel) : 'Set category...'}
                        </div>
                        {isEditingCategory && (
                          <CategoryPicker
                            value={assignment?.categoryId ?? null}
                            onPick={(id) => setClusterCategory(cluster.key, id)}
                            onCancel={() => setEditingCluster(null)}
                            onTab={() => setEditingCluster(null)}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="import-categorize__footer">
              <button className="btn btn--sm btn--ghost btn--danger" onClick={cancelImport}>Cancel Import</button>
              <button className="btn btn--sm btn--ghost" onClick={skipCategorize}>Skip</button>
              <button className="btn btn--primary" onClick={applyCategorization}>Apply & Save Rules</button>
            </div>
          </div>
        )}

        {state === 'done' && (
          <div className="import-done">
            <div className="import-done__icon"><Check size={32} /></div>
            <p className="import-done__title">Import complete</p>
            <p className="import-done__desc">{importCount} transactions imported.</p>
            <button className="btn btn--primary" onClick={reset}>Import more</button>
            <button className="btn btn--sm btn--ghost btn--danger" onClick={cancelImport}>Cancel Import</button>
          </div>
        )}
      </div>
    </div>
  );
});
