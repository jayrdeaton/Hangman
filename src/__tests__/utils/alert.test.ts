/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native')
  const mocked = Object.create(RN)
  Object.defineProperty(mocked, 'Platform', { configurable: true, enumerable: true, value: { OS: 'web' } })
  Object.defineProperty(mocked, 'Alert', { configurable: true, enumerable: true, value: { alert: jest.fn() } })
  return mocked
})

const setPlatform = (os: string) => {
  const RN = require('react-native')
  RN.Platform.OS = os
}

describe('alert', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('web: calls window.alert with a string containing the title and message, and resolves', async () => {
    setPlatform('web')
    window.alert = jest.fn()

    const { alert } = require('@/utils/alert')
    // window.alert is deferred a couple of animation frames (so a pending React paint isn't
    // hidden behind the blocking dialog) — awaiting the promise itself covers that deferral.
    await alert('Game Over', 'You lost')

    expect(window.alert).toHaveBeenCalledTimes(1)
    const calledWith = (window.alert as jest.Mock).mock.calls[0][0]
    expect(calledWith).toContain('Game Over')
    expect(calledWith).toContain('You lost')
  })

  it('native: calls Alert.alert with title, message, and a single button; pressing it resolves', async () => {
    setPlatform('ios')

    const RN = require('react-native')
    const { alert } = require('@/utils/alert')
    const promise = alert('Game Over', 'You lost')

    expect(RN.Alert.alert).toHaveBeenCalledTimes(1)
    const [title, message, buttons] = (RN.Alert.alert as jest.Mock).mock.calls[0]
    expect(title).toBe('Game Over')
    expect(message).toBe('You lost')
    expect(buttons).toHaveLength(1)

    buttons[0].onPress()

    await expect(promise).resolves.toBeUndefined()
  })
})

describe('confirm', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('web: resolves true when window.confirm returns true', async () => {
    setPlatform('web')
    window.confirm = jest.fn().mockReturnValue(true)

    const { confirm } = require('@/utils/alert')
    const promise = confirm('Quit?', 'Are you sure?')

    expect(window.confirm).toHaveBeenCalledTimes(1)
    const calledWith = (window.confirm as jest.Mock).mock.calls[0][0]
    expect(calledWith).toContain('Quit?')
    expect(calledWith).toContain('Are you sure?')

    await expect(promise).resolves.toBe(true)
  })

  it('web: resolves false when window.confirm returns false', async () => {
    setPlatform('web')
    window.confirm = jest.fn().mockReturnValue(false)

    const { confirm } = require('@/utils/alert')
    const promise = confirm('Quit?', 'Are you sure?')

    await expect(promise).resolves.toBe(false)
  })

  it('native: calls Alert.alert with a cancel and a confirm button; pressing cancel resolves false', async () => {
    setPlatform('ios')

    const RN = require('react-native')
    const { confirm } = require('@/utils/alert')
    const promise = confirm('Quit?', 'Are you sure?')

    expect(RN.Alert.alert).toHaveBeenCalledTimes(1)
    const [title, message, buttons] = (RN.Alert.alert as jest.Mock).mock.calls[0]
    expect(title).toBe('Quit?')
    expect(message).toBe('Are you sure?')
    expect(buttons).toHaveLength(2)

    buttons[0].onPress()

    await expect(promise).resolves.toBe(false)
  })

  it('native: pressing the confirm button resolves true', async () => {
    setPlatform('ios')

    const RN = require('react-native')
    const { confirm } = require('@/utils/alert')
    const promise = confirm('Quit?', 'Are you sure?')

    const buttons = (RN.Alert.alert as jest.Mock).mock.calls[0][2]
    buttons[1].onPress()

    await expect(promise).resolves.toBe(true)
  })
})
