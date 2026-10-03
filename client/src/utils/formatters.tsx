import React from 'react';
import {
  Landmark,
  Wallet,
  CreditCard,
  PiggyBank,
  TrendingUp,
  Car,
  Home,
  Utensils,
  ShoppingCart,
  ShoppingBag,
  Zap,
  Film,
  HeartPulse,
  GraduationCap,
  Plane,
  Repeat,
  ShieldCheck,
  User,
  Briefcase,
  Laptop,
  Building2,
  Percent,
  Gift,
  PlusCircle,
  Tag,
  MoreHorizontal,
  DollarSign,
  type LucideIcon,
} from 'lucide-react';

// Strictly MVR as Base Currency and USD ($) as Secondary Currency
export const CURRENCY_CONFIG = {
  MVR: { symbol: 'MVR ', code: 'MVR', name: 'Maldivian Rufiyaa (MVR - Base)', locale: 'en-US' },
  USD: { symbol: '$', code: 'USD', name: 'US Dollar ($ - Secondary)', locale: 'en-US' },
} as const;

export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string = 'MVR',
  hideBalances: boolean = false
): string {
  if (hideBalances) {
    return '••••••';
  }

  const num = Number(amount || 0);
  const absFormatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (currency === 'USD') {
    return `${num < 0 ? '-' : ''}$${absFormatted}`;
  }

  // Default to MVR (Base Currency)
  return `${num < 0 ? '-' : ''}MVR ${absFormatted}`;
}

export function formatSecondaryUSD(
  amountInMvr: number | string | null | undefined,
  usdToMvrRate: number | string = 15.42,
  hideBalances: boolean = false
): string {
  if (hideBalances) return '••••';
  const rate = Number(usdToMvrRate || 15.42);
  const usdVal = rate > 0 ? Number(amountInMvr || 0) / rate : 0;
  return formatCurrency(usdVal, 'USD', false);
}

export function formatDate(
  dateInput: string | Date | number | null | undefined,
  formatPref: string | Intl.DateTimeFormatOptions = 'MMM dd, yyyy'
): string {
  if (!dateInput) return '—';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '—';

  if (typeof formatPref === 'object') {
    return d.toLocaleDateString('en-US', formatPref);
  }
  if (formatPref === 'dd/MM/yyyy') {
    return d.toLocaleDateString('en-GB');
  }
  if (formatPref === 'yyyy-MM-dd') {
    return d.toISOString().split('T')[0];
  }
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const ICON_MAP: Record<string, LucideIcon> = {
  landmark: Landmark,
  wallet: Wallet,
  'credit-card': CreditCard,
  'piggy-bank': PiggyBank,
  'trending-up': TrendingUp,
  car: Car,
  home: Home,
  utensils: Utensils,
  'shopping-cart': ShoppingCart,
  'shopping-bag': ShoppingBag,
  zap: Zap,
  film: Film,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  plane: Plane,
  repeat: Repeat,
  'shield-check': ShieldCheck,
  user: User,
  briefcase: Briefcase,
  laptop: Laptop,
  'building-2': Building2,
  percent: Percent,
  gift: Gift,
  'plus-circle': PlusCircle,
  tag: Tag,
  'more-horizontal': MoreHorizontal,
};

export interface DynamicIconProps {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}

export function DynamicIcon({ name, className = 'w-5 h-5', style }: DynamicIconProps) {
  const IconComp = ICON_MAP[name] || DollarSign;
  return React.createElement(IconComp, { className, style });
}
