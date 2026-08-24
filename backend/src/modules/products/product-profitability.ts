export interface ProfitabilityResult {
  unitProfit: string;
  marginRate: string | null;
  markup: string | null;
}

export function calculateProfitability(
  currentSellingPrice: string,
  cost: string
): ProfitabilityResult {
  const price = Number(currentSellingPrice);
  const costValue = Number(cost);
  const unitProfit = price - costValue;
  return {
    unitProfit: unitProfit.toFixed(2),
    marginRate: price > 0 ? (unitProfit / price).toFixed(4) : null,
    markup: costValue > 0 ? (unitProfit / costValue).toFixed(4) : null,
  };
}
