import { z } from "zod";

/**
 * A visual card the coach attaches to an answer. The coach picks the rows, but
 * every value must come from its lookups this turn (checked on the server), so
 * the picture always shows LifeOS's own numbers.
 */
export const CardSchema = z.object({
  kind: z.enum(["ranking", "months", "list"]),
  title: z.string().trim().min(1).max(80),
  rows: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        value: z.number().finite(),
        note: z.string().trim().max(80).optional(),
      }),
    )
    .min(1)
    .max(24),
  highlight: z.string().max(60).optional(),
  total: z.object({ label: z.string().trim().min(1).max(40), value: z.number().finite() }).optional(),
});
export type Card = z.infer<typeof CardSchema>;
