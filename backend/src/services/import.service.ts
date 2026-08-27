import type { z } from "zod";

import { prisma } from "@database/prisma";
import { importRowSchema, previewImportSchema } from "@dto/import.dto";
import {
  canonicalMerchant,
  computeImportFingerprint,
  deriveStatementAmounts,
  IMPORT_ADAPTER,
  ImportCurrency,
} from "./import-core";

type ImportRow = z.infer<typeof importRowSchema>;
type PreviewImportDto = z.infer<typeof previewImportSchema>;

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
  findRecentMerchantCategories(): Promise<readonly { merchant: string; categoryId: string }[]>;
  findExistingCategoryIds(categoryIds: readonly string[]): Promise<Set<string>>;
  resolveFallbackCategory(): Promise<string>;
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

export const prismaImportRepository: ImportRepository = {
  async findStoredFingerprints(userId, fingerprints) {
    if (fingerprints.length === 0) return new Set();
    const stored = await prisma.transaction.findMany({
      where: { userId, sourceFingerprint: { in: [...fingerprints] } },
      select: { sourceFingerprint: true },
    });
    return new Set(stored.flatMap(({ sourceFingerprint }) => sourceFingerprint ? [sourceFingerprint] : []));
  },

  async findRecentMerchantCategories() {
    const history = await prisma.transaction.findMany({
      where: { merchant: { not: null } },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      select: { merchant: true, categoryId: true },
    });
    return history.flatMap(({ merchant, categoryId }) => merchant ? [{ merchant, categoryId }] : []);
  },

  async findExistingCategoryIds(categoryIds) {
    if (categoryIds.length === 0) return new Set();
    const categories = await prisma.category.findMany({
      where: { id: { in: [...categoryIds] } },
      select: { id: true },
    });
    return new Set(categories.map(({ id }) => id));
  },

  async resolveFallbackCategory() {
    const category = await prisma.category.upsert({
      where: { name: "אחר" },
      create: { name: "אחר" },
      update: {},
      select: { id: true },
    });
    return category.id;
  },
};

export function createImportService(repository: ImportRepository, baseCurrency: ImportCurrency) {
  return {
    async preview(userId: string, dto: PreviewImportDto): Promise<ImportPreview> {
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
      const explicitMappings = new Map(
        Object.entries(dto.categoryMappings).map(([merchant, categoryId]) => [
          canonicalMerchant(merchant),
          categoryId,
        ]),
      );
      const mappedCategoryIds = [...new Set(Object.values(dto.categoryMappings))];

      const [storedFingerprints, history, existingCategoryIds] = await Promise.all([
        repository.findStoredFingerprints(userId, uniqueFingerprints),
        repository.findRecentMerchantCategories(),
        repository.findExistingCategoryIds(mappedCategoryIds),
      ]);

      const latestCategoryByMerchant = new Map<string, string>();
      for (const item of history) {
        const key = canonicalMerchant(item.merchant);
        if (!latestCategoryByMerchant.has(key)) latestCategoryByMerchant.set(key, item.categoryId);
      }

      let duplicateCount = 0;
      const importable = [] as typeof prepared;
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
        importable.push(candidate);
      }

      const grouped = new Map<string, { displayName: string; rowCount: number }>();
      for (const candidate of importable) {
        const group = grouped.get(candidate.merchantKey);
        if (group) group.rowCount += 1;
        else grouped.set(candidate.merchantKey, { displayName: candidate.row.merchant, rowCount: 1 });
      }

      const needsFallback = [...grouped.keys()].some(
        (key) => !explicitMappings.has(key) && !latestCategoryByMerchant.has(key),
      );
      const fallbackCategoryId = needsFallback ? await repository.resolveFallbackCategory() : undefined;
      const merchantGroups: ImportPreview["merchantGroups"] = [...grouped].map(([key, group]) => {
        const explicit = explicitMappings.get(key);
        if (explicit) {
          return { key, ...group, suggestedCategoryId: explicit, suggestionSource: "explicit" };
        }
        const historical = latestCategoryByMerchant.get(key);
        if (historical) {
          return { key, ...group, suggestedCategoryId: historical, suggestionSource: "history" };
        }
        return {
          key,
          ...group,
          suggestedCategoryId: fallbackCategoryId!,
          suggestionSource: "fallback",
        };
      });

      rejected.sort((left, right) => left.rowNumber - right.rowNumber);
      return {
        adapter: IMPORT_ADAPTER,
        validCount: importable.length,
        duplicateCount,
        rejected,
        merchantGroups,
      };
    },
  };
}

function configuredBaseCurrency(): ImportCurrency {
  const value = process.env.BASE_CURRENCY ?? "ILS";
  if (value === "ILS" || value === "USD" || value === "EUR") return value;
  throw new Error("Invalid BASE_CURRENCY");
}

export const importService = createImportService(prismaImportRepository, configuredBaseCurrency());
