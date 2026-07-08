import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';

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
];

export const SettingsIndexPage = observer(function SettingsIndexPage() {
  const [currency, setCurrency] = useState(() => {
    return localStorage.getItem('twenty_currency') || 'USD';
  });

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
      .catch(() => {
        // Silently fall back to localStorage value
      });
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

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-medium text-zinc-100">General</h2>
        <p className="text-sm text-zinc-500 mt-1">Application preferences</p>
      </div>

      {/* Currency */}
      <div className="space-y-2">
        <label className="block text-sm text-zinc-300">Display Currency</label>
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
        <p className="text-xs text-zinc-500">
          Affects how amounts are displayed. All values are stored in minor units.
        </p>
      </div>
    </div>
  );
});
