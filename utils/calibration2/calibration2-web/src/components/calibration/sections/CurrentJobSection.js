"use client";

export default function CurrentJobSection({ currentJob }) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="mb-2 text-lg font-medium">Current Job</h2>
      {!currentJob ? (
        <p className="text-sm text-zinc-400">No stage started yet.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-4">
            <span>ID: {currentJob.id}</span>
            <span>Stage: {currentJob.stage}</span>
            <span>Status: {currentJob.status}</span>
            <span>Progress: {currentJob.progress}%</span>
          </div>
          <div className="h-2 rounded bg-zinc-800">
            <div className="h-2 rounded bg-cyan-500" style={{ width: `${currentJob.progress}%` }} />
          </div>
          <pre className="max-h-52 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
            {JSON.stringify(currentJob, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}
