import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import SetupNotice from "@/components/SetupNotice";
import MixEditor, { type MixRowView } from "@/components/pipeline/MixEditor";
import PromptBlock, { PLACEHOLDER_TIP, PLACEHOLDER_TONE, PromptMarks } from "@/components/pipeline/PromptBlock";
import { ChainStatusBadge, IoBadge, StepLabel } from "@/components/pipeline/badges";
import { isKnownPlaceholder, placeholdersIn } from "@/components/pipeline/pipeline-utils";
import { EmptyState, ErrorCard } from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import { APP_CHAIN_SLUG, APP_MAX_EXAMPLES, APP_MAX_TERMS } from "@/lib/config-data";
import { compactNumber, formatDate, formatDateTime, timeAgo } from "@/lib/format";
import { AI_BATCH } from "@/lib/media";
import { errorMessage } from "@/lib/people";
import { loadChain, parseId, SchemaMissingError, type ChainDetail } from "@/lib/pipeline-data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

/** Cached per request, so the tab title and the page share one auth check and one load. */
const admin = cache(requireAdmin);
const getChain = cache(async (id: number) => loadChain((await admin()).supabase, id));

/** Tab title = the chain's name. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = parseId((await params).id);
  if (id === null) return { title: "Prompt chain" };
  await admin(); // non-admins are redirected, never shown the name
  const detail = await getChain(id).catch(() => null);
  return { title: detail?.chain.name ?? "Prompt chain" };
}

/** Request time, read once per render so every "x ago" agrees. */
function requestTime(): number {
  return Date.now();
}

export default async function PromptChainPage({ params }: Props) {
  await admin();
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (id === null) notFound();

  let detail: ChainDetail | null = null;
  let missing = false;
  let error: string | null = null;
  try {
    detail = await getChain(id);
  } catch (err) {
    if (err instanceof SchemaMissingError) missing = true;
    else error = errorMessage(err);
  }
  if (!missing && !error && !detail) notFound();
  const now = requestTime();

  const back = (
    <Link href="/prompt-chains" className="btn btn-ghost -ml-3 mb-4">
      ← All prompt chains
    </Link>
  );

  if (missing || error || !detail) {
    return (
      <div className="mx-auto max-w-6xl">
        {back}
        {missing ? <SetupNotice what="The prompt chain tables" /> : <ErrorCard message={error ?? "Unknown error."} />}
      </div>
    );
  }

  const { chain, steps, mix, runs, lastRunAt } = detail;
  // Caption Arena only runs one chain (by slug), and only while it is active.
  const inUse = chain.is_active && chain.slug === APP_CHAIN_SLUG;
  const mixRows: MixRowView[] = mix.map((m) => ({
    id: m.id,
    flavor: m.flavor,
    label: m.label,
    instruction: m.instruction,
    weight: m.weight,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      {back}

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{chain.name}</h1>
          <ChainStatusBadge active={chain.is_active} inUse={inUse} />
        </div>
        <p className="mt-1 font-mono text-xs text-muted">{chain.slug}</p>
        {chain.description && <p className="mt-3 max-w-3xl text-sm">{chain.description}</p>}
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted">Steps</dt>
            <dd className="font-semibold">{steps.length}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Runs</dt>
            <dd className="font-semibold">
              {runs === null ? (
                "—"
              ) : runs > 0 ? (
                <Link href={`/requests?chain=${chain.id}`} className="text-primary hover:underline">
                  {compactNumber(runs)} →
                </Link>
              ) : (
                "0"
              )}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Last run</dt>
            <dd className="font-semibold">
              {lastRunAt ? (
                <time dateTime={lastRunAt} title={formatDateTime(lastRunAt)}>
                  {timeAgo(lastRunAt, now)}
                </time>
              ) : (
                "never"
              )}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">Updated</dt>
            <dd className="font-semibold">{formatDate(chain.updated_at)}</dd>
          </div>
        </dl>
        {mixRows.length > 0 && (
          <a href="#mix" className="btn btn-primary btn-sm mt-4">
            Edit humor mix ↓
          </a>
        )}
      </header>

      <section aria-labelledby="steps-title" className="mb-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="steps-title" className="text-xl font-bold">
            Steps
          </h2>
          <p className="text-xs text-muted">
            Read-only. Highlighted <mark className="rounded bg-accent/30 px-0.5 font-mono ring-1 ring-accent/70">{"{{placeholders}}"}</mark>{" "}
            are filled in at run time.
          </p>
        </div>

        {steps.length === 0 ? (
          <EmptyState icon="🪜" title="This chain has no steps">
            <p>Steps are added with SQL.</p>
          </EmptyState>
        ) : (
          <ol>
            {steps.map((s, i) => {
              const placeholders = placeholdersIn(s.system_prompt, s.user_prompt);
              return (
                <li key={s.id}>
                  {i > 0 && (
                    <div aria-hidden className="flex flex-col items-center py-1 text-xs text-muted">
                      <span className="h-4 w-0.5 bg-border" />
                      <span>↓ output of step {steps[i - 1].step_order} feeds the next step</span>
                      <span className="h-4 w-0.5 bg-border" />
                    </div>
                  )}
                  <article className="card p-4 sm:p-6" aria-label={`Step ${s.step_order}: ${s.name}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <h3 className="min-w-0 text-lg">
                        <StepLabel order={s.step_order} name={s.name} />
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <IoBadge input={s.input_type} output={s.output_type} />
                        <span
                          className="badge whitespace-nowrap border border-border bg-border/60 text-foreground"
                          title="Higher = more varied, lower = more predictable (0 to 2)"
                        >
                          <span aria-hidden>🌡️</span> Temperature {Number.isFinite(s.temperature) ? s.temperature.toFixed(2) : "—"}
                        </span>
                      </div>
                    </div>
                    {s.purpose && (
                      <p className="mt-2 max-w-3xl text-sm text-muted">
                        <PromptMarks text={s.purpose} inputType={s.input_type} />
                      </p>
                    )}
                    {placeholders.length > 0 && (
                      <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        Fills in:
                        {placeholders.map((p) => {
                          const tone = isKnownPlaceholder(p, s.input_type) ? "known" : "unknown";
                          return (
                            <code
                              key={p}
                              className={`rounded px-1.5 py-0.5 font-mono ${PLACEHOLDER_TONE[tone]}`}
                              title={PLACEHOLDER_TIP[tone]}
                            >
                              {`{{${p}}}`}
                            </code>
                          );
                        })}
                      </p>
                    )}
                    {s.input_type === "text" && (
                      <p className="mt-2 text-xs text-muted">
                        Also sent: up to {APP_MAX_TERMS} active{" "}
                        <Link href="/terms" className="font-semibold text-primary hover:underline">
                          terms
                        </Link>
                        , the {APP_MAX_EXAMPLES} newest active{" "}
                        <Link href="/examples" className="font-semibold text-primary hover:underline">
                          examples
                        </Link>{" "}
                        and, for “more jokes”, the photo&apos;s current captions.
                      </p>
                    )}
                    <div className="mt-4 space-y-4">
                      <PromptBlock
                        label="System prompt"
                        hint="(instructions the model follows)"
                        text={s.system_prompt}
                        inputType={s.input_type}
                      />
                      <PromptBlock
                        label="User prompt"
                        hint={s.input_type === "image" ? "(sent along with the photo)" : undefined}
                        text={s.user_prompt}
                        inputType={s.input_type}
                      />
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* scroll-mt keeps the heading clear of the phone top bar after the "Edit humor mix" jump. */}
      <section id="mix" className="scroll-mt-20 lg:scroll-mt-6">
        {!inUse && mixRows.length > 0 && (
          <p role="note" className="mb-3 text-sm text-muted">
            <span aria-hidden>ℹ️</span> Caption Arena only runs the active “{APP_CHAIN_SLUG}” chain, so this mix has no effect
            right now.
          </p>
        )}
        {mixRows.length === 0 ? (
          <EmptyState icon="🎲" title="No humor flavors on this chain">
            <p>Flavors are added with SQL. Without any, Mixed bag batches can&apos;t be split.</p>
          </EmptyState>
        ) : (
          <MixEditor chainId={chain.id} rows={mixRows} batchSize={AI_BATCH} />
        )}
      </section>
    </div>
  );
}
