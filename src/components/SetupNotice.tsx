import { MIGRATIONS } from "@/lib/setup";

/** Shown when a page's tables don't exist yet because a migration hasn't been run. */
export default function SetupNotice({
  migration = "week7",
  what = "This section's tables",
}: {
  migration?: keyof typeof MIGRATIONS;
  what?: string;
}) {
  return (
    <div role="status" className="card border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="font-bold">🛠️ Setup needed</p>
      <p className="mt-1 text-sm">
        {what} don&apos;t exist in the database yet. Open the Supabase SQL Editor, paste the contents of{" "}
        <code className="rounded bg-black/10 px-1">{MIGRATIONS[migration]}</code> and click Run, then reload this
        page.
      </p>
    </div>
  );
}
