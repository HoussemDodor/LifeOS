import {
  CalendarDays,
  Flame,
  HeartPulse,
  Receipt,
  Sun,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Every area of LifeOS is a module. To add one:
 *   1. create src/modules/<id>/ (types, data access, components)
 *   2. add a route at src/app/(app)/<id>/page.tsx
 *   3. register it below
 * The sidebar and the home screen read from this list, so nothing else changes.
 */
export type ModuleStatus = "live" | "planned";

export interface LifeModule {
  id: string;
  name: string;
  /** One word for the phone tab bar. */
  short: string;
  href: string;
  icon: LucideIcon;
  status: ModuleStatus;
  description: string;
  /** Pages inside the module, shown as tabs at the top of each of them. */
  sections?: { name: string; href: string }[];
}

export const modules: LifeModule[] = [
  { id: "today", name: "Today", short: "Today", href: "/", icon: Sun, status: "live", description: "Your day at a glance" },
  { id: "inbox", name: "Inbox & agenda", short: "Inbox", href: "/inbox", icon: CalendarDays, status: "live", description: "Outlook mail summaries and meetings" },
  { id: "finance", name: "Finance", short: "Finance", href: "/finance", icon: Wallet, status: "live",
    description: "ING, DEGIRO and Bitvavo",
    sections: [
      { name: "Overview", href: "/finance" },
      { name: "Check-in", href: "/finance/checkin" },
      { name: "Coach", href: "/finance/coach" },
      { name: "Portfolio", href: "/finance/portfolio" },
    ],
  },
  { id: "health", name: "Health & training", short: "Health", href: "/health", icon: HeartPulse, status: "live", description: "Gym schedule; Hevy and Apple Health later" },
  { id: "habits", name: "Habits", short: "Habits", href: "/habits", icon: Flame, status: "live", description: "Daily habits and streaks" },
  { id: "goals", name: "Goals & journal", short: "Goals", href: "/goals", icon: Target, status: "planned", description: "Goals, daily notes and reflections" },
  { id: "bills", name: "Subscriptions", short: "Bills", href: "/bills", icon: Receipt, status: "planned", description: "Recurring costs found in your transactions" },
];
