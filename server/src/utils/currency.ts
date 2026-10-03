export function toMVR(
  amount: number | string | null | undefined,
  currency: string = 'MVR',
  usdToMvrRate: number | string = 15.42
): number {
  const num = Number(amount || 0);
  const rate = Number(usdToMvrRate || 15.42);
  if (currency === 'USD') {
    return Number((num * rate).toFixed(2));
  }
  return Number(num.toFixed(2));
}

export function toUSD(
  amount: number | string | null | undefined,
  currency: string = 'MVR',
  usdToMvrRate: number | string = 15.42
): number {
  const num = Number(amount || 0);
  const rate = Number(usdToMvrRate || 15.42);
  if (currency === 'MVR') {
    return rate > 0 ? Number((num / rate).toFixed(2)) : 0;
  }
  return Number(num.toFixed(2));
}
