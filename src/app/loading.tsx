export default function Loading() {
  return (
    <div className="app-page max-w-4xl space-y-6 animate-pulse">
      <div>
        <div className="mb-3 h-9 w-56 rounded-2xl bg-surface-raised" />
        <div className="h-5 w-72 rounded-2xl bg-surface-overlay" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="ui-panel-raised p-5">
            <div className="mb-4 h-5 w-28 rounded-2xl bg-surface-overlay" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded-2xl bg-surface-overlay" />
              <div className="h-4 w-3/4 rounded-2xl bg-surface-base" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
