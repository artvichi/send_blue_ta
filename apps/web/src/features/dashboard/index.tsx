import { StatTiles } from './components/stat-tiles';
import { MessageTable } from './components/message-table';
import { IntervalControl } from '@/features/settings/interval-control';

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <StatTiles />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="order-2 min-w-0 lg:order-1">
          <MessageTable />
        </div>
        <div className="order-1 lg:order-2">
          <IntervalControl />
        </div>
      </div>
    </div>
  );
}
