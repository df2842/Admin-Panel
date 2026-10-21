import Link from "next/link";
import SetupNotice from "@/components/SetupNotice";
import { ChainStatusBadge } from "@/components/pipeline/badges";
import { EmptyState, ErrorCard, NUM, PageHeader, TableCard, TD, TH } from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import { APP_CHAIN_SLUG } from "@/lib/config-data";
import { compactNumber, formatDateTime, timeAgo } from "@/lib/format";
import { errorMessage } from "@/lib/people";
import { loadChains, SchemaMissingError, type ChainListItem } from "@/lib/pipeline-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prompt chains" };

/** Request time, read once per render so every "x ago" agrees. */
function requestTime(): number {
  return Date.now();
}

export default async function PromptChainsPage() {
  const { supabase } = await requireAdmin();

  let chains: ChainListItem[] = [];
  let missing = false;
  let error: string | null = null;
  try {
    chains = await loadChains(supabase);
  } catch (err) {
    if (err instanceof SchemaMissingError) missing = true;
    else error = errorMessage(err);
  }
  const now = requestTime();

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Prompt chains"
        description="The steps Caption Arena runs to turn a photo into jokes. Steps are read-only; each chain's humor mix is editable."
      />

      {missing && <SetupNotice what="The prompt chain tables" />}
      {error && <ErrorCard message={error} />}

      {!missing && !error && chains.length === 0 && (
        <EmptyState icon="⛓️" title="No prompt chains yet">
          <p>Chains are added with SQL. Run supabase/week7-domain.sql to create the default “Describe, then joke” chain.</p>
        </EmptyState>
      )}

      {chains.length > 0 && (
        // Description sits under the name so the table fits ~690px (1024px window) without scrolling.
        <TableCard minWidth={540} caption="Prompt chains">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                Chain
              </th>
              <th scope="col" className={TH}>
                Status
              </th>
              <th scope="col" className={`${TH} ${NUM}`}>
                Steps
              </th>
              <th scope="col" className={`${TH} ${NUM}`} title="Humor flavors with a weight above 0 / all flavors">
                Flavors
              </th>
              <th scope="col" className={`${TH} ${NUM}`} title="Generation requests that used this chain">
                Runs
              </th>
              <th scope="col" className={TH}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {chains.map((c) => {
              const href = `/prompt-chains/${c.id}`;
              return (
                <tr key={c.id} className="transition hover:bg-background/70">
                  <td className={TD}>
                    <Link href={href} className="font-semibold hover:text-primary hover:underline">
                      {c.name}
                    </Link>
                    <span className="block font-mono text-xs text-muted">{c.slug}</span>
                    {c.description && <p className="mt-1 line-clamp-2 max-w-xl text-sm text-muted">{c.description}</p>}
                  </td>
                  <td className={TD}>
                    <ChainStatusBadge active={c.is_active} inUse={c.slug === APP_CHAIN_SLUG} />
                  </td>
                  <td className={`${TD} ${NUM}`}>{c.steps}</td>
                  <td className={`${TD} ${NUM} whitespace-nowrap`}>
                    {c.flavors === 0 ? (
                      <span className="text-muted">0</span>
                    ) : (
                      <Link
                        href={`${href}#mix`}
                        className="hover:text-primary hover:underline"
                        title={`${c.weightedFlavors} of ${c.flavors} flavors are used in Mixed bag batches. Edit the mix.`}
                      >
                        <span className="font-semibold">{c.weightedFlavors}</span>
                        <span className="text-muted"> / {c.flavors}</span>
                      </Link>
                    )}
                  </td>
                  <td className={`${TD} ${NUM} whitespace-nowrap`}>
                    {c.runs === null ? (
                      <span className="text-muted">—</span>
                    ) : c.runs > 0 ? (
                      <Link
                        href={`/requests?chain=${c.id}`}
                        className="font-semibold hover:text-primary hover:underline"
                        title={c.lastRunAt ? `Last run ${formatDateTime(c.lastRunAt)}` : undefined}
                      >
                        {compactNumber(c.runs)}
                      </Link>
                    ) : (
                      <span className="text-muted">0</span>
                    )}
                    {c.lastRunAt && <span className="block text-xs text-muted">{timeAgo(c.lastRunAt, now)}</span>}
                  </td>
                  <td className={`${TD} text-right`}>
                    <Link href={href} className="btn btn-secondary btn-sm">
                      View
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableCard>
      )}
    </div>
  );
}
