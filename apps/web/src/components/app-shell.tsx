import { Link, NavLink, Outlet } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GatewayIndicator } from '@/components/gateway-indicator';
import { ThemeToggle } from '@/components/theme-toggle';
import { PermissionBanner } from '@/components/permission-banner';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/schedule', label: 'Schedule', end: false },
  { to: '/recipients', label: 'Recipients', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

export function AppShell() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-rule bg-ground/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
          <Link
            to="/"
            aria-label="iMessage Scheduler — go to the dashboard"
            className="group flex items-center gap-2 rounded-lg font-semibold tracking-tight
                       transition-opacity duration-150 hover:opacity-90"
          >
            <span
              className="grid size-7 place-items-center rounded-lg bg-linear-to-br from-brand to-brand-deep
                         text-white shadow-sm transition-all duration-200 ease-out
                         group-hover:shadow-md group-hover:-translate-y-px
                         group-active:translate-y-0 group-active:shadow-sm"
            >
              <MessageSquare className="size-4 transition-transform duration-200 group-hover:scale-110" />
            </span>
            <span className="hidden sm:inline">iMessage Scheduler</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-lg px-3 py-1.5 text-sm font-medium',
                    'transition-[color,background-color] duration-150 ease-out',
                    // A faint underline that grows from the centre on hover, so an
                    // inactive item shows it is reachable without pretending to be selected.
                    'after:absolute after:inset-x-3 after:-bottom-0.5 after:h-px after:origin-center',
                    'after:scale-x-0 after:bg-ink-mute/50 after:transition-transform after:duration-200',
                    isActive
                      ? 'bg-sunk text-ink'
                      : 'text-ink-mute hover:bg-sunk/60 hover:text-ink hover:after:scale-x-100',
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
