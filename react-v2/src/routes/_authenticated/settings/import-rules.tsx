import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { toast } from 'sonner';

export const SettingsImportRulesPage = observer(function SettingsImportRulesPage() {
  const { importRuleStore, payeeStore, categoryStore } = useStore();
  const rules = importRuleStore.sortedRules;

  const handleDelete = (id: string) => {
    importRuleStore.deleteRule(id);
    toast.success('Import rule deleted');
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-medium text-zinc-100">Import Rules</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Auto-categorize imported transactions by matching description text.
          {rules.length > 0 && ` ${rules.length} rule${rules.length !== 1 ? 's' : ''} defined.`}
        </p>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4">
          No import rules yet. Rules are matched against transaction descriptions during import.
        </p>
      ) : (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-900/80 border-b border-zinc-800">
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Match Text</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Payee</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-400">Category</th>
                <th className="w-16 px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const payee = rule.payee_id ? payeeStore.getById(rule.payee_id) : null;
                const category = rule.category_id ? categoryStore.getCategory(rule.category_id) : null;
                return (
                  <tr key={rule.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                    <td className="px-4 py-2 text-zinc-200 font-mono text-xs">{rule.tokens}</td>
                    <td className="px-4 py-2 text-zinc-300">{payee?.name || '—'}</td>
                    <td className="px-4 py-2 text-zinc-300">{category?.name || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
