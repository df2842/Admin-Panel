import SetupNotice from "@/components/SetupNotice";
import CreatePanel from "@/components/crud/CreatePanel";
import CrudList, { type CrudRow } from "@/components/crud/CrudList";
import { Callout, MetaLine, Section } from "@/components/crud/display";
import { initialValues } from "@/components/crud/schema";
import { EmptyState, ErrorCard, PageHeader } from "@/components/tables/ui";
import { requireAdmin } from "@/lib/admin";
import { loadAccess } from "@/lib/config-data";
import { displayName, formatDate } from "@/lib/format";
import type { Profile } from "@/lib/types";
import AccessChecker from "./AccessChecker";
import { createDomain, createEmail, deleteDomain, deleteEmail, updateDomain, updateEmail } from "./actions";
import { DOMAIN_FIELDS, EMAIL_FIELDS } from "./fields";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign-in access" };

const TITLE = "Sign-in access";
const RULE = "Superadmins and whitelisted e-mails always get in; anyone else needs a listed domain (subdomains count).";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function EntryView({
  value,
  note,
  createdAt,
  creator,
}: {
  value: string;
  note: string | null;
  createdAt: string;
  creator: Profile | undefined;
}) {
  return (
    <>
      <p className="break-all font-mono text-base font-bold">{value}</p>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
      <MetaLine items={[`Added ${formatDate(createdAt)}`, creator ? `by ${displayName(creator)}` : null]} />
    </>
  );
}

export default async function AccessPage() {
  const { supabase } = await requireAdmin();
  const loaded = await loadAccess(supabase);

  if (!loaded.ok) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title={TITLE} description={RULE} />
        {loaded.missing ? <SetupNotice what="The sign-in access lists" /> : <ErrorCard message={loaded.error} />}
      </div>
    );
  }

  const { domains, emails, people, superadminEmails } = loaded.data;
  const lastDomain = domains.length === 1;

  const domainRows: CrudRow[] = domains.map((d) => ({
    id: d.id,
    name: d.domain,
    values: initialValues(DOMAIN_FIELDS, d),
    deleteWarning: lastDomain
      ? `${d.domain} is the last domain on the list. Removing it opens sign-up to everyone: anyone will be able to sign in. Remove it anyway?`
      : `Remove ${d.domain}? People with ${d.domain} e-mails won't be able to sign in unless they're whitelisted.`,
    view: (
      <EntryView
        value={`@${d.domain}`}
        note={d.note}
        createdAt={d.created_at}
        creator={d.created_by ? people.get(d.created_by) : undefined}
      />
    ),
  }));

  const emailRows: CrudRow[] = emails.map((e) => ({
    id: e.id,
    name: e.email,
    values: initialValues(EMAIL_FIELDS, e),
    deleteWarning: `Remove ${e.email} from the whitelist? They can still sign in if their domain is allowed.`,
    view: (
      <EntryView
        value={e.email}
        note={e.note}
        createdAt={e.created_at}
        creator={e.created_by ? people.get(e.created_by) : undefined}
      />
    ),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div className="space-y-4">
        <PageHeader title={TITLE} description={RULE}>
          <a href="#domains" className="btn btn-secondary">
            Domains
          </a>
          <a href="#emails" className="btn btn-secondary">
            E-mails
          </a>
        </PageHeader>

        {domains.length === 0 ? (
          <Callout tone="warning">
            <strong>Sign-up is open to everyone.</strong> Add a domain to limit it.
          </Callout>
        ) : (
          <Callout tone="good">
            <strong>Sign-in is limited</strong> to {plural(domains.length, "domain")} and{" "}
            {plural(emails.length, "whitelisted e-mail")}, plus superadmins.
          </Callout>
        )}

        <AccessChecker
          domains={domains.map((d) => d.domain)}
          emails={emails.map((e) => e.email)}
          superadmins={superadminEmails}
        />
      </div>

      <Section id="domains" title="Allowed sign-up domains" count={domains.length}>
        <CreatePanel fields={DOMAIN_FIELDS} noun="domain" createAction={createDomain} />
        <CrudList
          rows={domainRows}
          fields={DOMAIN_FIELDS}
          noun="domain"
          label="Allowed sign-up domains"
          updateAction={updateDomain}
          deleteAction={deleteDomain}
          empty={
            <EmptyState icon="🌐" title="No domains yet">
              <p>Add one, like columbia.edu, to allow only those e-mails.</p>
            </EmptyState>
          }
        />
      </Section>

      <Section id="emails" title="Whitelisted e-mails" count={emails.length}>
        <CreatePanel fields={EMAIL_FIELDS} noun="e-mail" createAction={createEmail} title="Whitelist an e-mail" />
        <CrudList
          rows={emailRows}
          fields={EMAIL_FIELDS}
          noun="e-mail"
          label="Whitelisted e-mails"
          updateAction={updateEmail}
          deleteAction={deleteEmail}
          empty={
            <EmptyState icon="✉️" title="No whitelisted e-mails">
              <p>Add someone whose domain isn&apos;t on the list, like a guest reviewer.</p>
            </EmptyState>
          }
        />
      </Section>
    </div>
  );
}
