// ── M5: currency arithmetic that cannot drift ───────────────────────────────
//
// Every figure on a quote or an invoice is computed HERE, in integer minor
// units, and only then formatted into the `decimal(10, 2)` columns the rest of
// the CRM already uses (`crm_transactions.amount`, `crm_deals.value`). Matching
// that column type is what keeps `sum(amount)` — the one query behind every
// "money received" figure in this system — working unchanged.
//
// Two rules, and neither is stylistic:
//
//  1. No floating-point currency arithmetic, anywhere. `0.1 + 0.2` is
//     0.30000000000000004, and a subtotal built that way is wrong by a cent
//     often enough to be noticed and rarely enough to be blamed on the
//     customer. Everything below is integer `+`, `-`, `*`, `Math.floor` and
//     `%`; the single division is by a power of ten on an integer well inside
//     `Number.MAX_SAFE_INTEGER`, with the remainder handled explicitly.
//
//  2. No total is ever read from a request body. A client may send `total:
//     "1.00"` on a quote whose lines come to £9,000 — the parser below simply
//     has no path that accepts it. The route recomputes and stores what the
//     line items say.
//
// Parsing is deliberately strict: a value that is not an unambiguous
// non-negative decimal with at most two places is refused with `null` rather
// than coerced. `Number("1,200.00")` is NaN, `Number("")` is 0 and
// `parseFloat("12abc")` is 12 — all three are ways a bad figure becomes a
// plausible one, and a 400 naming the field is a better answer than any of them.

/** Largest value a `decimal(10, 2)` column holds, in minor units. */
export const MAX_MONEY_MINOR = 99_999_999_99;

/** Largest unit price accepted, in minor units. Keeps every product below 2^53. */
export const MAX_UNIT_PRICE_MINOR = 9_999_999_99;

/** Largest quantity accepted, in hundredths. */
export const MAX_QUANTITY_HUNDREDTHS = 999_999;

const DECIMAL2 = /^\d{1,10}(?:\.\d{1,2})?$/;

/**
 * "1234.5" / "1234.56" / 1234.56 / 1234 → 123450 / 123456 / 123456 / 123400.
 *
 * Returns null for anything else — negatives, more than two decimal places,
 * exponent notation, thousands separators, empty strings, NaN, Infinity. A
 * JavaScript number is stringified first, so `0.1 + 0.2` arrives as
 * "0.30000000000000004" and is REFUSED rather than silently rounded: a caller
 * that computed a price in floating point should be told, not accommodated.
 */
export function parseMoneyMinor(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" && !Number.isFinite(raw)) return null;
  const text = String(raw).trim();
  if (!DECIMAL2.test(text)) return null;
  const dot = text.indexOf(".");
  const whole = dot === -1 ? text : text.slice(0, dot);
  const frac = dot === -1 ? "" : text.slice(dot + 1);
  // Right-pad rather than parse, so ".5" is fifty cents and not five.
  const cents = (frac + "00").slice(0, 2);
  return Number(whole) * 100 + Number(cents);
}

/** Same parser, reading a quantity into hundredths. */
export function parseQuantityHundredths(raw: unknown): number | null {
  const parsed = parseMoneyMinor(raw);
  if (parsed === null || parsed <= 0) return null;
  return parsed;
}

/** 123456 → "1234.56". Always two places, so the column never rounds for us. */
export function formatMoneyMinor(minor: number): string {
  if (!Number.isInteger(minor) || minor < 0) {
    throw new Error("formatMoneyMinor expects a non-negative integer of minor units");
  }
  const whole = Math.floor(minor / 100);
  const cents = minor - whole * 100;
  return `${whole}.${String(cents).padStart(2, "0")}`;
}

/** Reads a stored `decimal(10, 2)` column back into minor units. */
export function storedMoneyMinor(stored: string | null | undefined): number {
  return parseMoneyMinor(stored ?? "0") ?? 0;
}

/**
 * Integer division by a power of ten, rounding half away from zero.
 *
 * Half-up is the convention people expect on an invoice line, and stating it
 * once here means every figure in the system rounds the same way rather than
 * however the nearest call site happened to feel.
 */
function divideRoundHalfUp(product: number, divisor: number): number {
  const quotient = Math.floor(product / divisor);
  const remainder = product - quotient * divisor;
  return remainder * 2 >= divisor ? quotient + 1 : quotient;
}

/**
 * A line total: quantity (hundredths) × unit price (minor units).
 *
 * The product is an integer below 10^15 given the caps above, so it is exact in
 * a float64 — and the division that follows is by 100 with its remainder taken
 * explicitly, so the rounding is ours rather than the hardware's.
 */
export function lineTotalMinor(quantityHundredths: number, unitPriceMinor: number): number {
  return divideRoundHalfUp(quantityHundredths * unitPriceMinor, 100);
}

/** A percentage of an amount. `percentHundredths` of 1250 means 12.5%. */
export function percentOfMinor(amountMinor: number, percentHundredths: number): number {
  return divideRoundHalfUp(amountMinor * percentHundredths, 10_000);
}

export interface LineInput {
  description: string;
  quantityHundredths: number;
  unitPriceMinor: number;
}

export interface ComputedLine extends LineInput {
  position: number;
  lineTotalMinor: number;
}

export interface ComputedTotals {
  lines: ComputedLine[];
  subtotalMinor: number;
  discountAmountMinor: number;
  totalMinor: number;
}

export type DiscountInput =
  | { type: "none" }
  | { type: "percent"; valueHundredths: number }
  | { type: "amount"; valueMinor: number };

/**
 * The whole computation, in one place, for both quotes and invoices.
 *
 * A discount larger than the subtotal is CLAMPED to the subtotal rather than
 * producing a negative total. A document that owes the customer money is a
 * credit note, which this system does not have — quietly emitting one as a
 * negative invoice would be worse than refusing, and refusing a fat-fingered
 * discount mid-draft is worse than clamping. The caller is told what the
 * discount actually came to, so the clamp is visible rather than silent.
 */
export function computeTotals(lines: LineInput[], discount: DiscountInput): ComputedTotals {
  const computed: ComputedLine[] = lines.map((line, index) => ({
    ...line,
    position: index,
    lineTotalMinor: lineTotalMinor(line.quantityHundredths, line.unitPriceMinor),
  }));

  const subtotalMinor = computed.reduce((sum, line) => sum + line.lineTotalMinor, 0);

  const rawDiscount =
    discount.type === "percent" ? percentOfMinor(subtotalMinor, discount.valueHundredths)
      : discount.type === "amount" ? discount.valueMinor
        : 0;
  const discountAmountMinor = Math.min(rawDiscount, subtotalMinor);

  return {
    lines: computed,
    subtotalMinor,
    discountAmountMinor,
    totalMinor: subtotalMinor - discountAmountMinor,
  };
}
