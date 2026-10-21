import SetupNotice from "@/components/SetupNotice";
import CreatePanel from "@/components/crud/CreatePanel";
import CrudList, { type CrudRow } from "@/components/crud/CrudList";
import { Callout, Code, MetaLine, OutLink, Section, Tag } from "@/components/crud/display";
import { initialValues, withOptions } from "@/components/crud/schema";
import { EmptyState, ErrorCard, PageHeader } from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import { APP_PROVIDER_SLUG, loadLlm } from "@/lib/config-data";
import type { LlmModel, LlmProvider } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import {
  createModel,
  createProvider,
  deleteModel,
  deleteProvider,
  setModelActive,
  setProviderActive,
  updateModel,
  updateProvider,
} from "./actions";
import { MODEL_FIELDS, PROVIDER_FIELDS } from "./fields";

export const dynamic = "force-dynamic";
export const metadata = { title: "Models & providers" };

const TITLE = "Models & providers";
const DESCRIPTION = "The AI models Caption Arena calls, tried in priority order with fallback.";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Why Caption Arena won't call this model (null = it's in the run order). */
function skipReason(model: LlmModel, provider: LlmProvider | undefined): string | null {
  if (!model.is_active) return "Skipped: the model is off.";
  if (!provider?.is_active) return "Skipped: its provider is off.";
  if (provider.slug !== APP_PROVIDER_SLUG) return "Skipped: Caption Arena only calls Google (Gemini) models.";
  return null;
}

/** One step's models, in the order Caption Arena tries them. */
function RunOrder({ step, models, empty }: { step: string; models: LlmModel[]; empty?: string }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <p className="shrink-0 text-sm font-bold sm:w-36">{step}</p>
      {models.length > 0 ? (
        <ol aria-label={step} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          {models.map((m, i) => (
            <li key={m.id} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="text-muted">
                  →
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-xl border-2 border-border px-2.5 py-1 font-semibold">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">
                  {i + 1}
                </span>
                {m.name}
                {i > 0 && <span className="sr-only">(fallback)</span>}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">{empty}</p>
      )}
    </div>
  );
}

function ModelView({
  model,
  provider,
  rank,
  skipped,
}: {
  model: LlmModel;
  provider: LlmProvider | undefined;
  rank: number | null;
  skipped: string | null;
}) {
  // In the run order but can't take a photo: step 1 passes it over, step 2 still uses it.
  const jokesOnly = rank !== null && !model.supports_vision;
  return (
    <>
      <p className="flex flex-wrap items-center gap-2">
        {rank !== null ? (
          <span className="badge bg-primary text-primary-foreground tabular-nums" title="Position in the run order">
            #{rank}
          </span>
        ) : (
          <span className="badge border border-border bg-background text-muted">Skipped</span>
        )}
        <span className="text-base font-bold">{model.name}</span>
      </p>
      <p className="mt-1.5 text-sm">
        <Code>{model.api_model_id}</Code>
      </p>
      <MetaLine
        items={[
          <Tag key="p">{provider?.name ?? `Provider #${model.provider_id}`}</Tag>,
          <span key="prio" className="tabular-nums">
            Priority {model.priority}
          </span>,
          model.supports_vision ? "👁️ Reads photos" : "Text only",
          `Updated ${formatDate(model.updated_at)}`,
        ]}
      />
      {skipped && <p className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">{skipped}</p>}
      {jokesOnly && (
        <p className="mt-1.5 text-xs font-semibold text-muted">Used for jokes only: it can&apos;t read photos.</p>
      )}
      {model.notes && <p className="mt-1.5 whitespace-pre-line text-sm text-muted">{model.notes}</p>}
    </>
  );
}

function ProviderView({ provider, models }: { provider: LlmProvider; models: number }) {
  return (
    <>
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-base font-bold">{provider.name}</span>
        <Code>{provider.slug}</Code>
      </p>
      {provider.api_base_url && (
        <p className="mt-1.5 text-sm text-muted">
          API: <span className="break-all font-mono text-xs">{provider.api_base_url}</span>
        </p>
      )}
      <MetaLine
        items={[
          plural(models, "model"),
          provider.docs_url ? (
            <OutLink key="docs" href={provider.docs_url}>
              Docs
            </OutLink>
          ) : null,
          `Updated ${formatDate(provider.updated_at)}`,
        ]}
      />
    </>
  );
}

export default async function LlmPage() {
  const { supabase } = await requireAdmin();
  const loaded = await loadLlm(supabase);

  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        {loaded.missing ? (
          <SetupNotice what="The LLM provider and model tables" />
        ) : (
          <ErrorCard message={loaded.error} />
        )}
      </div>
    );
  }

  const { providers, models } = loaded.data;
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const modelsPerProvider = new Map<number, number>();
  for (const m of models) modelsPerProvider.set(m.provider_id, (modelsPerProvider.get(m.provider_id) ?? 0) + 1);

  // `models` is already in run order (priority, then id), like Caption Arena's query.
  const skipped = new Map(models.map((m) => [m.id, skipReason(m, providerById.get(m.provider_id))]));
  const runOrder = models.filter((m) => !skipped.get(m.id));
  // Step 1 (describe photo) only tries models that read photos; step 2 (jokes) tries them all.
  const photoOrder = runOrder.filter((m) => m.supports_vision);
  const rank = new Map(runOrder.map((m, i) => [m.id, i + 1]));

  const modelFields = withOptions(MODEL_FIELDS, {
    provider_id: providers.map((p) => ({ value: String(p.id), label: p.is_active ? p.name : `${p.name} (off)` })),
  });

  const modelRows: CrudRow[] = models.map((m) => ({
    id: m.id,
    name: m.name,
    active: m.is_active,
    values: initialValues(modelFields, m),
    deleteWarning:
      runOrder.length === 1 && rank.has(m.id)
        ? `Delete “${m.name}”? It's the only model Caption Arena can run, so it would fall back to its built-in defaults.`
        : photoOrder.length === 1 && photoOrder[0].id === m.id
          ? `Delete “${m.name}”? It's the only model that reads photos, so step 1 would use the built-in defaults.`
          : `Delete the model “${m.name}”? Logged responses keep its API model ID. This can't be undone.`,
    view: (
      <ModelView
        model={m}
        provider={providerById.get(m.provider_id)}
        rank={rank.get(m.id) ?? null}
        skipped={skipped.get(m.id) ?? null}
      />
    ),
  }));

  const providerRows: CrudRow[] = providers.map((p) => {
    const n = modelsPerProvider.get(p.id) ?? 0;
    return {
      id: p.id,
      name: p.name,
      active: p.is_active,
      values: initialValues(PROVIDER_FIELDS, p),
      deleteWarning:
        n > 0
          ? `Delete “${p.name}”? It still has ${plural(n, "model")}, so the database will block this until you delete them or move them to another provider.`
          : `Delete the provider “${p.name}”? This can't be undone.`,
      view: <ProviderView provider={p} models={n} />,
    };
  });

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <PageHeader title={TITLE} description={DESCRIPTION}>
        <a href="#models" className="btn btn-secondary">
          Models
        </a>
        <a href="#providers" className="btn btn-secondary">
          Providers
        </a>
      </PageHeader>

      <Section id="models" title="Models" count={models.length}>
        {runOrder.length > 0 ? (
          <div className="card space-y-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Run order right now</p>
            <RunOrder
              step="1. Describe photo"
              models={photoOrder}
              empty="Built-in Gemini defaults: no active model reads photos."
            />
            <RunOrder step="2. Write jokes" models={runOrder} />
          </div>
        ) : (
          <Callout tone="warning">
            <strong>No model can run right now,</strong> so Caption Arena uses its built-in Gemini defaults. Turn on a
            model from an active Google provider.
          </Callout>
        )}

        <CreatePanel
          fields={modelFields}
          noun="model"
          createAction={createModel}
          help="Pick its provider, then the exact model ID the API expects."
          disabledReason={providers.length === 0 ? "Add a provider below first." : undefined}
        />

        <CrudList
          rows={modelRows}
          fields={modelFields}
          noun="model"
          label="LLM models in run order"
          updateAction={updateModel}
          deleteAction={deleteModel}
          toggleAction={setModelActive}
          empty={
            <EmptyState icon="🤖" title="No models yet">
              <p>Add one with “New model”. Until then Caption Arena uses its built-in defaults.</p>
            </EmptyState>
          }
        />
      </Section>

      <Section
        id="providers"
        title="Providers"
        count={providers.length}
        description="Turning a provider off skips all of its models."
      >
        <CreatePanel
          fields={PROVIDER_FIELDS}
          noun="provider"
          createAction={createProvider}
          defaultOpen={providers.length === 0}
        />

        <CrudList
          rows={providerRows}
          fields={PROVIDER_FIELDS}
          noun="provider"
          label="LLM providers"
          updateAction={updateProvider}
          deleteAction={deleteProvider}
          toggleAction={setProviderActive}
          empty={
            <EmptyState icon="🏢" title="No providers yet">
              <p>Add the company or API that runs your models, e.g. Google (Gemini API).</p>
            </EmptyState>
          }
        />
      </Section>
    </div>
  );
}
