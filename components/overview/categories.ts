// Shared category colors and labels for the overview charts and lists.
// A restrained, slightly desaturated set that sits next to the brand orange without fighting it.

const CATEGORY_COLORS: Record<string, string> = {
  housing: "#5B6CDB",
  food: "#E8883A",
  transport: "#2B9DB8",
  entertainment: "#9A6AD6",
  shopping: "#D1568C",
  utilities: "#2FA68A",
  subscriptions: "#C79A1E",
};

const FALLBACK = ["#7CA82B", "#3A9FC4", "#D9545F", "#8A6CCB", "#2E9E78", "#CC8A2E"];

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
