import type { Briefing, NetWorthGlance, TaskItem } from "./types";

/** Placeholder content shown until Supabase and the morning routine are live. */

function at(day: Date, h: number, m = 0) {
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function ymd(day: Date, offset = 0) {
  const d = new Date(day);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function sampleBriefing(day: Date): Briefing {
  return {
    date: ymd(day),
    generatedAt: at(day, 7, 0),
    prose:
      "Three meetings today, the first at 9:30. Two emails need a reply before the design review this afternoon, and the invoice from your accountant is due Friday. Eleven newsletters came in overnight; none needed anything from you.",
    skippedCount: 11,
    events: [
      { id: "e1", title: "Weekly planning", start: at(day, 9, 30), end: at(day, 10, 15), location: "Teams", relatedEmailIds: ["m1"] },
      { id: "e2", title: "Lunch", start: at(day, 12, 30), end: at(day, 13, 30) },
      { id: "e3", title: "Design review", start: at(day, 14, 0), end: at(day, 15, 30), location: "Office", relatedEmailIds: ["m2"] },
      { id: "e4", title: "Gym", start: at(day, 18, 30), end: at(day, 19, 45) },
    ],
    emails: [
      { id: "m1", from: "Project team", subject: "Agenda for weekly planning", summary: "Asks you to add your two priorities for this week before the call.", needsAction: true },
      { id: "m2", from: "Studio", subject: "Review deck v3", summary: "New version of the deck; wants comments on slides 4–7 before 14:00.", needsAction: true },
      { id: "m3", from: "Accountant", subject: "Invoice Q4", summary: "Invoice attached, payment due Friday.", needsAction: true },
      { id: "m4", from: "ING", subject: "Your statement is ready", summary: "Monthly statement available in the app.", needsAction: false },
    ],
  };
}

export function sampleTasks(day: Date): TaskItem[] {
  return [
    { id: "t1", title: "Add two priorities to the planning agenda", due: ymd(day), done: false, fromEmail: true },
    { id: "t2", title: "Comment on review deck slides 4–7", due: ymd(day), done: false, fromEmail: true },
    { id: "t3", title: "Pay accountant invoice", due: ymd(day, 1), done: false, fromEmail: true },
    { id: "t4", title: "Book dentist appointment", due: ymd(day, 4), done: false, fromEmail: false },
  ];
}

export function sampleNetWorth(): NetWorthGlance {
  const history: number[] = [];
  let v = 48200;
  for (let i = 0; i < 30; i++) {
    v += Math.round(Math.sin(i / 3) * 180 + 60);
    history.push(v);
  }
  return { total: history.at(-1)!, change30d: history.at(-1)! - history[0], currency: "EUR", history };
}
