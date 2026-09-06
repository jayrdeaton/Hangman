/* global jest */
// real useFonts returns a Map-keyed loaded state that resolves async; tests need fonts already
// "loaded" synchronously so Theme.tsx's own splash gate (see splashGate.ts) doesn't stay stuck
// waiting on it forever.
module.exports = {
  useFonts: () => [true, null],
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: () => true
}
