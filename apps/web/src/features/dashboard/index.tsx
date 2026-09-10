import { StatTiles } from './components/stat-tiles';
import { MessageTable } from './components/message-table';
import { IntervalControl } from '@/features/settings/interval-control';

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <StatTiles />

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Table first everywhere: it is the content, the rate card is a control. */}
        <div className="min-w-0">
          <MessageTable />
        </div>
        <div>
          <IntervalControl />
        </div>
      </div>
    </div>
  );
}
