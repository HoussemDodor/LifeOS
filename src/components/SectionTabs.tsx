"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { modules } from "@/modules/registry";

/**
 * Tabs for the pages inside a module (e.g. Finance: Overview, Check-in, Coach,
 * Portfolio). Lets you move between them directly instead of going back first.
 */
export function SectionTabs({ moduleId }: { moduleId: string }) {
  const path = usePathname();
  const sections = modules.find((m) => m.id === moduleId)?.sections ?? [];
  // The longest matching href wins, so /finance/coach doesn't also light up /finance.
  const active = sections
    .filter((s) => path === s.href || path.startsWith(`${s.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const activeRef = useRef<HTMLAnchorElement>(null);
  // On narrow screens the tabs can scroll: keep the current one in view.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav aria-label="Sections" className="-mx-4 mb-8 overflow-x-auto overflow-y-hidden border-b border-line px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <ul className="flex gap-4 sm:gap-6">
        {sections.map((s) => {
          const on = s.href === active;
          return (
            <li key={s.href} className="shrink-0">
              <Link
                ref={on ? activeRef : undefined}
                href={s.href}
                aria-current={on ? "page" : undefined}
                className={`-mb-px block border-b-2 py-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dawn ${
                  on ? "border-text text-text" : "border-transparent text-muted hover:text-text"
                }`}
              >
                {s.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
