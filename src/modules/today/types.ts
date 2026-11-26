export interface AgendaEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  location?: string;
  /** Emails the morning routine linked to this meeting. */
  relatedEmailIds?: string[];
}

export interface BriefEmail {
  id: string;
  from: string;
  subject: string;
  summary: string;
  needsAction: boolean;
  webLink?: string;
}

export interface Briefing {
  date: string; // YYYY-MM-DD
  generatedAt: string; // ISO
  /** A few sentences in plain English, written by the morning routine. */
  prose: string;
  events: AgendaEvent[];
  emails: BriefEmail[];
  /** Newsletters/notifications counted but not turned into tasks. */
  skippedCount: number;
}

export interface TaskItem {
  id: string;
  title: string;
  due?: string; // YYYY-MM-DD
  done: boolean;
  fromEmail: boolean;
  url?: string;
}

export interface NetWorthGlance {
  total: number;
  change30d: number;
  currency: "EUR";
  history: number[]; // last 30 daily totals
}
