/* global jest */
const { createContext } = jest.requireActual('react')

// A real context (not a bare { Consumer } object) so both halves work: Consumer still hands its
// children zero insets, and @tastic/hud's RotatedFrame (inside BaseSettingsDialog) can render
// SafeAreaInsetsContext.Provider to pass its own turned insets down.
module.exports = {
  ...jest.requireActual('react-native-safe-area-context'),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaInsetsContext: createContext({ top: 0, right: 0, bottom: 0, left: 0 }),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}
