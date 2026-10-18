// The Single Player loadout's packs card names the packs selected in one line of text that never runs
// long: as many names as fit `maxChars`, then how many more there are, counted exactly ("Brands &
// Products, Companies and 8 more"). Every name fits: "A, B and C". The first name always shows, however
// long, so the line never reads as just a count.
export const summarizePackNames = (names: string[], maxChars: number): string => {
  const count = names.length
  if (count <= 1) return names[0] ?? ''
  const all = `${names.slice(0, -1).join(', ')} and ${names[count - 1]}`
  if (all.length <= maxChars) return all
  for (let shown = count - 1; shown > 1; shown--) {
    const text = `${names.slice(0, shown).join(', ')} and ${count - shown} more`
    if (text.length <= maxChars) return text
  }
  return `${names[0]} and ${count - 1} more`
}

// About how many characters of the packs card's names line fit in `lines` lines of `width` points, at
// its 14pt body type. A little wide per character on purpose, so a line of capitals and ampersands
// still wraps where the count says: one short of the room reads fine, one past it adds a line.
const AVERAGE_CHAR_WIDTH = 7.2
export const packNamesBudget = (width: number, lines: number): number => Math.max(0, Math.floor(width / AVERAGE_CHAR_WIDTH)) * lines
