import { render } from '@testing-library/react-native'

import { SketchWord } from '@/components/SketchWord'
import { SketchLetter } from '@/modes/shared/sketchLetter'
import { SketchLine } from '@/modes/shared/sketchShapes'

// The letters and blank marks are SVG strokes, so they're checked through the props SketchWord
// hands each one.
jest.mock('@/modes/shared/sketchLetter', () => ({
  ...jest.requireActual('@/modes/shared/sketchLetter'),
  SketchLetter: jest.fn(() => null)
}))
jest.mock('@/modes/shared/sketchShapes', () => ({
  ...jest.requireActual('@/modes/shared/sketchShapes'),
  SketchLine: jest.fn(() => null)
}))
const mockSketchLetter = jest.mocked(SketchLetter)
const mockSketchLine = jest.mocked(SketchLine)

const letterProps = () => mockSketchLetter.mock.calls.map(([props]) => props)

describe('SketchWord', () => {
  beforeEach(() => {
    mockSketchLetter.mockClear()
    mockSketchLine.mockClear()
  })

  it('gives each letter its own color and delay when the round-end card passes them', async () => {
    await render(<SketchWord letters={['K', 'I', 'S', 'S']} fontSize={40} color='ink' letterColors={['red', 'ink', 'red', 'ink']} letterDelaysMs={[100, 200, 300, 400]} />)

    expect(letterProps().map(({ letter, color, delayMs }) => ({ letter, color, delayMs }))).toEqual([
      { letter: 'K', color: 'red', delayMs: 100 },
      { letter: 'I', color: 'ink', delayMs: 200 },
      { letter: 'S', color: 'red', delayMs: 300 },
      { letter: 'S', color: 'ink', delayMs: 400 }
    ])
  })

  it('otherwise draws every letter in `color`, staggering only a repeated letter', async () => {
    await render(<SketchWord letters={['K', 'I', 'S', 'S']} fontSize={40} color='ink' />)

    expect(letterProps().map(({ color, delayMs }) => ({ color, delayMs }))).toEqual([
      { color: 'ink', delayMs: 0 },
      { color: 'ink', delayMs: 0 },
      { color: 'ink', delayMs: 0 },
      { color: 'ink', delayMs: 150 }
    ])
  })

  it('draws a blank in `color` whatever letterColors says', async () => {
    await render(<SketchWord letters={['K', '_']} fontSize={40} color='ink' letterColors={['red', 'red']} />)

    expect(mockSketchLine.mock.calls.map(([props]) => props.color)).toEqual(['ink'])
  })
})
