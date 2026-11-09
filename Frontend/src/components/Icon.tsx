// The shop's icons, from Lucide (the same set the admin portal uses).
// Pages ask for an icon by name, so swapping a picture means changing one line here.
// Only the icons listed below end up in the build.

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Headset,
  Mail,
  MapPin,
  Minus,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  TriangleAlert,
  Truck,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  bag: ShoppingBag,
  headset: Headset,
  phone: Phone,
  mail: Mail,
  pin: MapPin,
  clock: Clock,
  truck: Truck,
  store: Store,
  wallet: Wallet,
  shield: ShieldCheck,
  sparkles: Sparkles,
  search: Search,
  sort: ArrowUpDown,
  check: Check,
  plus: Plus,
  minus: Minus,
  close: X,
  alert: TriangleAlert,
  arrow: ArrowRight,
  back: ArrowLeft,
  chevron: ChevronRight,
  down: ChevronDown,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "", size }: { name: IconName; className?: string; size?: number }) {
  const C = ICONS[name];
  return <C className={`icon ${className}`} size={size} strokeWidth={1.9} absoluteStrokeWidth aria-hidden="true" />;
}
