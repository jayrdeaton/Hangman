/* global jest */
const React = jest.requireActual('react')
const RN = require('react-native')

// The gesture itself is @rific/gestures' own tests'. Here SwipeToDismiss is its stationary wrapper, a
// View carrying `onDismiss` so a test can fire the swipe completing (`fireEvent(seat, 'dismiss')`; no
// `onDismiss` means no swipe), and `restore()` is noted by the wrapper's testID.
const restoredSwipes: string[] = []

module.exports = {
  restoredSwipes,
  SwipeToDismiss: ({ children, onDismiss, ref, style, testID }: any) => {
    React.useImperativeHandle(ref, () => ({ restore: () => restoredSwipes.push(testID) }), [testID])
    return React.createElement(RN.View, { onDismiss, style, testID }, children)
  }
}
