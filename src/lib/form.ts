export function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function ratingValue(value: string): number | null {
  return value ? Number(value) : null;
}
