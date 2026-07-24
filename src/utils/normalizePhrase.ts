// Pulled out as its own leaf module (no imports) so both puzzlePicker.ts and customPacks.ts can
// depend on it without customPacks.ts -> puzzlePicker.ts -> puzzleCatalog.ts -> customPacks.ts
// forming an import cycle.
export const normalizePhrase = (value: string): string =>
  value
    .replace(/[^A-Za-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
