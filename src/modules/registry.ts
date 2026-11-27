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
  href: string;
  icon: LucideIcon;
  status: ModuleStatus;
  description: string;
}

export const modules: LifeModule[] = [
  { id: "today", name: "Today", href: "/", icon: Sun, status: "live", description: "Your day at a glance" },
  { id: "inbox", name: "Inbox & agenda", href: "/inbox", icon: CalendarDays, status: "live", description: "Outlook mail summaries and meetings" },
  { id: "finance", name: "Finance", href: "/finance", icon: Wallet, status: "live", description: "ING, DEGIRO and Bitvavo" },
  { id: "health", name: "Health & training", href: "/health", icon: HeartPulse, status: "live", description: "Gym schedule; Hevy and Apple Health later" },
  { id: "habits", name: "Habits", href: "/habits", icon: Flame, status: "live", description: "Daily habits and streaks" },
  { id: "goals", name: "Goals & journal", href: "/goals", icon: Target, status: "planned", description: "Goals, daily notes and reflections" },
  { id: "bills", name: "Subscriptions", href: "/bills", icon: Receipt, status: "planned", description: "Recurring costs found in your transactions" },
];
