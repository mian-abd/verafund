import {
  Bike,
  Car,
  Gift,
  GraduationCap,
  Heart,
  Home,
  Laptop,
  PiggyBank,
  Plane,
  Shield,
  Smartphone,
  Target,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  plane: Plane,
  laptop: Laptop,
  car: Car,
  gift: Gift,
  graduationcap: GraduationCap,
  heart: Heart,
  home: Home,
  piggybank: PiggyBank,
  smartphone: Smartphone,
  bike: Bike,
  target: Target,
};

export function GoalIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const Icon = ICONS[name.replace(/[^a-z]/gi, "").toLowerCase()] ?? Target;
  return <Icon className={className} aria-hidden="true" />;
}
