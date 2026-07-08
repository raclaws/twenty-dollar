import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { toast } from 'sonner';

export const SettingsExportPage = observer(function SettingsExportPage() {
  const {
    accountStore,
    payeeStore,
    categoryStore,
    transactionStore,
    budgetStore,
    scheduleStore,
    importRuleStore,
  } = useStore();

  const handleExport = () => {
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
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.version) {
          toast.error('Invalid export file format');
          return;
        }

        // Hydrate stores with imported data (merge mode)
        if (data.accounts) accountStore.importData(data.accounts);
        if (data.payees) payeeStore.importData(data.payees);
        if (data.category_groups) categoryStore.importGroups(data.category_groups);
        if (data.categories) categoryStore.importCategories(data.categories);
        if (data.transactions) transactionStore.importData(data.transactions);
        if (data.assignments) budgetStore.importAssignments(data.assignments);
        if (data.schedules) scheduleStore.importData(data.schedules);
        if (data.import_rules) importRuleStore.importData(data.import_rules);

        toast.success('Data imported successfully');
      } catch {
        toast.error('Failed to parse import file');
      }
    };
    reader.readAsText(file);
    // Reset input
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-medium text-zinc-100">Export & Import Data</h2>
        <p className="text-sm text-zinc-500 mt-1">Backup or restore your budget data</p>
      </div>

      {/* Export */}
      <div className="space-y-2 p-4 border border-zinc-800 rounded-lg">
        <h3 className="text-sm font-medium text-zinc-200">Export All Data</h3>
        <p className="text-xs text-zinc-500">
          Download a JSON file containing all accounts, transactions, categories, schedules, and rules.
        </p>
        <button
          onClick={handleExport}
          className="mt-2 px-4 py-2 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
        >
          Download JSON Export
        </button>
      </div>

      {/* Import */}
      <div className="space-y-2 p-4 border border-zinc-800 rounded-lg">
        <h3 className="text-sm font-medium text-zinc-200">Import Data</h3>
        <p className="text-xs text-zinc-500">
          Upload a previously exported JSON file. This will merge with your existing data.
        </p>
        <label className="mt-2 inline-block px-4 py-2 text-sm rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer">
          Choose JSON File
          <input
            type="file"
            accept=".json,application/json"
            onChange={handleImportFile}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
});
