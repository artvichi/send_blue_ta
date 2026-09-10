import { IntervalControl } from './interval-control';
import { RetryControl } from './retry-control';

export function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Stored in the database, so changes survive a restart and apply to the queue immediately.
        </p>
      </div>
      <IntervalControl />
      <RetryControl />
    </div>
  );
}
