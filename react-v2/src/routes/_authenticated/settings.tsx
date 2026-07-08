import { Outlet, Link } from '@tanstack/react-router';

const settingsNav = [
  { to: '/settings', label: 'General' },
  { to: '/settings/categories', label: 'Categories' },
  { to: '/settings/payees', label: 'Payees' },
  { to: '/settings/import-rules', label: 'Import Rules' },
  { to: '/settings/export', label: 'Export' },
] as const;

export function SettingsLayout() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-medium text-zinc-100 mb-4">Settings</h1>
      <div className="flex gap-6">
        <nav className="w-44 space-y-1">
          {settingsNav.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="block px-3 py-1.5 rounded text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
              activeProps={{
                className:
                  'block px-3 py-1.5 rounded text-sm text-indigo-400 bg-indigo-500/10 font-medium',
              }}
              activeOptions={{ exact: true }}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
