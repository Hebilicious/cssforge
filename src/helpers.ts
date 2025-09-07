/**
 * Validates a name to ensure it doesn't contain invalid characters.
 * Throws an error if the name is invalid.
 * @example
 * ```ts
 * validateName("valid-name"); // returns true
 * validateName("invalid.name"); // throws error
 * ```
 */
export function validateName(name: string): boolean {
  if (name.length === 0 || name.includes(".") || name === "value") {
    throw new Error(
      `Invalid name: ${name}. Names must be non-empty strings that do not contain periods.`,
    );
  }
  return true;
}

/**
 * Converts a pixel value to a rem value.
 * If the value is not in pixels, it returns the original value.
 * @example
 * ```ts
 * pxToRem({ value: "16px" }); // "1rem"
 * pxToRem({ value: "1rem" }); // "1rem"
 * pxToRem({ value: "32px", rem: 16 }); // "2rem"
 * ```
 */
export function pxToRem({ value, rem = 16 }: { value: string; rem?: number }): string {
  const pxMatch = value.endsWith("px");
  if (pxMatch) {
    const pxValue = parseFloat(value.slice(0, -2));
    const remValue = pxValue / rem;
    return `${remValue}rem`;
  }
  return value;
}
