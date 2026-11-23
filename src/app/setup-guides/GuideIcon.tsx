import {
  BellRing,
  HandCoins,
  MonitorPlay,
  Rocket,
  Send,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { GuideIconName } from "./guides";

const icons: Record<GuideIconName, LucideIcon> = {
  rocket: Rocket,
  monitor: MonitorPlay,
  "hand-coins": HandCoins,
  bell: BellRing,
  trophy: Trophy,
  send: Send,
};

type GuideIconProps = {
  name: GuideIconName;
  className?: string;
  size?: number;
};

export function GuideIcon({ name, className, size = 20 }: GuideIconProps) {
  const Icon = icons[name];

  return (
    <Icon
      aria-hidden="true"
      className={className}
      size={size}
      strokeWidth={1.8}
    />
  );
}
