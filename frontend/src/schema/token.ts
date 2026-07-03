import { z } from "zod";

export const decimalStringSchema = z
  .string()
  .refine((v) => v === "" || /^\d*\.?\d*$/.test(v), "Must be a valid decimal number")
  .refine((v) => {
    if (v === "" || v === "." || v.endsWith(".")) return true;
    const n = Number(v);
    return !isNaN(n) && n >= 0;
  }, "Must be a non-negative number");

export const slippagePercentSchema = z
  .number()
  .min(0, "Slippage cannot be negative")
  .max(50, "Slippage cannot exceed 50%");

export function isValidDecimalInput(value: string): boolean {
  return decimalStringSchema.safeParse(value).success;
}

export function sanitizeDecimalInput(rawValue: string): string | null {
  const val = rawValue.replace(/,/g, ".");
  return isValidDecimalInput(val) ? val : null;
}

export function parseSlippagePercent(rawValue: string): number | null {
  const n = parseFloat(rawValue);
  return slippagePercentSchema.safeParse(n).success ? n : null;
}
