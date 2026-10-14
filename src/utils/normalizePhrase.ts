// Pulled out as its own leaf module (no imports) so both puzzlePicker.ts and customPacks.ts can
// depend on it without customPacks.ts -> puzzlePicker.ts -> puzzleCatalog.ts -> customPacks.ts
// forming an import cycle -- the fold below is inlined for the same reason, rather than imported
// from a shared place.
//
// An accented letter (Café, São Paulo, Pokémon) getting stripped straight to A-Za-z without folding
// first doesn't just drop the accent mark, it drops the WHOLE LETTER underneath it ("Café" ->
// "CAF", not "CAFE") -- shrinking the blank count below what the displayed answer actually shows,
// and permanently unguessable at that letter position since it no longer corresponds to any key on
// the A-Z board at all. NFD-decomposing first (folding a base letter + combining accent back to
// just the base letter) fixes the common case; a small map covers the handful of Latin letters that
// aren't NFD-decomposable at all (đ, ø, ł, æ, œ, ß), and a Unicode "modifier letter" strip covers
// transliterated names that use one instead of a combining accent (Hawaiʻi's ʻokina).
const SPECIAL_LATIN_LETTERS: Record<string, string> = { đ: 'd', Đ: 'D', ø: 'o', Ø: 'O', ł: 'l', Ł: 'L', æ: 'ae', Æ: 'AE', œ: 'oe', Œ: 'OE', ß: 'ss' }

const foldDiacritics = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐøØłŁæÆœŒß]/g, (match) => SPECIAL_LATIN_LETTERS[match])
    .replace(/\p{Lm}/gu, '')

// An en dash (U+2013) or em dash (U+2014) in an answer separates two names, as in the
// Madrid-Barajas airport or the Polish-Lithuanian Commonwealth (both written with an en dash in the
// data), so it becomes a word break. Stripping it like other punctuation would fuse the two names
// into one long run of blanks. Plain hyphens are deliberately untouched: they're still stripped, so
// "Spider-Man" stays one word.
const WORD_SEPARATOR_DASHES = /[\u2013\u2014]/g

export const normalizePhrase = (value: string): string =>
  foldDiacritics(value)
    .replace(WORD_SEPARATOR_DASHES, ' ')
    .replace(/[^A-Za-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
