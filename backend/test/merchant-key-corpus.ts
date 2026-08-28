export const merchantCanonicalizationCorpus = [
  { input: " \tDemo\n\v\f\r SHOP  ", expected: "demo shop" },
  { input: "\uFEFFDemo\uFEFF SHOP\uFEFF", expected: "\uFEFFdemo\uFEFF shop\uFEFF" },
  { input: "\u0085Demo\u0085 SHOP\u0085", expected: "\u0085demo\u0085 shop\u0085" },
  { input: "  ΟΣ  ", expected: "ΟΣ" },
  { input: "  İSTANBUL  ", expected: "İstanbul" },
] as const;
