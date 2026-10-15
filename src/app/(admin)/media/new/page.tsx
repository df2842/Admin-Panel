import Link from "next/link";
import NewMediaForm from "@/components/media/NewMediaForm";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function NewMediaPage() {
  await requireAdmin();
  const aiEnabled = !!process.env.GEMINI_API_KEY;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/media" className="btn btn-secondary">
        ← All media
      </Link>
      <header>
        <h1 className="text-2xl font-bold sm:text-3xl">New media</h1>
        <p className="mt-1 text-sm text-muted">
          Upload a photo, then let Gemini describe it and write the jokes, or write them yourself.
        </p>
      </header>
      <NewMediaForm aiEnabled={aiEnabled} />
    </div>
  );
}
