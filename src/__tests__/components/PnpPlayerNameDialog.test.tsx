import { fireEvent, render } from '@testing-library/react-native'
import { BackHandler } from 'react-native'

import { PnpPlayerNameDialog, type PnpPlayerNameDialogProps } from '@/components/PnpPlayerNameDialog'
import { Providers } from '@/components/Providers'
import { MAX_PLAYER_NAME_LENGTH } from '@/utils/pnpSession'

const players = [
  { id: 'p1', name: 'Ann', profileId: null },
  { id: 'p2', name: 'Bo', profileId: null }
]

const renderDialog = (props: Partial<PnpPlayerNameDialogProps> = {}) =>
  render(
    <Providers>
      <PnpPlayerNameDialog player={players[1]} players={players} onSave={jest.fn()} onCancel={jest.fn()} {...props} />
    </Providers>
  )

describe('PnpPlayerNameDialog', () => {
  it("opens on the player's own name, capped to the longest a name can be", async () => {
    const { getByTestId, getByText } = await renderDialog()

    expect(getByText('Player Name')).toBeTruthy()
    expect(getByTestId('player-name-input').props.value).toBe('Bo')
    expect(getByTestId('player-name-input').props.maxLength).toBe(MAX_PLAYER_NAME_LENGTH)
  })

  it('saves the name tidied, from Save and from the keyboard alike', async () => {
    const onSave = jest.fn()
    const { getByTestId, getByText } = await renderDialog({ onSave })

    await fireEvent.changeText(getByTestId('player-name-input'), '  Bo   Diddley ')
    await fireEvent.press(getByText('Save'))
    await fireEvent(getByTestId('player-name-input'), 'submitEditing')

    expect(onSave.mock.calls).toEqual([['Bo Diddley'], ['Bo Diddley']])
  })

  it('offers no Save for a blank name', async () => {
    const onSave = jest.fn()
    const { getByTestId, getByRole, getByText } = await renderDialog({ onSave })

    await fireEvent.changeText(getByTestId('player-name-input'), '   ')

    expect(getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent.press(getByText('Save'))
    await fireEvent(getByTestId('player-name-input'), 'submitEditing')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('says so, and offers no Save, for a name someone else at the table goes by', async () => {
    const onSave = jest.fn()
    const { getByTestId, getByRole, getByText, queryByText } = await renderDialog({ onSave })
    // Not while the name is fine, so the field doesn't open with an error under it.
    expect(queryByText('Another player has this name')).toBeNull()

    await fireEvent.changeText(getByTestId('player-name-input'), 'ann')

    expect(getByText('Another player has this name')).toBeTruthy()
    expect(getByRole('button', { name: 'Save' })).toBeDisabled()
    await fireEvent(getByTestId('player-name-input'), 'submitEditing')
    expect(onSave).not.toHaveBeenCalled()
  })

  // Their own name back (in another case, too) isn't someone else's.
  it("takes the player's own name in a new case", async () => {
    const onSave = jest.fn()
    const { getByTestId, getByText } = await renderDialog({ onSave })

    await fireEvent.changeText(getByTestId('player-name-input'), 'BO')
    await fireEvent.press(getByText('Save'))

    expect(onSave).toHaveBeenCalledWith('BO')
  })

  it('cancels from Cancel and from Android back, saving nothing', async () => {
    const remove = jest.fn()
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove })
    const onCancel = jest.fn()
    const onSave = jest.fn()
    const { getByText, unmount } = await renderDialog({ onCancel, onSave })

    await fireEvent.press(getByText('Cancel'))
    const handler = addEventListener.mock.calls.find(([event]) => event === 'hardwareBackPress')![1] as () => boolean
    expect(handler()).toBe(true)
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onSave).not.toHaveBeenCalled()

    await unmount()
    expect(remove).toHaveBeenCalled()
    addEventListener.mockRestore()
  })
})
