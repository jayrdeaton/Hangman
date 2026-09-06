// Every primitive any mode in src/modes/*.tsx actually imports needs an entry here — this used to
// only cover whichever ones happened to get exercised, since GameVisual/ModeSelector's own
// measure-then-mount gates meant most modes' <Visual> never actually rendered in tests at all
// (Ellipse was missing and nothing surfaced it until those gates came out).
module.exports = {
  __esModule: true,
  default: ({ children }: any) => children,
  Svg: ({ children }: any) => children,
  Circle: 'Circle',
  ClipPath: 'ClipPath',
  Defs: 'Defs',
  Ellipse: 'Ellipse',
  G: 'G',
  Line: 'Line',
  Path: 'Path',
  Rect: 'Rect',
  Text: 'Text'
}
