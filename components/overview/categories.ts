// Shared category colors and labels for the overview charts and lists.

const CATEGORY_COLORS: Record<string, string> = {
  housing: "#6366F1",
  food: "#F97316",
  transport: "#0EA5E9",
  entertainment: "#A855F7",
  shopping: "#EC4899",
  utilities: "#14B8A6",
  subscriptions: "#EAB308",
};

const FALLBACK = ["#84CC16", "#06B6D4", "#F43F5E", "#8B5CF6", "#10B981", "#F59E0B"];

export function categoryColor(category: string): string {
  const known = CATEGORY_COLORS[category.toLowerCase()];
  if (known) return known;
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}

export function categoryLabel(category: string): string {
  if (!category) return "Other";
  return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, " ");
}
