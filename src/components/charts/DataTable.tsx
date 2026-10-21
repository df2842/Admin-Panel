import type { ReactNode } from "react";

export type Column = { label: string; numeric?: boolean };

/**
 * Plain table used as the accessible twin of every chart and for the
 * leaderboards. Numeric columns align right with tabular figures; wide tables
 * scroll inside their own container instead of the page.
 */
export default function DataTable({
  caption,
  columns,
  rows,
  footnote,
}: {
  caption: string;
  columns: Column[];
  rows: { key: string; cells: ReactNode[] }[];
  footnote?: ReactNode;
}) {
  return (
    <div>
      <div className="relative overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-background/60 text-left text-xs text-muted">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.label}
                  scope="col"
                  className={`whitespace-nowrap px-3 py-2 font-semibold ${col.numeric ? "text-right" : ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, i) => (
                  <td
                    key={columns[i]?.label ?? i}
                    className={`px-3 py-2 align-middle ${columns[i]?.numeric ? "text-right whitespace-nowrap tabular-nums" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footnote ? <p className="mt-2 text-xs text-muted">{footnote}</p> : null}
    </div>
  );
}
