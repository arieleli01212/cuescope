import { Prisma, TransactionType } from "@prisma/client";
import { prisma } from "@database/prisma";
import { getRateToBase } from "./exchangeRate.service";
import { categoryService } from "./category.service";
import { AppError } from "@utils/AppError";
import { CreateTransactionDto, ListTransactionsQuery, UpdateTransactionDto } from "@dto/transaction.dto";
import { normalizedMerchantKey } from "./import-core";

/** תחילת/סוף חודש לפי מחרוזת "YYYY-MM", ב-UTC (מספיק לדיווח חודשי) */
function monthRange(month: string): { start: Date; end: Date } {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, mon - 1, 1));
  const end = new Date(Date.UTC(year, mon, 1));
  return { start, end };
}

export const transactionService = {
  async create(userId: string, dto: CreateTransactionDto) {
    const category = dto.categoryId
      ? await prisma.category.findUniqueOrThrow({ where: { id: dto.categoryId } }).catch(() => {
          throw AppError.notFound("Category not found");
        })
      : dto.categoryName
      ? await categoryService.findOrCreateByName(dto.categoryName)
      : await categoryService.resolveForMerchant(dto.merchant!);

    const exchangeRate = await getRateToBase(dto.currency);
    const amountBase = new Prisma.Decimal(dto.amount).mul(exchangeRate);

    return prisma.transaction.create({
      data: {
        type: dto.type,
        amount: dto.amount,
        currency: dto.currency,
        exchangeRate,
        amountBase,
        note: dto.note,
        merchant: dto.merchant,
        merchantKey: normalizedMerchantKey(dto.merchant),
        occurredAt: dto.occurredAt ?? new Date(),
        categoryId: category.id,
        userId,
      },
      include: { category: true, user: { select: { id: true, name: true } } },
    });
  },

  async update(id: string, dto: UpdateTransactionDto) {
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Transaction not found");

    // אם משנים סכום/מטבע, מחשבים מחדש את amountBase עם שער עדכני
    let amountBase = existing.amountBase;
    let exchangeRate = existing.exchangeRate;
    if (dto.amount !== undefined || dto.currency !== undefined) {
      const currency = dto.currency ?? existing.currency;
      const amount = dto.amount ?? Number(existing.amount);
      exchangeRate = new Prisma.Decimal(await getRateToBase(currency));
      amountBase = new Prisma.Decimal(amount).mul(exchangeRate);
    }

    const merchantKeyData = dto.merchant !== undefined
      ? { merchantKey: normalizedMerchantKey(dto.merchant) }
      : {};

    return prisma.transaction.update({
      where: { id },
      data: { ...dto, ...merchantKeyData, exchangeRate, amountBase },
      include: { category: true, user: { select: { id: true, name: true } } },
    });
  },

  async remove(id: string) {
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (!existing) throw AppError.notFound("Transaction not found");
    await prisma.transaction.delete({ where: { id } });
  },

  list(query: ListTransactionsQuery) {
    const where: Prisma.TransactionWhereInput = {};
    if (query.month) {
      const { start, end } = monthRange(query.month);
      where.occurredAt = { gte: start, lt: end };
    }
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.userId) where.userId = query.userId;
    if (query.type) where.type = query.type as TransactionType;

    return prisma.transaction.findMany({
      where,
      include: { category: true, user: { select: { id: true, name: true } } },
      orderBy: { occurredAt: "desc" },
    });
  },

  /**
   * דוח חודשי: סה"כ הכנסות/הוצאות/מאזן, פירוט לפי קטגוריה ולפי נושא -
   * כל הסכומים כבר במטבע הבסיס (amountBase) כדי שאפשר יהיה לחבר בין
   * עסקאות בשקלים/דולרים/יורו בלי המרה נוספת בצד הלקוח.
   *
   * byGroup מאגד כמה קטגוריות תחת נושא רחב אחד (Category.group) - למשל
   * "מסעדות"+"מכולת"+"קפה" -> "אוכל". קטגוריה בלי group מוצגת בשמה שלה.
   */
  async summary(month: string) {
    const { start, end } = monthRange(month);
    const transactions = await prisma.transaction.findMany({
      where: { occurredAt: { gte: start, lt: end } },
      include: { category: true, user: { select: { id: true, name: true } } },
    });

    let totalIncome = new Prisma.Decimal(0);
    let totalExpense = new Prisma.Decimal(0);
    const byCategory = new Map<string, { name: string; expense: Prisma.Decimal; income: Prisma.Decimal }>();
    const byGroup = new Map<string, { expense: Prisma.Decimal; income: Prisma.Decimal }>();

    for (const t of transactions) {
      const bucket = t.type === "INCOME" ? "income" : "expense";
      if (bucket === "income") totalIncome = totalIncome.add(t.amountBase);
      else totalExpense = totalExpense.add(t.amountBase);

      const cat = byCategory.get(t.categoryId) ?? {
        name: t.category.name,
        expense: new Prisma.Decimal(0),
        income: new Prisma.Decimal(0),
      };
      cat[bucket] = cat[bucket].add(t.amountBase);
      byCategory.set(t.categoryId, cat);

      const groupName = t.category.group ?? t.category.name;
      const grp = byGroup.get(groupName) ?? { expense: new Prisma.Decimal(0), income: new Prisma.Decimal(0) };
      grp[bucket] = grp[bucket].add(t.amountBase);
      byGroup.set(groupName, grp);
    }

    return {
      month,
      totalIncome,
      totalExpense,
      balance: totalIncome.sub(totalExpense),
      byCategory: [...byCategory.entries()].map(([id, v]) => ({ categoryId: id, ...v })),
      byGroup: [...byGroup.entries()].map(([name, v]) => ({ name, ...v })),
    };
  },
};
