import { ComposeForm } from './components/compose-form';
import { QueueList } from './components/queue-list';
import { IntervalNotice } from '@/features/settings/interval-notice';

export function SchedulerPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <ComposeForm />
      <IntervalNotice />
      <QueueList />
    </div>
  );
}
