import { prisma } from "@database/prisma";
import { AppError } from "@utils/AppError";
import { UpdateCategoryDto } from "@dto/category.dto";

export const categoryService = {
  list() {
    return prisma.category.findMany({ orderBy: { name: "asc" } });
  },

  async create(name: string, group?: string) {
    // idempotent: אם הקטגוריה כבר קיימת (למשל שני בני זוג הקלידו את אותו
    // שם בו-זמנית מה-Shortcut), פשוט מחזירים את הקיימת במקום לזרוק שגיאת unique.
    const existing = await prisma.category.findUnique({ where: { name } });
    if (existing) return existing;
    return prisma.category.create({ data: { name, group } });
  },

  /** מוצא קטגוריה קיימת לפי שם, או יוצר חדשה - לשימוש כש-Shortcut שולח categoryName */
  async findOrCreateByName(name: string) {
    return this.create(name);
  },

  /**
   * קובע קטגוריה לפי בית עסק, לשימוש בזרימת ה-Transaction trigger של Apple
   * Pay (אין בחירת קטגוריה ידנית שם): אם כבר נרשמה בעבר עסקה מאותו בית עסק
   * (case-insensitive), משתמשים בקטגוריה שלה; אחרת נופלים לקטגוריית "אחר".
   */
  async resolveForMerchant(merchant: string) {
    const previous = await prisma.transaction.findFirst({
      where: { merchant: { equals: merchant, mode: "insensitive" } },
      orderBy: { occurredAt: "desc" },
      include: { category: true },
    });
    if (previous) return previous.category;
    return this.create("אחר");
  },

  async update(id: string, dto: UpdateCategoryDto) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Category not found");
    return prisma.category.update({ where: { id }, data: dto });
  },

  /**
   * מוחק קטגוריה, בתנאי שאין עסקה כלשהי (מכל תקופה) שמשתמשת בה - קטגוריה
   * היא foreign key חובה על Transaction, אז מחיקה כזו הייתה שוברת נתונים
   * היסטוריים. במקום זריקת שגיאת DB גולמית, בודקים מראש ומחזירים שגיאה ברורה.
   */
  async remove(id: string) {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Category not found");

    const inUse = await prisma.transaction.findFirst({ where: { categoryId: id } });
    if (inUse) {
      throw AppError.conflict(
        `Category "${existing.name}" has existing transactions and cannot be deleted`
      );
    }

    await prisma.category.delete({ where: { id } });
  },
};
