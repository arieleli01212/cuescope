import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(50),
  // "נושא" - שם קבוצה רחבה לאיגוד בדוחות, למשל "אוכל". אופציונלי.
  group: z.string().trim().min(1).max(50).optional(),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  // null מנקה את הנושא הקיים (חזרה ל"ללא נושא")
  group: z.string().trim().min(1).max(50).nullable().optional(),
});

export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;

export const categoryIdParamsSchema = z.object({
  id: z.string().uuid(),
});
