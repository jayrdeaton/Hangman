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

// A hyphen, dash or slash in an answer joins two words, so it becomes a word break: Spider-Man
// plays as SPIDER MAN, the Madrid-Barajas airport (an en dash in the data) as MADRID BARAJAS and
// Face/Off as FACE OFF. Stripping it like other punctuation would fuse the two words into one long
// run of blanks. Covers the plain hyphen, the slash and the whole Unicode dash block U+2010 to U+2015
// (hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar), so a dash pasted in
// from elsewhere splits the same as one typed. Hangman-Scrapers' normalize() and customPackExport.ts
// split on the same characters, and PnpWordPrompt turns them into a space as they're typed.
export const WORD_SEPARATORS = /[-/\u2010-\u2015]/g

export const normalizePhrase = (value: string): string =>
  foldDiacritics(value)
    .replace(WORD_SEPARATORS, ' ')
    .replace(/[^A-Za-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
