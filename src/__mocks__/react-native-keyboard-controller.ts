/* global jest */
module.exports = {
  KeyboardController: {
    addListener: jest.fn(),
    dismiss: jest.fn(),
    removeListener: jest.fn(),
    setInputMode: jest.fn()
  },
  KeyboardProvider: ({ children }: any) => children,
  KeyboardAwareScrollView: ({ children }: any) => children,
  useKeyboardHandler: jest.fn(),
  useReanimatedKeyboardAnimation: jest.fn(() => ({ height: { value: 0 }, progress: { value: 0 } }))
}
