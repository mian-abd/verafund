import {
  Bike,
  Briefcase,
  Car,
  Gift,
  GraduationCap,
  Heart,
  House,
  Laptop,
  PiggyBank,
  Plane,
  Shield,
  Smartphone,
  Target,
  type LucideIcon,
} from "lucide-react";

// Stored goal.icon is a lucide icon name; anything unknown falls back to Target.
export const GOAL_ICONS: Record<string, LucideIcon> = {
  Shield,
  Plane,
  Laptop,
  House,
  Car,
  GraduationCap,
  Gift,
  Heart,
  PiggyBank,
  Smartphone,
  Briefcase,
  Bike,
};

export const GOAL_ICON_NAMES = Object.keys(GOAL_ICONS);

// Friendly labels for the icon picker.
export const GOAL_ICON_LABELS: Record<string, string> = {
  Shield: "Safety net",
  Plane: "Travel",
  Laptop: "Laptop",
  House: "Home",
  Car: "Car",
  GraduationCap: "School",
  Gift: "Gift",
  Heart: "Wedding",
  PiggyBank: "Savings",
  Smartphone: "Phone",
  Briefcase: "Career",
  Bike: "Bike",
};

export function GoalIcon({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = GOAL_ICONS[name] ?? Target;
  return <Icon size={size} aria-hidden="true" />;
}
