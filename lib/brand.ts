// Merchant → logo domain and brand color lookups, shared by server and client components.

const NAME_TO_DOMAIN: Record<string, string> = {
  netflix: "netflix.com",
  spotify: "spotify.com",
  "planet fitness": "planetfitness.com",
  "adobe creative cloud": "adobe.com",
  adobe: "adobe.com",
  "icloud+": "apple.com",
  icloud: "apple.com",
  apple: "apple.com",
  "new york times": "nytimes.com",
  "amazon prime": "amazon.com",
  amazon: "amazon.com",
  hulu: "hulu.com",
  "disney+": "disneyplus.com",
  disney: "disneyplus.com",
  max: "max.com",
  "youtube premium": "youtube.com",
  youtube: "youtube.com",
  calm: "calm.com",
  headspace: "headspace.com",
  duolingo: "duolingo.com",
  audible: "audible.com",
  "chatgpt plus": "openai.com",
  chatgpt: "openai.com",
  openai: "openai.com",
  claude: "claude.ai",
  "xbox game pass": "xbox.com",
  xbox: "xbox.com",
  playstation: "playstation.com",
  notion: "notion.so",
  figma: "figma.com",
  github: "github.com",
  dropbox: "dropbox.com",
  slack: "slack.com",
  discord: "discord.com",
  linkedin: "linkedin.com",
  peloton: "onepeloton.com",
};

const BRAND_COLORS: Record<string, string> = {
  netflix: "#E50914",
  spotify: "#1DB954",
  "planet fitness": "#5A2D82",
  adobe: "#FF0000",
  apple: "#6E6E73",
  "new york times": "#1A1A1A",
  amazon: "#FF9900",
  hulu: "#1CE783",
  disney: "#113CCF",
  max: "#002BE7",
  youtube: "#FF0033",
  calm: "#4E7CF6",
  headspace: "#F47D31",
  duolingo: "#58CC02",
  audible: "#F8991C",
  openai: "#10A37F",
  chatgpt: "#10A37F",
  claude: "#D97757",
  xbox: "#107C10",
  playstation: "#003791",
  notion: "#191919",
  figma: "#A259FF",
  github: "#24292F",
  dropbox: "#0061FF",
  slack: "#4A154B",
  discord: "#5865F2",
  linkedin: "#0A66C2",
  peloton: "#181A1D",
};

function lookup<T>(table: Record<string, T>, name: string): T | null {
  const lower = name.toLowerCase().trim();
  if (table[lower]) return table[lower];
  for (const [key, value] of Object.entries(table)) {
    if (lower.includes(key) || (lower.length >= 4 && key.includes(lower))) return value;
  }
  return null;
}

export function inferDomain(name: string): string | null {
  return lookup(NAME_TO_DOMAIN, name);
}

export function getBrandColor(name: string): string {
  const known = lookup(BRAND_COLORS, name);
  if (known) return known;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash % 360)}, 55%, 42%)`;
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
