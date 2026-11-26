"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { modules } from "@/modules/registry";

export function Sidebar() {
  const path = usePathname();
  const live = modules.filter((m) => m.status === "live");
  const planned = modules.filter((m) => m.status === "planned");

  return (
    <nav
      aria-label="Modules"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-4 py-3 md:sticky md:top-0 md:h-dvh md:w-56 md:flex-col md:border-b-0 md:border-r md:px-3 md:py-6"
    >
      <div className="mr-4 flex items-center gap-2 px-2 text-[15px] font-semibold tracking-tight md:mb-8 md:mr-0">
        <span className="size-2.5 rounded-full bg-dawn" aria-hidden="true" />
        LifeOS
      </div>

      {live.map((m) => {
        const active = m.href === "/" ? path === "/" : path.startsWith(m.href);
        const Icon = m.icon;
        return (
          <Link
            key={m.id}
            href={m.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
              active ? "bg-surface-2 text-text" : "text-muted hover:bg-surface hover:text-text"
            }`}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
            {m.name}
          </Link>
        );
      })}

      <div className="hidden md:mt-8 md:block">
        <p className="px-2 pb-2 text-xs text-faint">Coming later</p>
        {planned.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 text-sm text-faint">
              <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
              {m.name}
            </div>
          );
        })}
      </div>

      <form action="/api/auth/logout" method="post" className="md:mt-auto">
        <button className="flex shrink-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-faint hover:text-text">
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </button>
      </form>
    </nav>
  );
}
