// Shared option lists for the transactions page, its form and its server actions.

export const PURCHASE_CATEGORIES = [
  "food",
  "transport",
  "shopping",
  "entertainment",
  "utilities",
  "subscriptions",
  "housing",
  "travel",
  "health",
  "crypto",
  "wire transfer",
  "gambling",
  "gift cards",
] as const;

export const COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "MX", name: "Mexico" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "NG", name: "Nigeria" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "CN", name: "China" },
];

export const FRAUD_EXAMPLE = {
  merchant: "CryptoVault-International.xyz",
  amount: "1250",
  category: "crypto",
  country: "RU",
} as const;

export const STATUSES = ["posted", "pending", "flagged", "blocked"] as const;
