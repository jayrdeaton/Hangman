const makeGesture = () => {
  const g: any = {}
  g.activeOffsetX = () => g
  g.activeOffsetY = () => g
  g.enabled = () => g
  g.failOffsetX = () => g
  g.failOffsetY = () => g
  g.manualActivation = () => g
  g.maxPointers = () => g
  g.minDistance = () => g
  g.minPointers = () => g
  g.onBegin = () => g
  g.onChange = () => g
  g.onEnd = () => g
  g.onFinalize = () => g
  g.onStart = () => g
  g.onTouchesDown = () => g
  g.onTouchesMove = () => g
  g.onTouchesUp = () => g
  g.onUpdate = () => g
  g.requireExternalGestureToFail = () => g
  g.runOnJS = () => g
  g.shouldCancelWhenOutside = () => g
  g.simultaneousWithExternalGesture = () => g
  return g
}

module.exports = {
  GestureHandlerRootView: ({ children }: any) => children,
  PanGestureHandler: ({ children }: any) => children,
  PinchGestureHandler: ({ children }: any) => children,
  State: { ACTIVE: 'ACTIVE', END: 'END' },
  Gesture: {
    Native: () => makeGesture(),
    Pinch: () => makeGesture(),
    Pan: () => makeGesture(),
    Tap: () => makeGesture(),
    Simultaneous: (..._gs: any[]) => makeGesture(),
    Race: (..._gs: any[]) => makeGesture(),
    Sequence: (..._gs: any[]) => makeGesture()
  },
  GestureDetector: ({ children }: any) => children
}
