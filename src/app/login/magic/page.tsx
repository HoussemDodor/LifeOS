export default async function MagicLinkPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form action="/api/auth/magic" method="post" className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in with email link</h1>
        <p className="mt-2 text-muted">After signing in, add a new passkey so you don’t need this again.</p>
        <input type="hidden" name="token" value={token} />
        <button className="mt-8 w-full rounded-md bg-dawn px-4 py-2.5 font-medium text-ink hover:bg-dawn/90">
          Sign in
        </button>
      </form>
    </main>
  );
}
