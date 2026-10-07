export interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  source: 'history' | 'keyword';
  matchKeyword?: string;
}

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Food & Dining': [
    'coffee', 'tea', 'cafe', 'café', 'restaurant', 'lunch', 'dinner', 'breakfast',
    'pizza', 'burger', 'sub', 'kfc', 'bakery', 'takeaway', 'dine', 'short eats', 'hedhika',
    'juice', 'bistro', 'gelato', 'ice cream', 'roti', 'kottu', 'biryani', 'kitchen', 'diner',
    'bbq', 'barbeque', 'seafood', 'food court', 'strada', 'seagull', 'meraki', 'family room',
    'chicking', 'marrybrown', 'secret recipe', 'bread stall', 'crumbs', 'bake',
  ],
  'Groceries': [
    'groceries', 'grocery', 'supermart', 'redwave', 'agora', 'ihsaan', 'fantasy',
    'shoppers', 'market', 'vegetables', 'fruits', 'foodstore', 'mart', 'hypermarket',
    'convenience', 'provision', 'minimart', 'corner shop', 'sto supermart', 'bazaar',
    'produce', 'supermarket',
  ],
  'Transportation': [
    'petrol', 'fuel', 'gas', 'taxi', 'ferry', 'bus', 'flight', 'airline',
    'speed boat', 'speedboat', 'rtl', 'toll', 'parking', 'bike', 'motor',
    'cycle', 'scooter', 'cab', 'avash', 'manta', 'maldivian', 'flyme', 'villa air',
    'metro', 'garage', 'mechanic',
  ],
  'Bills & Utilities': [
    'dhiraagu', 'ooredoo', 'stelco', 'mwsc', 'medianet', 'internet', 'broadband',
    'electricity', 'water', 'utility', 'bill', 'cable', 'recharge', 'phone',
    'mobile', 'sim', 'postpaid', 'prepaid', 'fibre', 'wifi', 'rent', 'lease',
  ],
  'Healthcare': [
    'pharmacy', 'sto', 'adk', 'treetop', 'medica', 'hospital', 'clinic',
    'doctor', 'medicine', 'dental', 'consultation', 'eyecare', 'opticals',
    'dentist', 'physio', 'therapy', 'medical', 'prescription', 'supplement',
  ],
  'Entertainment': [
    'netflix', 'spotify', 'movie', 'cinema', 'schwack', 'games', 'game',
    'steam', 'playstation', 'subscription', 'youtube', 'disney', 'prime',
    'apple tv', 'audible', 'concert', 'resort day', 'outing', 'arcade',
  ],
  'Shopping': [
    'clothes', 'shoes', 'dress', 'perfume', 'cosmetics', 'electronics',
    'amazon', 'shein', 'aliexpress', 'gadget', 'souvenir', 'fashion', 'boutique',
    'apparel', 'hardware', 'veligaa', 'sonee', 'sports', 'wear', 'mall', 'store',
  ],
  'Income': [
    'salary', 'bonus', 'dividend', 'interest', 'freelance', 'client',
    'payroll', 'pension', 'allowance', 'stipend', 'consulting fee', 'payout',
    'refund', 'cashback', 'profit',
  ],
  'Education': [
    'school', 'tuition', 'course', 'college', 'university', 'mnsu', 'villa college',
    'map', 'books', 'stationery', 'academy', 'exam', 'class',
  ],
  'Personal Care': [
    'salon', 'barber', 'haircut', 'spa', 'massage', 'skincare', 'cosmetic',
    'gym', 'fitness', 'workout', 'trainer',
  ],
};

/**
 * Intelligent category detection:
 * 1. Historical payee match from user's previous transactions (highest priority)
 * 2. Keyword/merchant heuristics against system category dictionaries
 */
export function detectCategoryFromPayee(
  payeeText: string,
  categories: Array<{ id: string; name: string; type?: string }>,
  payeeHistoryMap: Record<string, { categoryId: string; categoryName: string }> = {},
  currentType: 'INCOME' | 'EXPENSE' | 'TRANSFER' = 'EXPENSE'
): CategorySuggestion | null {
  const clean = payeeText.trim().toLowerCase();
  if (!clean || clean.length < 2 || currentType === 'TRANSFER') {
    return null;
  }

  // Filter categories matching current transaction type
  const targetCategories = categories.filter((c) => !c.type || c.type === currentType);
  if (targetCategories.length === 0) return null;

  // 1. Check user's past payee associations
  // Exact match
  if (payeeHistoryMap[clean]) {
    const historical = payeeHistoryMap[clean];
    const cat = targetCategories.find((c) => c.id === historical.categoryId);
    if (cat) {
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        source: 'history',
      };
    }
  }

  // Fuzzy / substring match in history
  for (const [historyPayee, historical] of Object.entries(payeeHistoryMap)) {
    if (clean.includes(historyPayee) || historyPayee.includes(clean)) {
      const cat = targetCategories.find((c) => c.id === historical.categoryId);
      if (cat) {
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          source: 'history',
        };
      }
    }
  }

  // 2. Keyword heuristics
  for (const [catName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      // Word boundary or substring matching
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(clean) || (kw.length >= 4 && clean.includes(kw))) {
        // Find matching category in user's category list
        const matched = targetCategories.find(
          (c) => c.name.toLowerCase() === catName.toLowerCase() ||
                 c.name.toLowerCase().includes(catName.toLowerCase()) ||
                 catName.toLowerCase().includes(c.name.toLowerCase())
        );
        if (matched) {
          return {
            categoryId: matched.id,
            categoryName: matched.name,
            source: 'keyword',
            matchKeyword: kw,
          };
        }
      }
    }
  }

  return null;
}
