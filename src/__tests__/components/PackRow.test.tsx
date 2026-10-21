import { FeedbackPressProvider } from '@rific/feedback-press'
import { fireEvent, render as rtlRender } from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import * as RNPaper from 'react-native-paper'

import { PackRow } from '@/components/PackRow'

const Wrapper = ({ children }: { children: ReactNode }) => (
  <FeedbackPressProvider paper={RNPaper}>
    <RNPaper.PaperProvider>{children}</RNPaper.PaperProvider>
  </FeedbackPressProvider>
)
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: Wrapper })

describe('PackRow', () => {
  // The card's Pressable is one accessible element, so VoiceOver never reaches the buttons inside it:
  // the row offers them as its own actions instead.
  it("offers its trailing controls as the row's accessibility actions, each running its own handler", async () => {
    const browse = jest.fn()
    const edit = jest.fn()
    const { getByLabelText } = await render(
      <PackRow
        label='Football Teams'
        group='Sports'
        isPack
        subtitle='3 of 32 unlocked'
        onPress={jest.fn()}
        actions={[
          { name: 'browse', label: 'Browse Football Teams', onPress: browse },
          { name: 'edit', label: 'Edit Football Teams', onPress: edit }
        ]}
      />
    )

    const row = getByLabelText('Sports, Football Teams, 3 of 32 unlocked')
    expect(row.props.accessibilityActions).toEqual([
      { name: 'browse', label: 'Browse Football Teams' },
      { name: 'edit', label: 'Edit Football Teams' }
    ])
    expect(row.props.accessibilityRole).toBe('button')

    await fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'edit' } })
    expect(edit).toHaveBeenCalledTimes(1)
    expect(browse).not.toHaveBeenCalled()
  })

  it('keeps an explicit accessibility label alongside its actions', async () => {
    const { getByLabelText } = await render(<PackRow label='_ _ _' accessibilityLabel='Unsolved puzzle' actions={[{ name: 'play', label: 'Play it', onPress: jest.fn() }]} />)

    expect(getByLabelText('Unsolved puzzle').props.accessibilityActions).toEqual([{ name: 'play', label: 'Play it' }])
  })

  it('adds no wrapper for a row with neither a label nor actions', async () => {
    const { queryByLabelText } = await render(<PackRow label='Football Teams' subtitle='3 of 32 unlocked' onPress={jest.fn()} />)

    expect(queryByLabelText(/Football Teams,/)).toBeNull()
  })
})
