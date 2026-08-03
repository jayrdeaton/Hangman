import { renderHook } from '@testing-library/react-native'

import { getContainerColor, useDifficultyColors, useDifficultyContainerColors } from '@/hooks/useDifficultyColors'

const mockThemeColors = {
  onSuccessContainer: '#111111',
  onWarningContainer: '#222222',
  onDangerContainer: '#333333',
  successContainer: '#444444',
  warningContainer: '#555555',
  dangerContainer: '#666666'
}

// jest.mock calls are hoisted above these imports automatically — mocking just useAutoPaperTheme
// (keeping every other @rific/auto-paper export real) lets these tests check the tier->role
// mapping in isolation, without rendering through a real Provider tree.
jest.mock('@rific/auto-paper', () => ({
  ...jest.requireActual('@rific/auto-paper'),
  useAutoPaperTheme: () => ({ colors: mockThemeColors })
}))

describe('useDifficultyColors', () => {
  it("maps easy/medium/hard onto the theme's onSuccessContainer/onWarningContainer/onDangerContainer text colors", async () => {
    const { result } = await renderHook(() => useDifficultyColors())
    expect(result.current).toEqual({
      easy: mockThemeColors.onSuccessContainer,
      medium: mockThemeColors.onWarningContainer,
      hard: mockThemeColors.onDangerContainer
    })
  })
})

describe('useDifficultyContainerColors', () => {
  it("maps easy/medium/hard onto the theme's successContainer/warningContainer/dangerContainer fill colors", async () => {
    const { result } = await renderHook(() => useDifficultyContainerColors())
    expect(result.current).toEqual({
      easy: mockThemeColors.successContainer,
      medium: mockThemeColors.warningContainer,
      hard: mockThemeColors.dangerContainer
    })
  })
})

describe('getContainerColor', () => {
  it('delegates to getColorRoles(baseHex, surface).container — used for PuzzleDrawer\'s "Any" segment, which has no semantic role of its own', () => {
    const { getColorRoles } = jest.requireActual('@rific/auto-paper')
    const base = '#6750a4'
    const surface = '#FFFBFE'
    expect(getContainerColor(base, surface)).toBe(getColorRoles(base, surface).container)
  })
})
