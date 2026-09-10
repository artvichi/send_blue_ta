import { NavLink, Outlet } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GatewayIndicator } from '@/features/dashboard/components/gateway-indicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { PermissionBanner } from '@/components/permission-banner';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/schedule', label: 'Schedule', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

export function AppShell() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-rule bg-ground/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-lg bg-linear-to-br from-brand to-brand-deep text-white">
              <MessageSquare className="size-4" />
            </span>
            <span className="hidden sm:inline">iMessage Scheduler</span>
          </div>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-sunk text-ink' : 'text-ink-mute hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <GatewayIndicator />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
        <PermissionBanner />
        <Outlet />
      </main>
    </div>
  );
}
