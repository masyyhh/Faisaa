import React from 'react';
import { Landmark, Wallet, CreditCard, PiggyBank, TrendingUp, Building2, DollarSign } from 'lucide-react';

export interface BankPreset {
  id: string;
  name: string;
  institution: string;
  color: string;
  defaultCurrency: 'MVR' | 'USD';
  keywords: string[];
}

export const BANK_PRESETS: BankPreset[] = [
  {
    id: 'bml',
    name: 'Bank of Maldives',
    institution: 'Bank of Maldives',
    color: '#E11933',
    defaultCurrency: 'MVR',
    keywords: ['bml', 'bank of maldives', 'bankofmaldives'],
  },
  {
    id: 'mib',
    name: 'Maldives Islamic Bank',
    institution: 'Maldives Islamic Bank',
    color: '#006837',
    defaultCurrency: 'MVR',
    keywords: ['mib', 'maldives islamic bank', 'maldivesislamicbank'],
  },
  {
    id: 'sbi',
    name: 'State Bank of India',
    institution: 'State Bank of India',
    color: '#0077B6',
    defaultCurrency: 'MVR',
    keywords: ['sbi', 'state bank of india', 'statebank'],
  },
  {
    id: 'mcb',
    name: 'Mauritius Commercial Bank',
    institution: 'MCB Maldives',
    color: '#0A2540',
    defaultCurrency: 'MVR',
    keywords: ['mcb', 'mauritius commercial'],
  },
  {
    id: 'boc',
    name: 'Bank of Ceylon',
    institution: 'Bank of Ceylon',
    color: '#E67E22',
    defaultCurrency: 'MVR',
    keywords: ['boc', 'bank of ceylon'],
  },
  {
    id: 'hbl',
    name: 'Habib Bank Limited',
    institution: 'Habib Bank',
    color: '#008542',
    defaultCurrency: 'MVR',
    keywords: ['hbl', 'habib bank'],
  },
  {
    id: 'wise',
    name: 'Wise',
    institution: 'Wise',
    color: '#163300',
    defaultCurrency: 'USD',
    keywords: ['wise', 'transferwise'],
  },
  {
    id: 'revolut',
    name: 'Revolut',
    institution: 'Revolut',
    color: '#191C1F',
    defaultCurrency: 'USD',
    keywords: ['revolut'],
  },
  {
    id: 'paypal',
    name: 'PayPal',
    institution: 'PayPal',
    color: '#003087',
    defaultCurrency: 'USD',
    keywords: ['paypal'],
  },
  {
    id: 'binance',
    name: 'Binance / Crypto',
    institution: 'Binance',
    color: '#F0B90B',
    defaultCurrency: 'USD',
    keywords: ['binance', 'crypto', 'bitcoin', 'usdt', 'coinbase'],
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    institution: 'Vanguard',
    color: '#96151D',
    defaultCurrency: 'USD',
    keywords: ['vanguard'],
  },
  {
    id: 'cash',
    name: 'Physical Cash',
    institution: 'Cash Wallet',
    color: '#059669',
    defaultCurrency: 'MVR',
    keywords: ['cash', 'rufiyaa cash', 'physical cash', 'wallet', 'pocket'],
  },
];

/**
 * Detect institution logo from account properties (similar to Bitwarden auto-detection)
 */
export function detectBankLogo(account?: {
  name?: string;
  institution?: string | null;
  icon?: string | null;
}): string {
  if (!account) return 'landmark';

  const iconVal = account.icon?.trim() || '';

  // If icon is an image URL, return the URL
  if (
    iconVal.startsWith('http://') ||
    iconVal.startsWith('https://') ||
    iconVal.startsWith('data:image/')
  ) {
    return iconVal;
  }

  // If icon explicitly matches preset
  if (iconVal && BANK_PRESETS.some((p) => p.id === iconVal.toLowerCase())) {
    return iconVal.toLowerCase();
  }

  // Auto-detect by searching keywords in name and institution
  const fullText = `${account.institution || ''} ${account.name || ''}`.toLowerCase();
  for (const preset of BANK_PRESETS) {
    for (const kw of preset.keywords) {
      if (fullText.includes(kw)) {
        return preset.id;
      }
    }
  }

  return iconVal || 'landmark';
}

interface AccountLogoProps {
  account?: {
    name?: string;
    institution?: string | null;
    icon?: string | null;
    color?: string;
    type?: string;
  };
  icon?: string;
  name?: string;
  institution?: string | null;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  xs: 'w-5 h-5 rounded-md text-[9px]',
  sm: 'w-6 h-6 rounded-lg text-[10px]',
  md: 'w-8 h-8 rounded-xl text-xs',
  lg: 'w-10 h-10 rounded-xl text-sm',
  xl: 'w-12 h-12 rounded-2xl text-base',
};

const ICON_SIZE_MAP = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
  xl: 'w-6 h-6',
};

export function AccountLogo({
  account,
  icon,
  name,
  institution,
  color,
  size = 'md',
  className = '',
}: AccountLogoProps) {
  const accName = name || account?.name || '';
  const accInst = institution !== undefined ? institution : account?.institution;
  const accIcon = icon || account?.icon;
  const accColor = color || account?.color || '#6366F1';

  const logoKey = detectBankLogo({
    name: accName,
    institution: accInst,
    icon: accIcon,
  });

  const sizeClass = SIZE_MAP[size] || SIZE_MAP.md;
  const iconSizeClass = ICON_SIZE_MAP[size] || ICON_SIZE_MAP.md;

  // 1. External Image URL or Favicon
  if (
    logoKey.startsWith('http://') ||
    logoKey.startsWith('https://') ||
    logoKey.startsWith('data:image/')
  ) {
    return (
      <div
        className={`relative overflow-hidden shrink-0 flex items-center justify-center bg-white dark:bg-[#151722] border border-black/10 dark:border-white/[0.08] shadow-xs ${sizeClass} ${className}`}
      >
        <img
          src={logoKey}
          alt={accName || 'Bank Logo'}
          className="w-full h-full object-contain p-1"
          onError={(e) => {
            // Fallback to text monogram on image failure
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  // 2. High-Fidelity Vector Bank Badges
  switch (logoKey) {
    case 'bml':
      return (
        <div
          title="Bank of Maldives"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#E11933] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Bank of Maldives stylized sails motif */}
            <path d="M 50 18 L 76 52 L 53 52 Z" fill="#FFFFFF" />
            <path d="M 24 52 L 47 18 L 47 52 Z" fill="#FFFFFF" />
            <path d="M 32 58 L 68 58 L 50 78 Z" fill="#FFFFFF" opacity="0.95" />
            <text
              x="50"
              y="91"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="900"
              fontSize="18"
              fill="#FFFFFF"
              textAnchor="middle"
              letterSpacing="1"
            >
              BML
            </text>
          </svg>
        </div>
      );

    case 'mib':
      return (
        <div
          title="Maldives Islamic Bank"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#006837] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {/* Islamic 8-point geometric star */}
            <g transform="translate(50, 40)">
              <rect x="-16" y="-16" width="32" height="32" rx="3" fill="#D4AF37" opacity="0.9" />
              <rect x="-16" y="-16" width="32" height="32" rx="3" fill="#FFFFFF" transform="rotate(45)" />
              <circle cx="0" cy="0" r="9" fill="#006837" />
              <circle cx="0" cy="0" r="4.5" fill="#D4AF37" />
            </g>
            <text
              x="50"
              y="85"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="900"
              fontSize="20"
              fill="#FFFFFF"
              textAnchor="middle"
              letterSpacing="1.5"
            >
              MIB
            </text>
          </svg>
        </div>
      );

    case 'sbi':
      return (
        <div
          title="State Bank of India"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#0077B6] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle cx="50" cy="45" r="25" fill="#FFFFFF" />
            <circle cx="50" cy="45" r="13.5" fill="#0077B6" />
            <rect x="46" y="45" width="8" height="23" fill="#0077B6" />
            <text
              x="50"
              y="88"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="900"
              fontSize="16"
              fill="#FFFFFF"
              textAnchor="middle"
              letterSpacing="1"
            >
              SBI
            </text>
          </svg>
        </div>
      );

    case 'mcb':
      return (
        <div
          title="Mauritius Commercial Bank"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#0A2540] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <path d="M 28 32 L 40 18 L 48 26 L 36 40 Z" fill="#EB5A28" />
            <path d="M 44 48 L 56 34 L 64 42 L 52 56 Z" fill="#FFFFFF" />
            <path d="M 60 64 L 72 50 L 80 58 L 68 72 Z" fill="#EB5A28" />
            <text
              x="50"
              y="89"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="900"
              fontSize="17"
              fill="#FFFFFF"
              textAnchor="middle"
              letterSpacing="1"
            >
              MCB
            </text>
          </svg>
        </div>
      );

    case 'boc':
      return (
        <div
          title="Bank of Ceylon"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#E67E22] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle cx="50" cy="42" r="22" fill="#000000" opacity="0.15" />
            <path d="M 38 48 L 42 32 L 50 40 L 58 32 L 62 48 Z" fill="#FFFFFF" />
            <text
              x="50"
              y="85"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="900"
              fontSize="18"
              fill="#FFFFFF"
              textAnchor="middle"
              letterSpacing="1"
            >
              BOC
            </text>
          </svg>
        </div>
      );

    case 'hbl':
      return (
        <div
          title="Habib Bank Limited"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#008542] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <circle cx="50" cy="42" r="20" fill="none" stroke="#FFFFFF" strokeWidth="4" />
            <path d="M 40 42 L 60 42 M 50 32 L 50 52" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
            <text
              x="50"
              y="85"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="900"
              fontSize="18"
              fill="#FFFFFF"
              textAnchor="middle"
              letterSpacing="1"
            >
              HBL
            </text>
          </svg>
        </div>
      );

    case 'wise':
      return (
        <div
          title="Wise"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#163300] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <path
              d="M 28 68 L 46 26 L 62 26 L 50 52 L 74 52 L 40 82 L 44 68 Z"
              fill="#9FE870"
            />
          </svg>
        </div>
      );

    case 'revolut':
      return (
        <div
          title="Revolut"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#191C1F] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <path
              d="M 32 24 L 56 24 C 67 24 73 29 73 38 C 73 45 68 50 60 52 L 74 76 L 60 76 L 47 55 L 43 55 L 43 76 L 32 76 Z M 43 45 L 54 45 C 59 45 62 43 62 38 C 62 34 59 33 54 33 L 43 33 Z"
              fill="#FFFFFF"
            />
          </svg>
        </div>
      );

    case 'paypal':
      return (
        <div
          title="PayPal"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#003087] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <path
              d="M 34 22 L 54 22 C 63 22 67 27 66 34 C 65 42 60 46 52 46 L 43 46 L 39 74 L 30 74 Z"
              fill="#0079C1"
            />
            <path
              d="M 43 34 L 63 34 C 72 34 76 39 75 46 C 74 54 69 58 61 58 L 52 58 L 48 80 L 39 80 Z"
              fill="#00457C"
              opacity="0.9"
            />
          </svg>
        </div>
      );

    case 'binance':
      return (
        <div
          title="Binance"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#1E2026] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <g fill="#F0B90B">
              <polygon points="50,18 64,32 50,46 36,32" />
              <polygon points="50,54 64,68 50,82 36,68" />
              <polygon points="24,44 38,58 24,72 10,58" />
              <polygon points="76,44 90,58 76,72 62,58" />
            </g>
          </svg>
        </div>
      );

    case 'vanguard':
      return (
        <div
          title="Vanguard"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#96151D] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <path d="M 50 22 L 66 60 L 50 54 L 34 60 Z" fill="#FFFFFF" />
            <text
              x="50"
              y="82"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="900"
              fontSize="12.5"
              fill="#FFFFFF"
              textAnchor="middle"
              letterSpacing="0.8"
            >
              VANGUARD
            </text>
          </svg>
        </div>
      );

    case 'cash':
      return (
        <div
          title="Physical Cash"
          className={`shrink-0 overflow-hidden flex items-center justify-center bg-[#059669] shadow-xs select-none ${sizeClass} ${className}`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <rect x="18" y="26" width="64" height="42" rx="6" fill="none" stroke="#FFFFFF" strokeWidth="4.5" />
            <circle cx="50" cy="47" r="10" fill="none" stroke="#FFFFFF" strokeWidth="3.5" />
            <text
              x="50"
              y="85"
              fontFamily="system-ui, -apple-system, sans-serif"
              fontWeight="900"
              fontSize="14"
              fill="#FFFFFF"
              textAnchor="middle"
              letterSpacing="1"
            >
              MVR
            </text>
          </svg>
        </div>
      );

    // 3. Bitwarden-style Generic Institution Monogram or Icon
    default: {
      const initials = (accInst || accName || 'AC')
        .split(' ')
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

      const FallbackIcon =
        logoKey === 'wallet'
          ? Wallet
          : logoKey === 'credit-card'
          ? CreditCard
          : logoKey === 'piggy-bank'
          ? PiggyBank
          : logoKey === 'trending-up'
          ? TrendingUp
          : logoKey === 'building-2'
          ? Building2
          : Landmark;

      return (
        <div
          title={accInst || accName}
          className={`shrink-0 flex items-center justify-center border font-bold font-display shadow-xs transition-transform ${sizeClass} ${className}`}
          style={{
            backgroundColor: `${accColor}18`,
            color: accColor,
            borderColor: `${accColor}35`,
          }}
        >
          {initials && initials.length > 0 && !logoKey.includes('-') && logoKey !== 'landmark' ? (
            <span className="font-bold tracking-tight">{initials}</span>
          ) : (
            <FallbackIcon className={iconSizeClass} />
          )}
        </div>
      );
    }
  }
}

export default AccountLogo;

