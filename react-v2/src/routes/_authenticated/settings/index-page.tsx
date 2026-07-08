import { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { toast } from 'sonner';
import { confirmAction } from '@/components/shared/ConfirmDialog';

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
];

export const SettingsIndexPage = observer(function SettingsIndexPage() {
  const {
    accountStore,
    payeeStore,
    categoryStore,
    transactionStore,
    budgetStore,
    scheduleStore,
    importRuleStore,
  } = useStore();

  const [currency, setCurrency] = useState(() => {
    return localStorage.getItem('twenty_currency') || 'USD';
  });
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load preferences from backend on mount
  useEffect(() => {
    fetch('/api/preferences', { credentials: 'include' })
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data) => {
        if (data && data.currency) {
          setCurrency(data.currency);
          localStorage.setItem('twenty_currency', data.currency);
        }
      })
      .catch(() => {});
  }, []);

  const handleCurrencyChange = async (code: string) => {
    setCurrency(code);
    localStorage.setItem('twenty_currency', code);
    try {
      const res = await fetch('/api/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currency: code }),
      });
      if (res.ok) {
        toast.success(`Currency set to ${code}`);
      } else {
        toast.error('Failed to save currency preference');
      }
    } catch {
      toast.error('Network error saving preference');
    }
  };

  // --- Export ---
  function handleExport() {
    const data = {
      version: 1,
      exported_at: new Date().toISOString(),
      accounts: Array.from(accountStore.accounts.values()),
      payees: Array.from(payeeStore.payees.values()),
      category_groups: Array.from(categoryStore.groups.values()),
      categories: Array.from(categoryStore.categories.values()),
      transactions: Array.from(transactionStore.transactions.values()),
      assignments: Array.from(budgetStore.assignments.values()),
      schedules: Array.from(scheduleStore.schedules.values()),
      import_rules: Array.from(importRuleStore.rules.values()),
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twenty-dollar-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Data exported successfully');
  }

  // --- Import JSON ---
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.version) {
          setImportResult('Invalid export file format');
          setImporting(false);
          return;
        }

        if (data.accounts) accountStore.importData(data.accounts);
        if (data.payees) payeeStore.importData(data.payees);
        if (data.category_groups) categoryStore.importGroups(data.category_groups);
        if (data.categories) categoryStore.importCategories(data.categories);
        if (data.transactions) transactionStore.importData(data.transactions);
        if (data.assignments) budgetStore.importAssignments(data.assignments);
        if (data.schedules) scheduleStore.importData(data.schedules);
        if (data.import_rules) importRuleStore.importData(data.import_rules);

        setImportResult(`Data imported successfully.`);
        toast.success('Data imported successfully');
      } catch {
        setImportResult('Failed to parse import file');
        toast.error('Failed to parse import file');
      } finally {
        setImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // --- Clear/Reset ---
  async function clearSampleData() {
    setClearing(true);
    try {
      await fetch('/api/reset', { method: 'POST', credentials: 'include' });
      // Reload from server to clear local state
      const emptyAccounts: any[] = [];
      accountStore.importData(emptyAccounts);
      transactionStore.importData([]);
      payeeStore.importData([]);
      scheduleStore.importData([]);

      toast.success('All data cleared');
    } catch {
      toast.error('Failed to clear data');
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  const currentLabel = () => {
    const entry = CURRENCIES.find(c => c.code === currency);
    return entry ? `${entry.symbol} — ${entry.name} (${entry.code})` : currency;
  };

  return (
    <div className="settings-view">
      <div className="settings-view__topbar">
        <span className="settings-view__title">Settings</span>
      </div>
      <div className="settings-view__content">
        {/* Currency */}
        <section className="settings-section">
          <h3 className="settings-section__title">Currency</h3>
          <div className="settings-section__field">
            <label className="settings-section__label">Display currency</label>
            <select
              value={currency}
              onChange={(e) => handleCurrencyChange(e.target.value)}
              className="w-full max-w-xs bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} — {c.name} ({c.code})
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-500 mt-1">
              Affects how amounts are displayed. All values are stored in minor units.
            </p>
          </div>
        </section>

        {/* Data */}
        <section className="settings-section">
          <h3 className="settings-section__title">Data</h3>
          <div className="settings-section__actions">
            <button className="btn btn--secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? 'Importing...' : 'Import JSON'}
            </button>
            <button className="btn btn--secondary" onClick={handleExport}>Export JSON</button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleImportFile} />
          </div>
          {importResult && (
            <p className="settings-section__desc">{importResult}</p>
          )}
        </section>

        {/* Reset */}
        <section className="settings-section">
          <h3 className="settings-section__title">Reset</h3>
          <p className="settings-section__desc">Clear all transactions, accounts, payees, and assignments. Categories and category groups are kept.</p>
          <div className="settings-section__actions">
            {confirmClear ? (
              <div className="settings-confirm-row">
                <span className="settings-confirm-row__text">Are you sure? This cannot be undone.</span>
                <button className="btn btn--danger btn--sm" disabled={clearing} onClick={clearSampleData}>
                  {clearing ? 'Clearing...' : 'Yes, clear all'}
                </button>
                <button className="btn btn--secondary btn--sm" onClick={() => setConfirmClear(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn--danger" onClick={() => setConfirmClear(true)}>Clear transactions &amp; accounts</button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
});
