import { getTonalColor } from '@rific/auto-paper'
import { render } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from 'react-native-paper'

import { DIFFICULTY_BASE_COLORS, DIFFICULTY_LIGHTNESS, PuzzleInfoRow } from '@/components/PuzzleInfoRow'

// Same WCAG relative-luminance/contrast-ratio formula used to validate PuzzleInfoRow's
// DIFFICULTY_LIGHTNESS bounds in the first place (see that file's own comment) — reimplemented
// here, independently of the component, so this test can't be fooled by a bug shared between the
// component and its own verification.
const relativeLuminance = (hex: string): number => {
  const n = parseInt(hex.replace('#', ''), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}
const contrastRatio = (hexA: string, hexB: string): number => {
  const [l1, l2] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a)
  return (l1 + 0.05) / (l2 + 0.05)
}

// react-native-paper's actual MD3 surface tokens — see LightTheme.tsx/DarkTheme.tsx's
// `surface: palette.neutral99` / `palette.neutral10`.
const SURFACE = { light: '#FFFBFE', dark: '#1C1B1F' }

const renderDifficultyPill = async (tier: 'easy' | 'medium' | 'hard', accentPrimary: string, dark: boolean) => {
  const base = dark ? MD3DarkTheme : MD3LightTheme
  const theme = { ...base, dark, colors: { ...base.colors, primary: accentPrimary, surface: SURFACE[dark ? 'dark' : 'light'] } }
  const utils = await render(
    <PaperProvider theme={theme}>
      <PuzzleInfoRow difficultyTier={tier} hintRevealed={false} onRevealHint={jest.fn()} />
    </PaperProvider>
  )
  const pill = utils.getByLabelText(`Difficulty: ${tier[0].toUpperCase()}${tier.slice(1)}`)
  return StyleSheet.flatten(pill.props.style).borderColor as string
}

describe("PuzzleInfoRow difficulty badge contrast — DIFFICULTY_LIGHTNESS's own declared bounds", () => {
  // Directly checks contrast AT the risky bound in each mode (light's max, dark's min — see
  // PuzzleInfoRow.tsx's comment on why those two, not all four, are the ones that matter) rather
  // than through the component driven by some accent color. This is deliberate: under the
  // CURRENT THEME_LIGHTNESS_NUDGE, no real accent color can actually push lightness that far (the
  // reachable window is narrower than the declared clamp), so a test that only drives extreme
  // accent colors through the component — pure white/black, further down — would keep passing
  // even if the declared bound itself were unsafe, exactly like it did for the bug this guards
  // against: an earlier version declared light.max: 0.34, which is NOT itself safe (medium/amber
  // there computes to ~3.9:1, below the 4.5:1 bar), and nothing caught it because 0.34 was simply
  // never reached by any accent color under the nudge strength at the time. If THEME_LIGHTNESS_NUDGE
  // is ever increased enough to make these bounds reachable, this is what would catch a regression.
  it.each(Object.entries(DIFFICULTY_BASE_COLORS))('keeps %s at WCAG AA contrast (>= 4.5:1) at light.max exactly', (_tier, baseHex) => {
    const color = getTonalColor(baseHex, DIFFICULTY_LIGHTNESS.light.max)
    expect(contrastRatio(color, '#FFFBFE')).toBeGreaterThanOrEqual(4.5)
  })

  it.each(Object.entries(DIFFICULTY_BASE_COLORS))('keeps %s at WCAG AA contrast (>= 4.5:1) at dark.min exactly', (_tier, baseHex) => {
    const color = getTonalColor(baseHex, DIFFICULTY_LIGHTNESS.dark.min)
    expect(contrastRatio(color, '#1C1B1F')).toBeGreaterThanOrEqual(4.5)
  })
})

describe('PuzzleInfoRow difficulty badge contrast — driven through the component by a real accent', () => {
  // A secondary, integration-level check: with today's THEME_LIGHTNESS_NUDGE, even the most
  // extreme accent colors a player could actually pick (pure white/black) still land somewhere
  // reasonable when driven through the full theme -> component pipeline, not just at the
  // declared-safe bound checked directly above.
  const EXTREME_ACCENTS: { label: string; hex: string; dark: boolean }[] = [
    { label: 'pure white accent, light mode', hex: '#FFFFFF', dark: false },
    { label: 'pure black accent, light mode', hex: '#000000', dark: false },
    { label: 'pure white accent, dark mode', hex: '#FFFFFF', dark: true },
    { label: 'pure black accent, dark mode', hex: '#000000', dark: true }
  ]

  for (const { label, hex, dark } of EXTREME_ACCENTS) {
    for (const tier of ['easy', 'medium', 'hard'] as const) {
      it(`keeps ${tier}'s badge at WCAG AA contrast (>= 4.5:1) against the surface with a ${label}`, async () => {
        const badgeColor = await renderDifficultyPill(tier, hex, dark)
        const ratio = contrastRatio(badgeColor, SURFACE[dark ? 'dark' : 'light'])
        expect(ratio).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('keeps the semantic hue recognizable as green/amber/red regardless of theme (only lightness is re-tuned)', async () => {
    // A saturated, on-brand accent (not an extreme) — the ordinary case a player would actually
    // pick, not just a boundary probe.
    const easy = await renderDifficultyPill('easy', '#1976D2', false)
    const hard = await renderDifficultyPill('hard', '#1976D2', false)

    // Green: G channel clearly dominant. Red: R channel clearly dominant. If hue were being
    // touched (not just lightness), a saturated blue accent could otherwise bleed into these.
    const [er, eg, eb] = [0, 2, 4].map((i) => parseInt(easy.slice(1 + i, 3 + i), 16))
    const [hr, hg, hb] = [0, 2, 4].map((i) => parseInt(hard.slice(1 + i, 3 + i), 16))
    expect(eg).toBeGreaterThan(er)
    expect(eg).toBeGreaterThan(eb)
    expect(hr).toBeGreaterThan(hg)
    expect(hr).toBeGreaterThan(hb)
  })
})
