import { Prisma } from "@prisma/client";
import type { z } from "zod";

import { prisma } from "@database/prisma";
import { confirmImportSchema, importRowSchema, previewImportSchema } from "@dto/import.dto";
import { AppError } from "@utils/AppError";
import {
  canonicalMerchant,
  computeImportFingerprint,
  deriveStatementAmounts,
  IMPORT_ADAPTER,
  ImportCurrency,
} from "./import-core";

type ImportRow = z.infer<typeof importRowSchema>;
type PreviewImportDto = z.infer<typeof previewImportSchema>;
type ConfirmImportDto = z.infer<typeof confirmImportSchema>;

export interface ImportPreview {
  adapter: typeof IMPORT_ADAPTER;
  validCount: number;
  duplicateCount: number;
  rejected: Array<{ rowNumber: number; code: string; message: string }>;
  merchantGroups: Array<{
    key: string;
    displayName: string;
    rowCount: number;
    suggestedCategoryId: string;
    suggestionSource: "explicit" | "history" | "fallback";
  }>;
}

export interface ImportRepository {
  findStoredFingerprints(userId: string, fingerprints: readonly string[]): Promise<Set<string>>;
  findRecentMerchantCategories(
    userId: string,
    merchantKeys: readonly string[],
  ): Promise<readonly { merchantKey: string; categoryId: string }[]>;
  findExistingCategoryIds(categoryIds: readonly string[]): Promise<Set<string>>;
  resolveFallbackCategory(): Promise<string>;
}

export interface ImportTransactionRow {
  type: "EXPENSE";
  amount: number;
  currency: ImportCurrency;
  exchangeRate: number;
  amountBase: number;
  merchant: string;
  merchantKey: string;
  occurredAt: Date;
  categoryId: string;
  userId: string;
  importBatchId: string;
  sourceFingerprint: string;
}

export interface ImportTransactionRepository extends ImportRepository {
  createBatch(data: {
    adapter: typeof IMPORT_ADAPTER;
    userId: string;
    importedCount: number;
    skippedCount: number;
    rejectedCount: number;
  }): Promise<{ id: string }>;
  createTransactions(rows: readonly ImportTransactionRow[]): Promise<number>;
  updateBatchCounts(
    id: string,
    userId: string,
    counts: { importedCount: number; skippedCount: number; rejectedCount: number },
  ): Promise<void>;
  deleteOwnedBatch(id: string, userId: string): Promise<boolean>;
}

export interface ImportWriteRepository extends ImportRepository {
  transaction<T>(work: (repository: ImportTransactionRepository) => Promise<T>): Promise<T>;
}

export function prepareRows(userId: string, rows: ImportRow[]) {
  const seen = new Set<string>();
  return rows.map((row) => {
    const fingerprint = computeImportFingerprint(userId, {
      adapter: IMPORT_ADAPTER,
      ...row,
    });
    const duplicateInPayload = seen.has(fingerprint);
    seen.add(fingerprint);
    return {
      row,
      fingerprint,
      merchantKey: canonicalMerchant(row.merchant),
      duplicateInPayload,
    };
  });
}

type ImportPrismaClient = Pick<
  Prisma.TransactionClient,
  "transaction" | "category" | "importBatch" | "$queryRaw"
>;

function createPrismaReadRepository(client: ImportPrismaClient): ImportRepository {
  return {
    async findStoredFingerprints(userId, fingerprints) {
      if (fingerprints.length === 0) return new Set();
      const stored = await client.transaction.findMany({
        where: { userId, sourceFingerprint: { in: [...fingerprints] } },
        select: { sourceFingerprint: true },
      });
      return new Set(
        stored.flatMap(({ sourceFingerprint }) => sourceFingerprint ? [sourceFingerprint] : []),
      );
    },

    async findRecentMerchantCategories(userId, merchantKeys) {
      const relevantKeys = [...new Set(merchantKeys)].slice(0, 5_000);
      if (relevantKeys.length === 0) return [];

      return client.$queryRaw<Array<{ merchantKey: string; categoryId: string }>>(Prisma.sql`
        SELECT DISTINCT ON (t."merchantKey")
          t."merchantKey",
          t."categoryId"
        FROM "Transaction" AS t
        WHERE t."userId" = ${userId}
          AND t."merchantKey" IN (${Prisma.join(relevantKeys)})
        ORDER BY
          t."merchantKey" ASC,
          t."occurredAt" DESC,
          t."createdAt" DESC,
          t."id" DESC
        LIMIT ${relevantKeys.length}
      `);
    },

    async findExistingCategoryIds(categoryIds) {
      if (categoryIds.length === 0) return new Set();
      const categories = await client.category.findMany({
        where: { id: { in: [...categoryIds] } },
        select: { id: true },
      });
      return new Set(categories.map(({ id }) => id));
    },

    async resolveFallbackCategory() {
      const category = await client.category.upsert({
        where: { name: "אחר" },
        create: { name: "אחר" },
        update: {},
        select: { id: true },
      });
      return category.id;
    },
  };
}

function createPrismaTransactionRepository(
  client: Prisma.TransactionClient,
): ImportTransactionRepository {
  return {
    ...createPrismaReadRepository(client),
    async createBatch(data) {
      return client.importBatch.create({ data, select: { id: true } });
    },
    async createTransactions(rows) {
      if (rows.length === 0) return 0;
      const result = await client.transaction.createMany({ data: [...rows], skipDuplicates: true });
      return result.count;
    },
    async updateBatchCounts(id, userId, counts) {
      await client.importBatch.update({ where: { id_userId: { id, userId } }, data: counts });
    },
    async deleteOwnedBatch(id, userId) {
      const result = await client.importBatch.deleteMany({ where: { id, userId } });
      return result.count === 1;
    },
  };
}

export function createPrismaImportRepository(client: typeof prisma): ImportWriteRepository {
  return {
    ...createPrismaReadRepository(client),
    transaction(work) {
      return client.$transaction((transactionClient) =>
        work(createPrismaTransactionRepository(transactionClient)),
      );
    },
  };
}

export const prismaImportRepository = createPrismaImportRepository(prisma);

interface CategorizedCandidate {
  row: ImportRow;
  fingerprint: string;
  merchantKey: string;
  categoryId: string;
}

async function analyzeRows(
  repository: ImportRepository,
  baseCurrency: ImportCurrency,
  userId: string,
  dto: PreviewImportDto,
) {
  const rejected: ImportPreview["rejected"] = [];
  const amountValidRows: ImportRow[] = [];

  for (const row of dto.rows) {
    try {
      deriveStatementAmounts(row, baseCurrency);
      amountValidRows.push(row);
    } catch {
      const chargedCurrencyMismatch = row.chargedCurrency !== baseCurrency;
      rejected.push({
        rowNumber: row.rowNumber,
        code: chargedCurrencyMismatch ? "CHARGED_CURRENCY_MISMATCH" : "INVALID_ROW",
        message: chargedCurrencyMismatch
          ? "Charged currency does not match the configured base currency"
          : "Row contains an unsupported amount",
      });
    }
  }

  const prepared = prepareRows(userId, amountValidRows);
  const uniqueFingerprints = [...new Set(prepared.map(({ fingerprint }) => fingerprint))];
  const relevantMerchantKeys = [...new Set(prepared.map(({ merchantKey }) => merchantKey))];
  const relevantMerchantKeySet = new Set(relevantMerchantKeys);
  const explicitMappings = new Map<string, string>();
  for (const [merchant, categoryId] of Object.entries(dto.categoryMappings)) {
    const merchantKey = canonicalMerchant(merchant);
    if (relevantMerchantKeySet.has(merchantKey)) explicitMappings.set(merchantKey, categoryId);
  }
  const mappedCategoryIds = [...new Set(explicitMappings.values())];

  const [storedFingerprints, history, existingCategoryIds] = await Promise.all([
    repository.findStoredFingerprints(userId, uniqueFingerprints),
    repository.findRecentMerchantCategories(userId, relevantMerchantKeys),
    repository.findExistingCategoryIds(mappedCategoryIds),
  ]);

  const latestCategoryByMerchant = new Map<string, string>();
  for (const item of history) {
    if (
      relevantMerchantKeySet.has(item.merchantKey)
      && !latestCategoryByMerchant.has(item.merchantKey)
    ) {
      latestCategoryByMerchant.set(item.merchantKey, item.categoryId);
    }
  }

  let duplicateCount = 0;
  const categoryValid = [] as typeof prepared;
  for (const candidate of prepared) {
    if (candidate.duplicateInPayload || storedFingerprints.has(candidate.fingerprint)) {
      duplicateCount += 1;
      continue;
    }
    const mappedCategoryId = explicitMappings.get(candidate.merchantKey);
    if (mappedCategoryId && !existingCategoryIds.has(mappedCategoryId)) {
      rejected.push({
        rowNumber: candidate.row.rowNumber,
        code: "INVALID_CATEGORY_MAPPING",
        message: "Mapped category does not exist",
      });
      continue;
    }
    categoryValid.push(candidate);
  }

  const needsFallback = categoryValid.some(
    ({ merchantKey }) =>
      !explicitMappings.has(merchantKey) && !latestCategoryByMerchant.has(merchantKey),
  );
  const fallbackCategoryId = needsFallback ? await repository.resolveFallbackCategory() : undefined;
  const candidates: CategorizedCandidate[] = categoryValid.map((candidate) => ({
    row: candidate.row,
    fingerprint: candidate.fingerprint,
    merchantKey: candidate.merchantKey,
    categoryId: explicitMappings.get(candidate.merchantKey)
      ?? latestCategoryByMerchant.get(candidate.merchantKey)
      ?? fallbackCategoryId!,
  }));

  rejected.sort((left, right) => left.rowNumber - right.rowNumber);
  return { candidates, duplicateCount, rejected, explicitMappings, latestCategoryByMerchant };
}

export function createImportService(
  repository: ImportRepository & Partial<ImportWriteRepository>,
  baseCurrency: ImportCurrency,
) {
  return {
    async preview(userId: string, dto: PreviewImportDto): Promise<ImportPreview> {
      const analysis = await analyzeRows(repository, baseCurrency, userId, dto);

      const grouped = new Map<string, { displayName: string; rowCount: number }>();
      for (const candidate of analysis.candidates) {
        const group = grouped.get(candidate.merchantKey);
        if (group) group.rowCount += 1;
        else grouped.set(candidate.merchantKey, { displayName: candidate.row.merchant, rowCount: 1 });
      }

      const merchantGroups: ImportPreview["merchantGroups"] = [...grouped].map(([key, group]) => {
        const explicit = analysis.explicitMappings.get(key);
        if (explicit) {
          return { key, ...group, suggestedCategoryId: explicit, suggestionSource: "explicit" };
        }
        const historical = analysis.latestCategoryByMerchant.get(key);
        if (historical) {
          return { key, ...group, suggestedCategoryId: historical, suggestionSource: "history" };
        }
        return {
          key,
          ...group,
          suggestedCategoryId: analysis.candidates.find(({ merchantKey }) => merchantKey === key)!.categoryId,
          suggestionSource: "fallback",
        };
      });

      return {
        adapter: IMPORT_ADAPTER,
        validCount: analysis.candidates.length,
        duplicateCount: analysis.duplicateCount,
        rejected: analysis.rejected,
        merchantGroups,
      };
    },

    async confirm(userId: string, dto: ConfirmImportDto) {
      if (!repository.transaction) throw new Error("Import writes are not configured");
      return repository.transaction(async (transactionRepository) => {
        const analysis = await analyzeRows(transactionRepository, baseCurrency, userId, dto);
        const batch = await transactionRepository.createBatch({
          adapter: IMPORT_ADAPTER,
          userId,
          importedCount: 0,
          skippedCount: 0,
          rejectedCount: 0,
        });
        const rows = analysis.candidates.map<ImportTransactionRow>((candidate) => {
          const amounts = deriveStatementAmounts(candidate.row, baseCurrency);
          return {
            type: "EXPENSE",
            ...amounts,
            currency: candidate.row.currency,
            merchant: candidate.row.merchant.trim(),
            merchantKey: candidate.merchantKey,
            occurredAt: new Date(candidate.row.occurredAt),
            categoryId: candidate.categoryId,
            userId,
            importBatchId: batch.id,
            sourceFingerprint: candidate.fingerprint,
          };
        }).sort((left, right) => {
          if (left.sourceFingerprint < right.sourceFingerprint) return -1;
          if (left.sourceFingerprint > right.sourceFingerprint) return 1;
          return 0;
        });
        const importedCount = await transactionRepository.createTransactions(rows);
        const skippedCount = analysis.duplicateCount + rows.length - importedCount;
        const rejectedCount = dto.rejectedRows.length + analysis.rejected.length;
        await transactionRepository.updateBatchCounts(batch.id, userId, {
          importedCount,
          skippedCount,
          rejectedCount,
        });
        return { id: batch.id, adapter: IMPORT_ADAPTER, importedCount, skippedCount, rejectedCount };
      });
    },

    async undo(userId: string, id: string): Promise<void> {
      if (!repository.transaction) throw new Error("Import writes are not configured");
      await repository.transaction(async (transactionRepository) => {
        if (!await transactionRepository.deleteOwnedBatch(id, userId)) {
          throw AppError.notFound("Import batch not found");
        }
      });
    },
  };
}

function configuredBaseCurrency(): ImportCurrency {
  const value = process.env.BASE_CURRENCY ?? "ILS";
  if (value === "ILS" || value === "USD" || value === "EUR") return value;
  throw new Error("Invalid BASE_CURRENCY");
}

export const importService = createImportService(prismaImportRepository, configuredBaseCurrency());
