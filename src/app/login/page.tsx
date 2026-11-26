import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          <span className="size-2.5 rounded-full bg-dawn" aria-hidden="true" />
          LifeOS
        </div>
        <h1 className="mt-10 font-serif text-3xl">Welcome back.</h1>
        <LoginForm initialError={error === "link" ? "That sign-in link is expired or already used. Request a new one." : undefined} />
      </div>
    </main>
  );
}
