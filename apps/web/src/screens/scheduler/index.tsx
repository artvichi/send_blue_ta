import { ComposeForm } from './compose-form';
import { QueueList } from './queue-list';
import { IntervalNotice } from '@/components/interval-notice';

export function SchedulerPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <ComposeForm />
      <IntervalNotice />
      <QueueList />
    </div>
  );
}
