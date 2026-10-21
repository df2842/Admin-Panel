import Link from "next/link";
import SetupNotice from "@/components/SetupNotice";
import CreatePanel from "@/components/crud/CreatePanel";
import CrudList, { type CrudRow } from "@/components/crud/CrudList";
import { MetaLine, OffBadge, SearchField, Tag, shorten } from "@/components/crud/display";
import { initialValues, withOptions, type Option } from "@/components/crud/schema";
import FilterBar from "@/components/tables/FilterBar";
import { Segmented } from "@/components/tables/controls";
import { EmptyState, ErrorCard, PageHeader } from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import {
  APP_CHAIN_SLUG,
  APP_MAX_EXAMPLES,
  STATUS_FILTERS,
  loadExamples,
  matchesQuery,
  matchesStatus,
} from "@/lib/config-data";
import type { AiGenerationExample } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { param, pickEnum, type SearchParams } from "@/lib/people";
import { createExample, deleteExample, setExampleActive, updateExample } from "./actions";
import { EXAMPLE_FIELDS } from "./fields";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI examples" };

const TITLE = "AI examples";
const DESCRIPTION = `The joke step sees the ${APP_MAX_EXAMPLES} newest active examples for its chain (or all chains).`;

function ExampleView({
  example,
  flavorLabel,
  chainName,
  unsent,
}: {
  example: AiGenerationExample;
  flavorLabel: string | null;
  chainName: string | null;
  /** Why Caption Arena doesn't send this active example (null = sent, or off). */
  unsent: string | null;
}) {
  return (
    <>
      <p className="whitespace-pre-line text-base font-semibold leading-snug">“{example.caption}”</p>
      <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted">
        <span className="font-semibold text-foreground">Photo:</span> {example.image_description}
      </p>
      <MetaLine
        items={[
          unsent && <OffBadge key="unsent">{unsent}</OffBadge>,
          example.flavor ? (
            <Tag key="flavor" title={`Flavor: ${example.flavor}`}>
              {flavorLabel ?? example.flavor}
            </Tag>
          ) : (
            "No flavor"
          ),
          <Tag key="chain">{chainName ?? "All chains"}</Tag>,
          `Updated ${formatDate(example.updated_at)}`,
        ]}
      />
    </>
  );
}

export default async function ExamplesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const q = param(sp, "q", 100);
  const status = pickEnum(param(sp, "status", 10), STATUS_FILTERS, "");

  const loaded = await loadExamples(supabase);
  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={TITLE} description={DESCRIPTION} />
        {loaded.missing ? (
          <SetupNotice what="The AI generation examples and prompt chain tables" />
        ) : (
          <ErrorCard message={loaded.error} />
        )}
      </div>
    );
  }

  const { examples, chains, mix } = loaded.data;
  const chainName = new Map(chains.map((c) => [c.id, c.name]));

  // One suggestion per flavor across all chains' mixes, in mix order.
  const flavorLabel = new Map<string, string>();
  for (const m of mix) if (!flavorLabel.has(m.flavor)) flavorLabel.set(m.flavor, m.label);
  const flavorOptions: Option[] = [...flavorLabel].map(([value, label]) => ({ value, label }));
  const chainOptions: Option[] = chains.map((c) => ({
    value: String(c.id),
    label: c.is_active ? c.name : `${c.name} (off)`,
  }));
  const fields = withOptions(EXAMPLE_FIELDS, { flavor: flavorOptions, chain_id: chainOptions });

  const activeCount = examples.filter((e) => e.is_active).length;
  const shown = examples.filter(
    (e) =>
      matchesStatus(status, e.is_active) &&
      matchesQuery(q, e.caption, e.image_description, e.flavor, e.flavor ? flavorLabel.get(e.flavor) : null),
  );
  const filtered = q !== "" || status !== "";

  // What Caption Arena sends: the newest few active examples for all chains or the chain it runs.
  const liveChainId = chains.find((c) => c.slug === APP_CHAIN_SLUG && c.is_active)?.id ?? null;
  const usable = (e: AiGenerationExample) => e.chain_id === null || e.chain_id === liveChainId;
  const sent = new Set(
    examples
      .filter((e) => e.is_active && usable(e))
      .slice(0, APP_MAX_EXAMPLES)
      .map((e) => e.id),
  );
  const chainActive = new Map(chains.map((c) => [c.id, c.is_active]));
  function unsentReason(e: AiGenerationExample): string | null {
    if (!e.is_active || sent.has(e.id)) return null;
    if (usable(e)) return `Not sent (over ${APP_MAX_EXAMPLES})`;
    const chainOff = e.chain_id !== null && chainActive.get(e.chain_id) === false;
    return chainOff ? "Not sent (chain off)" : "Not sent (other chain)";
  }

  const rows: CrudRow[] = shown.map((e) => ({
    id: e.id,
    name: shorten(e.caption, 60),
    active: e.is_active,
    values: initialValues(fields, e),
    view: (
      <ExampleView
        example={e}
        flavorLabel={e.flavor ? (flavorLabel.get(e.flavor) ?? null) : null}
        chainName={e.chain_id !== null ? (chainName.get(e.chain_id) ?? `Chain #${e.chain_id}`) : null}
        unsent={unsentReason(e)}
      />
    ),
  }));

  // CrudList stays mounted when the last row goes, so its "deleted" notice and focus survive.
  const results = (
    <>
      {shown.length > 0 && (
        <p className="mb-3 text-sm text-muted">
          {filtered
            ? `Showing ${shown.length} of ${examples.length} examples`
            : `${examples.length} ${examples.length === 1 ? "example" : "examples"} · ${activeCount} active · newest first`}
        </p>
      )}
      <CrudList
        rows={rows}
        fields={fields}
        noun="example"
        label="AI examples"
        updateAction={updateExample}
        deleteAction={deleteExample}
        toggleAction={setExampleActive}
        empty={
          examples.length === 0 ? (
            <EmptyState icon="🧪" title="No examples yet">
              <p>Add a photo description and a caption that shows the AI the tone you want.</p>
            </EmptyState>
          ) : (
            <EmptyState icon="🔍" title="No examples match these filters">
              <Link href="/examples" className="btn btn-secondary">
                Show all examples
              </Link>
            </EmptyState>
          )
        }
      />
    </>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title={TITLE} description={DESCRIPTION} />

      <CreatePanel
        fields={fields}
        noun="example"
        createAction={createExample}
        help="Describe a photo like step 1 would, then write the caption you'd want."
        defaultOpen={examples.length === 0}
      />

      <FilterBar action="/examples" stateKey={`${q}|${status}`} label="Search and filter examples" results={results}>
        <SearchField value={q} placeholder="Caption, description or flavor" />
        <Segmented
          name="status"
          label="Status"
          value={status}
          options={[
            { value: "", label: "All" },
            { value: "active", label: `Active (${activeCount})` },
            { value: "off", label: `Off (${examples.length - activeCount})` },
          ]}
        />
        {filtered && (
          <Link href="/examples" className="btn btn-ghost h-11">
            Clear
          </Link>
        )}
      </FilterBar>
    </div>
  );
}
