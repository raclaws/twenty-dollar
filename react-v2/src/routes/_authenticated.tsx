import { Outlet, Link, useRouter } from '@tanstack/react-router';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/lib/store-context';
import { useEffect } from 'react';
import {
  Wallet,
  ArrowLeftRight,
  Landmark,
  CalendarClock,
  Upload,
  Settings,
  LogOut,
  Loader2,
} from 'lucide-react';

const navItems = [
  { to: '/budget', label: 'Budget', icon: Wallet },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/accounts', label: 'Accounts', icon: Landmark },
  { to: '/schedules', label: 'Schedules', icon: CalendarClock },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export const AuthenticatedLayout = observer(function AuthenticatedLayout() {
  const { authStore, isHydrating } = useStore();
  const router = useRouter();

  useEffect(() => {
    authStore.checkSession();
  }, [authStore]);

  const handleLogout = async () => {
    await authStore.logout();
    router.navigate({ to: '/login' });
  };

  if (isHydrating) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="text-indigo-400 animate-spin" />
          <span className="text-zinc-400 text-sm">Loading your data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-zinc-800 bg-[#08080d] flex flex-col">
        <div className="p-4 border-b border-zinc-800">
          <h1 className="text-lg font-semibold text-zinc-100">Twenty Dollar</h1>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 transition-colors"
              activeProps={{
                className:
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm text-indigo-400 bg-indigo-500/10 font-medium',
              }}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="p-3 border-t border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 truncate">
              {authStore.user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
              title="Log out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
});
