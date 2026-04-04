export default function Loading() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 animate-pulse">
      <div>
        <div className="h-7 bg-white/10 rounded w-48 mb-2" />
        <div className="h-4 bg-white/5 rounded w-64" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="h-4 bg-white/10 rounded w-24 mb-3" />
            <div className="space-y-2">
              <div className="h-3 bg-white/5 rounded w-full" />
              <div className="h-3 bg-white/5 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
