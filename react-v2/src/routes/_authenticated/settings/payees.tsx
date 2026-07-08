import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { toast } from 'sonner';

export const SettingsPayeesPage = observer(function SettingsPayeesPage() {
  const { payeeStore } = useStore();
  const payees = payeeStore.sortedPayees;

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Delete payee "${name}"? This cannot be undone.`)) return;
    payeeStore.deletePayee(id);
    toast.success(`Deleted payee: ${name}`);
  };

  return (
    <div className="space-y-4 max-w-lg">
      <div>
        <h2 className="text-lg font-medium text-zinc-100">Payees</h2>
        <p className="text-sm text-zinc-500 mt-1">
          {payees.length} payee{payees.length !== 1 ? 's' : ''} in your budget
        </p>
      </div>

      {payees.length === 0 ? (
        <p className="text-sm text-zinc-500 py-4">No payees yet. They are created when you add transactions.</p>
      ) : (
        <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
          {payees.map((payee) => (
            <div
              key={payee.id}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-zinc-800/30 transition-colors"
            >
              <div>
                <span className="text-sm text-zinc-200">{payee.name}</span>
                {payee.type === 'account' && (
                  <span className="ml-2 text-xs text-zinc-500">(transfer)</span>
                )}
              </div>
              <button
                onClick={() => handleDelete(payee.id, payee.name)}
                className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
