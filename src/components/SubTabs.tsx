"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A small switch between views inside one section (e.g. Analyst: Report / Ask). */
export function SubTabs({ items, label }: { items: { name: string; href: string }[]; label: string }) {
  const path = usePathname();
  const active = items
    .filter((i) => path === i.href || path.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={label} className="mb-8">
      <ul className="inline-flex rounded-md border border-line p-0.5">
        {items.map((i) => {
          const on = i.href === active;
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={`block rounded px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-dawn ${
                  on ? "bg-surface-2 text-text" : "text-muted hover:text-text"
                }`}
              >
                {i.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
