export function toMVR(amount, currency = 'MVR', usdToMvrRate = 15.42) {
  const num = Number(amount || 0);
  const rate = Number(usdToMvrRate || 15.42);
  if (currency === 'USD') {
    return Number((num * rate).toFixed(2));
  }
  return Number(num.toFixed(2));
}

export function toUSD(amount, currency = 'MVR', usdToMvrRate = 15.42) {
  const num = Number(amount || 0);
  const rate = Number(usdToMvrRate || 15.42);
  if (currency === 'MVR') {
    return rate > 0 ? Number((num / rate).toFixed(2)) : 0;
  }
  return Number(num.toFixed(2));
}
