//app/essays/utils.ts

/**
 * Converts an integer to a Roman numeral.
 * Supports values from 1 to 3999.
 */
export function toRoman(value: number): string {
    if (value <= 0 || value >= 4000) return value.toString();

    const numerals = [
        { value: 1000, symbol: "M" },
        { value: 900, symbol: "CM" },
        { value: 500, symbol: "D" },
        { value: 400, symbol: "CD" },
        { value: 100, symbol: "C" },
        { value: 90, symbol: "XC" },
        { value: 50, symbol: "L" },
        { value: 40, symbol: "XL" },
        { value: 10, symbol: "X" },
        { value: 9, symbol: "IX" },
        { value: 5, symbol: "V" },
        { value: 4, symbol: "IV" },
        { value: 1, symbol: "I" },
    ];

    let result = "";
    let remaining = value;

    for (const numeral of numerals) {
        while (remaining >= numeral.value) {
            result += numeral.symbol;
            remaining -= numeral.value;
        }
    }

    return result;
}

/**
 * Formats reading time.
 */
export function formatReadingTime(minutes: number): string {
    return `${minutes} min read`;
}

/**
 * Formats ISO date as:
 * June 30, 2026
 */
export function formatDate(date: string): string {
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(new Date(date));
}

export function calculateReadingTime(words: number): number {
    return Math.max(1, Math.ceil(words / 200));
}