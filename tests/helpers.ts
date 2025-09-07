export const getLines = (result: string) =>
  result.split("\n").filter((line) => line.trim());

export const lineHasProp = (lines: string[]) => (prop: string) =>
  lines.some((line) => line.includes(prop));
