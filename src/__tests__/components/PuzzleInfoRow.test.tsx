import { Provider } from '@rific/auto-paper'
import { render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { PuzzleInfoRow } from '@/components/PuzzleInfoRow'

// Handles both hex (what easy/medium/hard all resolve to today, via getColorRoles) and literal
// `rgba(r, g, b, a)` strings (what MD3's own untouched error/onError resolve to — see
// useComputedTheme.ts) — React Native's StyleSheet accepts either format, so parsing both here is
// just robustness, not a statement about which format any particular tier currently uses.
const toRgb = (color: string): [number, number, number] => {
  const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (rgbaMatch) return [Number(rgbaMatch[1]), Number(rgbaMatch[2]), Number(rgbaMatch[3])]
  const n = parseInt(color.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Same WCAG relative-luminance/contrast-ratio formula used elsewhere in this codebase to verify
// color choices — reimplemented here, independently, so this test can't be fooled by a bug shared
// between the component and its own verification.
const relativeLuminance = (color: string): number => {
  const channels = toRgb(color).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}
const contrastRatio = (hexA: string, hexB: string): number => {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a)
  return (l1 + 0.05) / (l2 + 0.05)
}

// Rendered through @rific/auto-paper's real Provider (not a hand-built PaperProvider theme) —
// easy/medium/hard now read straight off theme.colors.{success,warning,danger} for the pill's own
// fill and theme.colors.on{Success,Warning,Danger} for its text (see useDifficultyColors), which
// only exist on a theme useComputedTheme actually produced. The pill is a solid vibrant fill now
// (not an outline on the page's own surface — see PuzzleInfoRow's own comment on why), so the
// contrast that actually matters is fill vs its own text, not either one against SURFACE.
const renderDifficultyPill = async (tier: 'easy' | 'medium' | 'hard', dark: boolean) => {
  const utils = await render(
    <Provider initialValue={{ appearance: dark ? 'dark' : 'light' }}>
      <PuzzleInfoRow difficultyTier={tier} hintRevealed={false} onRevealHint={jest.fn()} />
    </Provider>
  )
  const pill = utils.getByLabelText(`Difficulty: ${tier[0].toUpperCase()}${tier.slice(1)}`)
  const label = utils.getByText(tier[0].toUpperCase() + tier.slice(1))
  return { fill: StyleSheet.flatten(pill.props.style).backgroundColor as string, text: StyleSheet.flatten(label.props.style).color as string }
}

describe('PuzzleInfoRow difficulty badge contrast — driven through the component by the real theme', () => {
  // easy/medium/hard map onto success/warning/danger, which are fixed (not seed-derived — see
  // useComputedTheme.ts's SEMANTIC_BASE_COLORS), so there's no longer an accent color to sweep
  // across: just light and dark mode.
  for (const dark of [false, true]) {
    for (const tier of ['easy', 'medium', 'hard'] as const) {
      it(`keeps ${tier}'s badge text at WCAG AA contrast (>= 4.5:1) against its own fill in ${dark ? 'dark' : 'light'} mode`, async () => {
        const { fill, text } = await renderDifficultyPill(tier, dark)
        const ratio = contrastRatio(fill, text)
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('keeps the semantic hue recognizable as green/amber/red', async () => {
    const easy = await renderDifficultyPill('easy', false)
    const hard = await renderDifficultyPill('hard', false)

    // Green: G channel clearly dominant. Red: R channel clearly dominant.
    const [er, eg, eb] = toRgb(easy.fill)
    const [hr, hg, hb] = toRgb(hard.fill)
    expect(eg).toBeGreaterThan(er)
    expect(eg).toBeGreaterThan(eb)
    expect(hr).toBeGreaterThan(hg)
    expect(hr).toBeGreaterThan(hb)
  })
})
