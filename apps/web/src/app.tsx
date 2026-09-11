import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { SchedulerPage } from '@/screens/scheduler';
import { DashboardPage } from '@/screens/dashboard';
import { SettingsPage } from '@/screens/settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The server is the only source of truth and it is polled, so a stale
      // window here would only ever show the user older data than we have.
      staleTime: 0,
      retry: 1,
      refetchOnWindowFocus: true,

      // React Query pauses polling for a hidden tab by default, which is right
      // for most apps and wrong for this one: a queue dashboard is something you
      // leave open on a second monitor and glance at. Without this it silently
      // freezes the moment it loses focus and only catches up when clicked --
      // which reads as broken. The cost is a few small JSON requests.
      refetchIntervalInBackground: true,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="schedule" element={<SchedulerPage />} />
            <Route path="settings" element={<SettingsPage />} />
            {/* The dashboard used to live here; keep old links working. */}
            <Route path="dashboard" element={<Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="bottom-right" richColors closeButton />
    </QueryClientProvider>
  );
}
