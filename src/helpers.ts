export function validateName(name: string): boolean {
  if (name.length === 0 || name.includes(".") || name === "value") {
    throw new Error(
      `Invalid name: ${name}. Names must be non-empty strings that do not contain periods.`,
    );
  }
  return true;
}

export function pxToRem({ value, rem = 16 }: { value: string; rem?: number }): string {
  const pxMatch = value.endsWith("px");
  if (pxMatch) {
    const pxValue = parseFloat(value.slice(0, -2));
    const remValue = pxValue / rem;
    return `${remValue}rem`;
  }
  return value;
}
