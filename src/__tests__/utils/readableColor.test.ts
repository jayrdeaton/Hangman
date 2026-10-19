import { contrastRatio, MIN_ACCENT_CONTRAST, readableOn } from '@/utils/readableColor'

// A light card and a dark one, near enough the frosted cards' own colors.
const LIGHT_CARD = '#f0eef1'
const DARK_CARD = '#1c1b1f'

describe('contrastRatio', () => {
  it('runs from 1 for one color to 21 for black on white, either way round', () => {
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21)
  })
})

describe('readableOn', () => {
  // Hangman's own red, and the deep colors, already read on a light card: left exactly as picked.
  it.each(['#f44336', '#3f51b5', '#673ab7', '#795548'])('leaves %s alone on a light card', (color) => {
    expect(readableOn(color, LIGHT_CARD)).toBe(color)
  })

  // Jay, 2026-10-19: Player 3's light green title read at 1.5:1.
  it.each(['#8bc34a', '#00bcd4', '#fdd835', '#ff9800', '#03a9f4'])('deepens %s on a light card just until it reads', (color) => {
    const ink = readableOn(color, LIGHT_CARD)

    expect(ink).not.toBe(color)
    expect(contrastRatio(ink, LIGHT_CARD)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST)
    expect(contrastRatio(ink, LIGHT_CARD)).toBeLessThan(MIN_ACCENT_CONTRAST + 0.5)
  })

  it('lightens a color too dark for a dark card', () => {
    const ink = readableOn('#1a237e', DARK_CARD)

    expect(contrastRatio('#1a237e', DARK_CARD)).toBeLessThan(MIN_ACCENT_CONTRAST)
    expect(contrastRatio(ink, DARK_CARD)).toBeGreaterThanOrEqual(MIN_ACCENT_CONTRAST)
  })
})
