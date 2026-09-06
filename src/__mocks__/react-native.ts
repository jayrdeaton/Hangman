/* global jest */
const RN = jest.requireActual('react-native')
const RESULTS = {
  DENIED: 'denied',
  GRANTED: 'granted',
  NEVER_ASK_AGAIN: 'never_ask_again'
}
const PERMISSIONS = {
  ...RN.PermissionsAndroid?.PERMISSIONS
}
const mockedReactNative = Object.create(RN)

Object.defineProperty(mockedReactNative, 'PermissionsAndroid', {
  configurable: true,
  enumerable: true,
  value: {
    ...RN.PermissionsAndroid,
    PERMISSIONS,
    RESULTS,
    check: jest.fn().mockResolvedValue(true),
    request: jest.fn().mockResolvedValue(RESULTS.GRANTED),
    requestMultiple: jest.fn().mockResolvedValue({})
  }
})

Object.defineProperty(mockedReactNative, 'Linking', {
  configurable: true,
  enumerable: true,
  value: {
    ...RN.Linking,
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeEventListener: jest.fn(),
    getInitialURL: jest.fn().mockResolvedValue(null),
    openURL: jest.fn().mockResolvedValue(true),
    canOpenURL: jest.fn().mockResolvedValue(true)
  }
})

Object.defineProperty(mockedReactNative, 'AppState', {
  configurable: true,
  enumerable: true,
  value: {
    ...RN.AppState,
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeEventListener: jest.fn()
  }
})

Object.defineProperty(mockedReactNative, 'Vibration', {
  configurable: true,
  enumerable: true,
  value: {
    ...RN.Vibration,
    cancel: jest.fn(),
    vibrate: jest.fn()
  }
})

Object.defineProperty(mockedReactNative, 'Modal', {
  configurable: true,
  enumerable: true,
  value: ({ children, visible }: any) => (visible ? children : null)
})

module.exports = mockedReactNative
