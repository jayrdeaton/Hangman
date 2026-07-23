/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native')
  const mocked = Object.create(RN)
  Object.defineProperty(mocked, 'Platform', { configurable: true, enumerable: true, value: { OS: 'ios' } })
  return mocked
})

const setPlatform = (os: string) => {
  const RN = require('react-native')
  RN.Platform.OS = os
}

describe('horizontalWheelScrollProps', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('native (ios): is an empty object with no onWheel key', () => {
    setPlatform('ios')

    const { horizontalWheelScrollProps } = require('@/utils/horizontalWheelScroll')

    expect(horizontalWheelScrollProps).toEqual({})
    expect(Object.prototype.hasOwnProperty.call(horizontalWheelScrollProps, 'onWheel')).toBe(false)
  })

  it('native (android): is an empty object with no onWheel key', () => {
    setPlatform('android')

    const { horizontalWheelScrollProps } = require('@/utils/horizontalWheelScroll')

    expect(horizontalWheelScrollProps).toEqual({})
    expect(Object.prototype.hasOwnProperty.call(horizontalWheelScrollProps, 'onWheel')).toBe(false)
  })

  describe('web', () => {
    beforeEach(() => {
      setPlatform('web')
    })

    it('exposes an onWheel function', () => {
      const { horizontalWheelScrollProps } = require('@/utils/horizontalWheelScroll')

      expect(typeof horizontalWheelScrollProps.onWheel).toBe('function')
    })

    it('mostly-vertical scroll (deltaY large, deltaX small) redirects scrollLeft by deltaY and calls preventDefault', () => {
      const { horizontalWheelScrollProps } = require('@/utils/horizontalWheelScroll')
      const preventDefault = jest.fn()
      const event = {
        currentTarget: { scrollLeft: 100 },
        deltaX: 2,
        deltaY: 50,
        preventDefault
      }

      horizontalWheelScrollProps.onWheel(event)

      expect(event.currentTarget.scrollLeft).toBe(150)
      expect(preventDefault).toHaveBeenCalledTimes(1)
    })

    it('negative deltaY (scroll up) still redirects scrollLeft when mostly vertical', () => {
      const { horizontalWheelScrollProps } = require('@/utils/horizontalWheelScroll')
      const preventDefault = jest.fn()
      const event = {
        currentTarget: { scrollLeft: 100 },
        deltaX: 1,
        deltaY: -40,
        preventDefault
      }

      horizontalWheelScrollProps.onWheel(event)

      expect(event.currentTarget.scrollLeft).toBe(60)
      expect(preventDefault).toHaveBeenCalledTimes(1)
    })

    it('mostly-horizontal scroll (deltaX large, deltaY small) leaves scrollLeft unchanged and does not call preventDefault', () => {
      const { horizontalWheelScrollProps } = require('@/utils/horizontalWheelScroll')
      const preventDefault = jest.fn()
      const event = {
        currentTarget: { scrollLeft: 100 },
        deltaX: 50,
        deltaY: 2,
        preventDefault
      }

      horizontalWheelScrollProps.onWheel(event)

      expect(event.currentTarget.scrollLeft).toBe(100)
      expect(preventDefault).not.toHaveBeenCalled()
    })

    it('exactly diagonal scroll (deltaY equal to deltaX) leaves scrollLeft unchanged and does not call preventDefault', () => {
      const { horizontalWheelScrollProps } = require('@/utils/horizontalWheelScroll')
      const preventDefault = jest.fn()
      const event = {
        currentTarget: { scrollLeft: 100 },
        deltaX: 10,
        deltaY: 10,
        preventDefault
      }

      horizontalWheelScrollProps.onWheel(event)

      expect(event.currentTarget.scrollLeft).toBe(100)
      expect(preventDefault).not.toHaveBeenCalled()
    })
  })
})
