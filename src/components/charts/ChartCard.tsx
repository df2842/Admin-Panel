"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * Card that owns a chart's title, legend and its "Show table" twin. Both views
 * stay mounted (one is hidden) so switching back never re-measures the chart.
 * Pass `table={null}` when there's nothing to tabulate (empty state).
 */
export default function ChartCard({
  title,
  subtitle,
  legend,
  chart,
  table,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  chart: ReactNode;
  table: ReactNode | null;
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const headingId = useId();
  const tableView = showTable && table !== null;

  return (
    <section aria-labelledby={headingId} className={`card flex min-w-0 flex-col p-5 sm:p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-base font-semibold">
            {title}
          </h3>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {table !== null ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm shrink-0"
            aria-pressed={tableView}
            onClick={() => setShowTable((v) => !v)}
          >
            {tableView ? "Show chart" : "Show table"}
          </button>
        ) : null}
      </div>
      {legend && !tableView ? <div className="mt-3">{legend}</div> : null}
      <div className="mt-4" hidden={tableView}>
        {chart}
      </div>
      {table !== null ? (
        <div className="mt-4" hidden={!tableView}>
          {table}
        </div>
      ) : null}
    </section>
  );
}
