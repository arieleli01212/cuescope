// Optional, opt-in AI-assisted merchant categorization. Disabled unless an
// OpenRouter API key is configured (see configuredCategorySuggester below).
// Only the merchant name and the household's own category names are ever
// sent to the model - never amounts, dates, or any other transaction data.

const SYSTEM_PROMPT =
  "You classify a merchant name into exactly one category from a given list, "
  + "or NONE if no category is a good match. Reply with only the category "
  + "name exactly as given, or NONE, and nothing else.";

export interface AiCategorySuggester {
  suggest(merchant: string, categoryNames: readonly string[]): Promise<string | null>;
}

export function buildCategorySuggestionMessages(merchant: string, categoryNames: readonly string[]) {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Merchant: ${merchant}\nCategories: ${categoryNames.join(", ")}` },
  ];
}

export function parseCategorySuggestion(
  reply: string | null | undefined,
  categoryNames: readonly string[],
): string | null {
  if (!reply) return null;
  const trimmed = reply.trim();
  if (!trimmed || trimmed.toUpperCase() === "NONE") return null;
  return categoryNames.find((name) => name.trim() === trimmed) ?? null;
}

export const noopCategorySuggester: AiCategorySuggester = {
  async suggest() {
    return null;
  },
};

export function createOpenRouterCategorySuggester(options: {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): AiCategorySuggester {
  const { apiKey, model, timeoutMs = 8_000, fetchImpl = fetch } = options;

  return {
    async suggest(merchant, categoryNames) {
      if (categoryNames.length === 0) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: buildCategorySuggestionMessages(merchant, categoryNames),
            max_tokens: 20,
            temperature: 0,
          }),
          signal: controller.signal,
        });
        if (!response.ok) return null;

        const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        return parseCategorySuggestion(data.choices?.[0]?.message?.content, categoryNames);
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

const DEFAULT_MODEL = "minimax/minimax-m3:free";

export function configuredCategorySuggester(): AiCategorySuggester {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return noopCategorySuggester;
  return createOpenRouterCategorySuggester({
    apiKey,
    model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
  });
}
