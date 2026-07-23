import { Alert } from 'react-native'

import { select } from '@/utils/select'

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native')
  const mocked = Object.create(RN)
  Object.defineProperty(mocked, 'Alert', { configurable: true, enumerable: true, value: { alert: jest.fn() } })
  return mocked
})

describe('select', () => {
  beforeEach(() => {
    ;(Alert.alert as jest.Mock).mockClear()
  })

  it('calls Alert.alert with the title, message, and a buttons array matching the selections', () => {
    const selections = [
      { text: 'One', style: 'default' as const },
      { text: 'Two', style: 'destructive' as const },
      { text: 'Three', style: 'cancel' as const }
    ]

    select('Title', 'Message', selections)

    expect(Alert.alert).toHaveBeenCalledTimes(1)
    const [title, message, buttons] = (Alert.alert as jest.Mock).mock.calls[0]

    expect(title).toBe('Title')
    expect(message).toBe('Message')
    expect(buttons).toHaveLength(selections.length)
    buttons.forEach((button: { text: string; style?: string }, index: number) => {
      expect(button.text).toBe(selections[index].text)
      expect(button.style).toBe(selections[index].style)
    })
  })

  it('resolves with 0 when the first button is pressed', async () => {
    const selections = [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }]

    const promise = select('Title', 'Message', selections)
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2]

    buttons[0].onPress()

    await expect(promise).resolves.toBe(0)
  })

  it('resolves with the pressed index, not always 0, when a later button is pressed', async () => {
    const selections = [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }]

    const promise = select('Title', 'Message', selections)
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2]

    buttons[2].onPress()

    await expect(promise).resolves.toBe(2)
  })
})
