import { useState } from 'react';
import { StatTiles } from './components/stat-tiles';
import { ActivityChart } from './components/activity-chart';
import { MessageTable } from './components/message-table';
import { StatusFilterPills, type StatusFilter } from './components/status-filter';

export function DashboardPage() {
  const [filter, setFilter] = useState<StatusFilter>(undefined);

  return (
    <div className="flex flex-col gap-6">
      <StatTiles />
      <ActivityChart />

      {/* Full width, so the table and the rate card below start on the same line. */}
      <StatusFilterPills value={filter} onChange={setFilter} />

      <MessageTable filter={filter} />
    </div>
  );
}
