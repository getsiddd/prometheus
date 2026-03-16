"use client";

export default function CombinedSequenceSection({ data, actions }) {
  const { sequenceRunning, jobLoading, sequenceStatus, sequenceLogs } = data;
  const { runCombinedSequence } = actions;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
      <h2 className="text-lg font-medium">Combined Calibration Sequence</h2>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runCombinedSequence}
          disabled={sequenceRunning || jobLoading}
          className="rounded border border-cyan-700 bg-cyan-900/40 px-3 py-2 text-sm hover:bg-cyan-800/50 disabled:opacity-40"
        >
          {sequenceRunning ? "Running Combined Sequence..." : "Run All Calibration Stages"}
        </button>
        <span className="text-xs text-zinc-400">{sequenceStatus}</span>
      </div>
      {sequenceLogs.length ? (
        <pre className="max-h-36 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[11px] text-zinc-300">
          {sequenceLogs.join("\n")}
        </pre>
      ) : null}
    </section>
  );
}
