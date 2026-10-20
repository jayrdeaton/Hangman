/* global jest */
const React = jest.requireActual('react')
const RN = require('react-native')

// The drag itself is the library's own to test. Here Sortable.Flex is a plain View carrying every prop it
// was given (so a test reads `sortEnabled`, `itemEntering` and the rest straight off it) around its
// children in order, and a test fires a drop with `fireEvent(flex, 'dragEnd', { order })`, `order` taking
// the children's data in their order and handing it back reordered, as the library's does. A Handle is a
// View carrying its `mode`.
const Flex = ({ children, ...props }: any) => React.createElement(RN.View, { testID: 'sortable-flex', ...props }, children)
const Handle = ({ children, mode = 'draggable', style }: any) => React.createElement(RN.View, { mode, style, testID: 'sortable-handle' }, children)

module.exports = {
  __esModule: true,
  default: { Flex, Handle }
}
