import { useState } from 'react';
import { StatTiles } from './stat-tiles';
import { ActivityChart } from './activity-chart';
import { MessageTable } from './message-table';
import { StatusFilterPills, type StatusFilter } from './status-filter';
import { TableActions } from './table-actions';
import { EmptyHistory } from './empty-history';
import { useStats } from '@/api/stats';

export function DashboardPage() {
  const [filter, setFilter] = useState<StatusFilter>(undefined);
  const { data: stats } = useStats();
  const empty = stats?.total === 0;

  // Zeroed tiles above an empty chart above an empty table is three ways of
  // saying nothing. On a fresh install, say it once and point somewhere useful.
  if (empty) return <EmptyHistory />;

  return (
    <div className="flex flex-col gap-6">
      <StatTiles />
      <ActivityChart />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <StatusFilterPills value={filter} onChange={setFilter} />
        </div>
        <TableActions />
      </div>

      <MessageTable filter={filter} />
    </div>
  );
}
