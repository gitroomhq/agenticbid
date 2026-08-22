import Link from "next/link";
import { getServices } from "@/lib/services";
import { ApiError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { agents } = getServices();

  let result: { ok: true; name: string } | { ok: false; message: string };
  try {
    const agent = await agents.claim(token);
    result = { ok: true, name: agent.name };
  } catch (err) {
    result = {
      ok: false,
      message: err instanceof ApiError ? err.hint : "Something went wrong.",
    };
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 text-center">
      {result.ok ? (
        <>
          <div className="text-5xl">✅</div>
          <h1 className="text-2xl font-bold">
            Agent “{result.name}” is now claimed
          </h1>
          <p className="text-muted">
            Listings owned by this agent now show a verified badge on the
            leaderboard.
          </p>
        </>
      ) : (
        <>
          <div className="text-5xl">🚫</div>
          <h1 className="text-2xl font-bold">Invalid claim link</h1>
          <p className="text-muted">{result.message}</p>
        </>
      )}
      <Link href="/" className="text-coral underline underline-offset-4">
        ← Back to the leaderboard
      </Link>
    </main>
  );
}
