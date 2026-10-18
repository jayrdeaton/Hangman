import type { Profile } from '@tastic/profile'
import { fireEvent, render } from '@testing-library/react-native'
import { AccessibilityInfo, BackHandler, StyleSheet } from 'react-native'

import { PnpSessionEndDialog, type PnpSessionEndDialogProps } from '@/components/PnpSessionEndDialog'
import { Providers } from '@/components/Providers'
import type { PnpStandingRow } from '@/utils/pnpSession'

const row = (id: string, name: string, played: number, wins: number): PnpStandingRow => ({ id, name, played, wins })

const renderCard = (props: Partial<PnpSessionEndDialogProps> = {}) =>
  render(
    <Providers>
      <PnpSessionEndDialog visible standings={[row('p1', 'Ann', 3, 1), row('p2', 'Bo', 2, 2), row('p3', 'Cy', 0, 0)]} onDone={jest.fn()} onKeepPlaying={jest.fn()} {...props} />
    </Providers>
  )

describe('PnpSessionEndDialog', () => {
  it('renders nothing while closed, and leaves the back button alone', async () => {
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener')
    const { queryByText } = await renderCard({ visible: false })

    expect(queryByText('Done')).toBeNull()
    expect(addEventListener.mock.calls.filter(([event]) => event === 'hardwareBackPress')).toHaveLength(0)
    addEventListener.mockRestore()
  })

  it('crowns the best win rate, however few words that was, and ranks everyone under it', async () => {
    const { getByText, getAllByLabelText } = await renderCard()

    expect(getByText('Bo Wins!')).toBeTruthy()
    expect(getByText('2 of 2 solved, the best rate at 100%.')).toBeTruthy()
    // Best rate first, the player who never guessed last.
    expect(getAllByLabelText(/solved|guessed/).map((entry) => entry.props.accessibilityLabel)).toEqual(['Bo: 2 of 2 solved, 100%', 'Ann: 1 of 3 solved, 33%', 'Cy: no words guessed yet'])
    expect(StyleSheet.flatten(getByText('Bo').props.style).fontWeight).toBe('700')
  })

  // Equal best rates are a tie, not a win on more words (Jay's call).
  it('calls equal best rates a tie, naming everyone in it', async () => {
    const { getByText, queryByText } = await renderCard({ standings: [row('p1', 'Ann', 2, 1), row('p2', 'Bo', 4, 2), row('p3', 'Cy', 1, 0)] })

    expect(getByText("It's a Tie!")).toBeTruthy()
    expect(getByText('Ann and Bo tied at 50%.')).toBeTruthy()
    expect(queryByText(/Wins!/)).toBeNull()
  })

  // The winner's chip under the header, when they sit as a profile; a tie's every profile.
  it("shows a winning profile's chip, every tied profile's for a tie, and none for a guest", async () => {
    const bo: Profile = { id: 'profile-b', name: 'Bo', color: '#4caf50', tag: 'BO', createdAt: 1, updatedAt: 1 }
    const ann: Profile = { id: 'profile-a', name: 'Ann', color: '#9c27b0', tag: 'AN', createdAt: 1, updatedAt: 1 }
    const won = await renderCard({ standings: [row('p1', 'Ann', 3, 1), { ...row('p2', 'Bo', 2, 2), profile: bo }] })
    expect(won.getByText('Bo Wins!')).toBeTruthy()
    expect(won.getAllByText('BO')).toHaveLength(2)
    await won.unmount()

    const tie = await renderCard({
      standings: [
        { ...row('p1', 'Ann', 2, 1), profile: ann },
        { ...row('p2', 'Bo', 4, 2), profile: bo }
      ]
    })
    expect(tie.getByTestId('session-crowned').children).toHaveLength(2)
    await tie.unmount()

    const guest = await renderCard()
    expect(guest.queryByTestId('session-crowned')).toBeNull()
  })

  it('has no winner for a session nobody guessed in', async () => {
    const { getByText } = await renderCard({ standings: [row('p1', 'Ann', 0, 0), row('p2', 'Bo', 0, 0)] })

    expect(getByText('Session Over')).toBeTruthy()
    expect(getByText('Nobody guessed a word.')).toBeTruthy()
  })

  it('has no winner when every word guessed was missed', async () => {
    const { getByText, queryByText } = await renderCard({ standings: [row('p1', 'Ann', 0, 0), row('p2', 'Bo', 1, 0)] })

    expect(getByText('Session Over')).toBeTruthy()
    expect(getByText('Nobody solved a word.')).toBeTruthy()
    expect(queryByText(/Wins!/)).toBeNull()
  })

  it('announces the result, since it appears as a plain overlay', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility')
    await renderCard()

    expect(announce).toHaveBeenLastCalledWith('Bo Wins! 2 of 2 solved, the best rate at 100%.')
    announce.mockRestore()
  })

  it('ends the session only from Done', async () => {
    const onDone = jest.fn()
    const onKeepPlaying = jest.fn()
    const { getByText } = await renderCard({ onDone, onKeepPlaying })

    await fireEvent.press(getByText('Done'))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(onKeepPlaying).not.toHaveBeenCalled()
  })

  // The card is End Session's confirm, so backing out of it cancels, like every fleet confirm: a stray
  // back never wipes the standings.
  it('backs out from Keep Playing and from Android back alike, never ending the session', async () => {
    const remove = jest.fn()
    const addEventListener = jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove })
    const onDone = jest.fn()
    const onKeepPlaying = jest.fn()
    const { getByText } = await renderCard({ onDone, onKeepPlaying })

    await fireEvent.press(getByText('Keep Playing'))
    const handler = addEventListener.mock.calls.find(([event]) => event === 'hardwareBackPress')![1] as () => boolean
    expect(handler()).toBe(true)
    expect(onKeepPlaying).toHaveBeenCalledTimes(2)
    expect(onDone).not.toHaveBeenCalled()
    addEventListener.mockRestore()
  })
})
