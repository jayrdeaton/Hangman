import { packNamesBudget, summarizePackNames } from '@/utils/packSummary'

describe('summarizePackNames', () => {
  const names = ['Brands & Products', 'Companies', 'Board Games & Toys', 'Video Games', 'Cities', 'Countries']

  it('names one pack outright, and joins every name that fits with a last "and"', () => {
    expect(summarizePackNames(['Companies'], 80)).toBe('Companies')
    expect(summarizePackNames(['Brands & Products', 'Companies'], 80)).toBe('Brands & Products and Companies')
    expect(summarizePackNames(names.slice(0, 3), 80)).toBe('Brands & Products, Companies and Board Games & Toys')
  })

  it('says nothing for no packs', () => {
    expect(summarizePackNames([], 80)).toBe('')
  })

  it('cuts the list short with exactly how many more there are, as many names as fit', () => {
    const line = summarizePackNames(names, 60)

    expect(line).toBe('Brands & Products, Companies, Board Games & Toys and 3 more')
    expect(line.length).toBeLessThanOrEqual(60)
    // One more name wouldn't have fit.
    expect('Brands & Products, Companies, Board Games & Toys, Video Games and 2 more'.length).toBeGreaterThan(60)
  })

  it('counts the rest exactly however many there are', () => {
    const many = Array.from({ length: 58 }, (_, index) => `Pack ${index + 1}`)

    expect(summarizePackNames(many, 34)).toBe('Pack 1, Pack 2, Pack 3 and 55 more')
    expect(summarizePackNames(many, 33)).toBe('Pack 1, Pack 2 and 56 more')
  })

  // Never a bare count: the line always starts with a name, however long.
  it('always shows the first name, even one longer than the room', () => {
    const long = 'A Very Long Custom Pack Name That Goes On And On'

    expect(summarizePackNames([long, 'Companies'], 20)).toBe(`${long} and 1 more`)
    expect(summarizePackNames([long], 20)).toBe(long)
  })
})

describe('packNamesBudget', () => {
  it('counts the characters that fit across the lines given', () => {
    // 7.2pt a character: 36 to a 260pt line.
    expect(packNamesBudget(260, 2)).toBe(72)
    expect(packNamesBudget(260, 1)).toBe(36)
  })

  it('never goes below nothing', () => {
    expect(packNamesBudget(-40, 2)).toBe(0)
  })
})
