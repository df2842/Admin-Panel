import Link from "next/link";
import SetupNotice from "@/components/SetupNotice";
import CreatePanel from "@/components/crud/CreatePanel";
import CrudList, { type CrudRow } from "@/components/crud/CrudList";
import { MetaLine, OffBadge, SearchField } from "@/components/crud/display";
import { initialValues } from "@/components/crud/schema";
import FilterBar from "@/components/tables/FilterBar";
import { Segmented } from "@/components/tables/controls";
import { EmptyState, ErrorCard, PageHeader } from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import { APP_MAX_TERMS, STATUS_FILTERS, loadTerms, matchesQuery, matchesStatus } from "@/lib/config-data";
import type { Term } from "@/lib/domain";
import { formatDate } from "@/lib/format";
import { param, pickEnum, type SearchParams } from "@/lib/people";
import { createTerm, deleteTerm, setTermActive, updateTerm } from "./actions";
import { TERM_FIELDS } from "./fields";

export const dynamic = "force-dynamic";
export const metadata = { title: "Terms" };

const DESCRIPTION = `The joke step gets the first ${APP_MAX_TERMS} active terms (A–Z) as comedy techniques.`;

function TermView({ term, unsent }: { term: Term; unsent: boolean }) {
  return (
    <>
      <p className="text-base font-bold">{term.term}</p>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{term.definition}</p>
      {term.example && (
        <p className="mt-1.5 whitespace-pre-line text-sm italic text-muted">
          <span className="not-italic font-semibold">Example:</span> “{term.example}”
        </p>
      )}
      <MetaLine
        items={[
          unsent && <OffBadge key="unsent">Not sent (over {APP_MAX_TERMS})</OffBadge>,
          `Updated ${formatDate(term.updated_at)}`,
        ]}
      />
    </>
  );
}

export default async function TermsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const q = param(sp, "q", 100);
  const status = pickEnum(param(sp, "status", 10), STATUS_FILTERS, "");

  const loaded = await loadTerms(supabase);
  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Terms" description={DESCRIPTION} />
        {loaded.missing ? (
          <SetupNotice what="The terms table and its starter terms" />
        ) : (
          <ErrorCard message={loaded.error} />
        )}
      </div>
    );
  }

  const terms = loaded.data;
  const activeCount = terms.filter((t) => t.is_active).length;
  const shown = terms.filter(
    (t) => matchesStatus(status, t.is_active) && matchesQuery(q, t.term, t.definition, t.example),
  );
  const filtered = q !== "" || status !== "";
  // Caption Arena sends only the first few active terms, A to Z (this list's order).
  const sent = new Set(
    terms
      .filter((t) => t.is_active)
      .slice(0, APP_MAX_TERMS)
      .map((t) => t.id),
  );

  const rows: CrudRow[] = shown.map((t) => ({
    id: t.id,
    name: t.term,
    active: t.is_active,
    values: initialValues(TERM_FIELDS, t),
    view: <TermView term={t} unsent={t.is_active && !sent.has(t.id)} />,
  }));

  // CrudList stays mounted when the last row goes, so its "deleted" notice and focus survive.
  const results = (
    <>
      {shown.length > 0 && (
        <p className="mb-3 text-sm text-muted">
          {filtered
            ? `Showing ${shown.length} of ${terms.length} terms`
            : `${terms.length} ${terms.length === 1 ? "term" : "terms"} · ${activeCount} active`}
        </p>
      )}
      <CrudList
        rows={rows}
        fields={TERM_FIELDS}
        noun="term"
        label="Terms"
        updateAction={updateTerm}
        deleteAction={deleteTerm}
        toggleAction={setTermActive}
        empty={
          terms.length === 0 ? (
            <EmptyState icon="🎭" title="No terms yet">
              <p>Add a comedy technique with “New term” above.</p>
            </EmptyState>
          ) : (
            <EmptyState icon="🔍" title="No terms match these filters">
              <Link href="/terms" className="btn btn-secondary">
                Show all terms
              </Link>
            </EmptyState>
          )
        }
      />
    </>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Terms" description={DESCRIPTION} />

      <CreatePanel
        fields={TERM_FIELDS}
        noun="term"
        createAction={createTerm}
        help="A short name, a one-sentence definition and, ideally, an example joke."
        defaultOpen={terms.length === 0}
      />

      <FilterBar action="/terms" stateKey={`${q}|${status}`} label="Search and filter terms" results={results}>
        <SearchField value={q} placeholder="Term, definition or example" />
        <Segmented
          name="status"
          label="Status"
          value={status}
          options={[
            { value: "", label: "All" },
            { value: "active", label: `Active (${activeCount})` },
            { value: "off", label: `Off (${terms.length - activeCount})` },
          ]}
        />
        {filtered && (
          <Link href="/terms" className="btn btn-ghost h-11">
            Clear
          </Link>
        )}
      </FilterBar>
    </div>
  );
}
