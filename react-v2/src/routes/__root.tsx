import { Outlet } from '@tanstack/react-router';

export function RootLayout() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-zinc-100">
      <Outlet />
    </div>
  );
}
