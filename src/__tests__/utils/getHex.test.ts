import { getHex } from '@/utils/getHex'

describe('getHex', () => {
  it('round-trips a plain rgb string to a lowercase 6-digit hex string', () => {
    expect(getHex('rgb(255, 0, 0)')).toBe('#ff0000')
  })

  it('produces an 8-digit hex string for an rgba string with an alpha channel', () => {
    const result = getHex('rgba(255, 0, 0, 0.5)')
    expect(result).toMatch(/^#[0-9a-f]{8}$/)
    expect(result?.slice(0, 7)).toBe('#ff0000')
  })

  it('returns null for invalid input that getRGB would reject', () => {
    expect(getHex('')).toBeNull()
  })
})
