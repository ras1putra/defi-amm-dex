const SUB_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function toSubscript(n: number): string {
  return String(n).split("").map((d) => SUB_DIGITS[+d]).join("");
}

export function formatTinyPrice(v: number): string {
  if (v === 0) return "0";
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);

  const s = v.toPrecision(4);
  const m = s.match(/^0\.(0+)(\d+)/);
  if (!m) return v.toFixed(4);
  const zeros = m[1].length;
  const digits = m[2];
  if (zeros <= 2) return v.toFixed(2 + zeros).replace(/0+$/, "");
  return `0.0₍${toSubscript(zeros - 1)}₎${digits}`;
}

export function formatUSD(v: number): string {
  if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000) return "$" + (v / 1_000).toFixed(1) + "K";
  return "$" + v.toFixed(2);
}

export function formatPrice(v: number): string {
  if (v === 0) return "$0";
  if (v >= 1) return "$" + v.toFixed(2);
  if (v >= 0.01) return "$" + v.toFixed(4);

  const exp = v.toExponential();
  const match = exp.match(/^([\d.]+)[eE]([-\d]+)$/);
  if (!match) return "$" + v.toFixed(6);

  const coef = parseFloat(match[1]);
  const exponent = Math.abs(parseInt(match[2]));
  const zeros = exponent - 1;

  let digits = coef.toFixed(4).replace(/\.?0+$/, "");
  digits = digits.replace(".", "");

  if (zeros <= 4) {
    return "$" + v.toFixed(zeros + 4).replace(/0+$/, "");
  }

  return "$0.0" + "₍" + toSubscript(zeros - 1) + "₎" + digits;
}

export function formatETH(v: number): string {
  if (v === 0) return "0 ETH";
  if (v >= 1) return v.toFixed(4) + " ETH";
  if (v >= 0.001) return v.toFixed(6) + " ETH";

  const exp = v.toExponential();
  const match = exp.match(/^([\d.]+)[eE]([-\d]+)$/);
  if (!match) return v.toFixed(8) + " ETH";

  const coef = parseFloat(match[1]);
  const exponent = Math.abs(parseInt(match[2]));
  const zeros = exponent - 1;

  let digits = coef.toFixed(4).replace(/\.?0+$/, "");
  digits = digits.replace(".", "");

  if (zeros <= 4) {
    return v.toFixed(zeros + 4).replace(/0+$/, "") + " ETH";
  }

  return "0.0" + "₍" + toSubscript(zeros - 1) + "₎" + digits + " ETH";
}

export function formatTokenMetric(v: number, symbol0: string, symbol1: string): string {
  const s0 = symbol0.toUpperCase();
  const s1 = symbol1.toUpperCase();
  const hasRef = s0 === "ETH" || s0 === "WETH" || s0 === "USDC" || s1 === "ETH" || s1 === "WETH" || s1 === "USDC";
  if (hasRef) {
    return formatUSD(v);
  }
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + "M";
  if (v >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(2);
}

export function formatBalance(value: bigint, decimals: number): string {
  const formatted = (Number(value) / 10 ** decimals).toString();
  const dot = formatted.indexOf(".");
  if (dot === -1) return formatted;
  const int = formatted.slice(0, dot);
  const dec = formatted.slice(dot + 1);
  const maxDec = int === "0" ? 6 : 4;
  const trimmed = dec.slice(0, maxDec).replace(/0+$/, "");
  return trimmed.length > 0 ? `${int}.${trimmed}` : int;
}

export function formatDecimalsInString(str: string, maxDecimals: number = 6): string {
  const truncated = str.replace(new RegExp(`(\\d+\\.\\d{${maxDecimals}})\\d+`, "g"), "$1");
  return truncated
    .replace(/(\d+\.\d*?[1-9])0+(?!\d)/g, "$1")
    .replace(/(\d+)\.0+(?!\d)/g, "$1");
}

export function formatApr(apr: number): string {
  if (apr >= 1e6) return "999,999%";
  if (apr >= 1000) return `${Math.floor(apr).toLocaleString()}%`;
  return `${apr.toFixed(1)}%`;
}

export function formatVotes(votesStr: string | number | bigint | null | undefined): string {
  if (votesStr == null) return "0";
  try {
    const val = BigInt(votesStr.toString());
    return Number(val / 1000000000000000000n).toLocaleString();
  } catch {
    return "0";
  }
}
