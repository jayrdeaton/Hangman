import { getRGB } from '@/utils/getRGB'

describe('getRGB', () => {
  it('parses a 6-digit hex string with a leading #', () => {
    expect(getRGB('#ff0000')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('parses a 6-digit hex string without a leading #', () => {
    expect(getRGB('ff0000')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('expands a 3-digit shorthand hex string', () => {
    expect(getRGB('#f00')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('parses an 8-digit hex string and divides the alpha byte by 255', () => {
    const result = getRGB('#ff000080')
    expect(result?.r).toBe(255)
    expect(result?.g).toBe(0)
    expect(result?.b).toBe(0)
    expect(result?.a).toBeCloseTo(0.5, 2)
  })

  it('parses rgb(...) syntax', () => {
    expect(getRGB('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('parses rgb(...) syntax without whitespace', () => {
    expect(getRGB('rgb(255,0,0)')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('parses rgba(...) syntax including the alpha channel', () => {
    expect(getRGB('rgba(255, 0, 0, 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 })
  })

  it('parses rgba(...) syntax without whitespace', () => {
    expect(getRGB('rgba(255,0,0,0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 })
  })

  it('is case-insensitive for hex digits', () => {
    expect(getRGB('#FF0000')).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('returns null for an empty string', () => {
    expect(getRGB('')).toBeNull()
  })

  it('returns null for a CSS color name', () => {
    expect(getRGB('red')).toBeNull()
  })

  it('returns null for garbage text', () => {
    expect(getRGB('not a color')).toBeNull()
  })

  it('returns null for a hex string with an invalid digit count', () => {
    expect(getRGB('#ff00')).toBeNull()
  })
})
