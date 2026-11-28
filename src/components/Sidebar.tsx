"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { modules } from "@/modules/registry";
import { AiUsage, type AiUsageProps } from "./AiUsage";

const live = modules.filter((m) => m.status === "live");
const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

function SignOut({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        aria-label={compact ? "Sign out" : undefined}
        className={`flex items-center gap-2.5 rounded-md text-sm text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-dawn ${
          compact ? "p-2" : "px-2 py-1.5"
        }`}
      >
        <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {!compact && "Sign out"}
      </button>
    </form>
  );
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md px-2 text-[15px] font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-dawn">
      <span className="size-2.5 rounded-full bg-dawn" aria-hidden="true" />
      LifeOS
    </Link>
  );
}

/**
 * Desktop: a sidebar with the modules, the AI meter and sign out.
 * Phone: a slim header (logo, AI spend, sign out) and a tab bar at the bottom,
 * within thumb reach, with every module visible at once.
 */
export function Sidebar({ ai }: { ai: AiUsageProps | null }) {
  const path = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <nav
        aria-label="Modules"
        className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r border-line px-3 py-6 md:flex"
      >
        <div className="mb-8">
          <Logo />
        </div>
        {live.map((m) => {
          const active = isActive(m.href, path);
          const Icon = m.icon;
          return (
            <Link
              key={m.id}
              href={m.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-dawn ${
                active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface hover:text-text"
              }`}
            >
              <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {m.name}
            </Link>
          );
        })}
        <div className="mt-auto">
          {ai && <AiUsage {...ai} />}
          <SignOut />
        </div>
      </nav>

      {/* Phone header */}
      <header className="flex items-center justify-between border-b border-line px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:hidden">
        <Logo />
        <div className="flex items-center">
          {ai && <AiUsage {...ai} />}
          <SignOut compact />
        </div>
      </header>

      {/* Phone tab bar */}
      <nav
        aria-label="Modules"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${live.length}, minmax(0, 1fr))` }}>
          {live.map((m) => {
            const active = isActive(m.href, path);
            const Icon = m.icon;
            return (
              <li key={m.id}>
                <Link
                  href={m.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-dawn ${
                    active ? "text-text" : "text-faint"
                  }`}
                >
                  <Icon className="size-5" strokeWidth={active ? 2 : 1.75} aria-hidden="true" />
                  {m.short}
                  <span className={`h-0.5 w-4 rounded-full ${active ? "bg-dawn" : "bg-transparent"}`} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
