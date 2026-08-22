export type Point = [number, number]

// Every glyph is defined on this fixed box, baseline at the bottom (y grows downward, matching
// SVG) — SketchLetter (see sketchLetter.tsx) scales it to whatever height a caller needs.
export const GLYPH_WIDTH = 60
export const GLYPH_HEIGHT = 100

// A coarse polyline approximation of an elliptical arc, in screen-space degrees (0 = +x/right, 90 =
// +y/down, matching every other angle in this app — see sketchShapes.tsx's own SVG rotate() use).
// Round letters below build their curves from this rather than true bezier segments: one consistent
// technique across all 26 letters, and a slightly faceted curve reads as more hand-drawn, not less.
function arc(cx: number, cy: number, rx: number, ry: number, startDeg: number, endDeg: number, steps: number): Point[] {
  const pts: Point[] = []
  for (let i = 0; i <= steps; i++) {
    const deg = startDeg + ((endDeg - startDeg) * i) / steps
    const rad = (deg * Math.PI) / 180
    pts.push([cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)])
  }
  return pts
}

// Rotates a point set around (cx, cy), screen-space clockwise-positive degrees (matching arc()
// above). Used sparingly — only where a glyph's own symmetry needs a deliberate optical
// correction (see S below): a perfectly vertical, mirror-symmetric double-curve reliably reads as
// slightly tilted even though its spine is mathematically straight, the same correction real
// typefaces apply to their own S rather than leaving it "technically" upright.
function rotate(pts: Point[], cx: number, cy: number, deg: number): Point[] {
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return pts.map(([x, y]): Point => {
    const dx = x - cx
    const dy = y - cy
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
  })
}

// Each letter is one or more pen strokes (a stroke = one continuous polyline, drawn as one
// SketchPath) — deliberately simple monoline capitals in the same geometric hand as the rest of
// this app's sketch primitives (a star is a 10-point polygon, not a font glyph; the gallows is
// straight lines). Only A–Z: nothing else this app draws a letter for needs more than that (see
// SketchLetter's own fallback for any character not listed here).
export const GLYPHS: Record<string, Point[][]> = {
  A: [
    [
      [0, 100],
      [30, 0],
      [60, 100]
    ],
    [
      [13, 58],
      [47, 58]
    ]
  ],
  B: [
    [
      [5, 0],
      [5, 100]
    ],
    arc(5, 24, 30, 24, -90, 90, 20),
    arc(5, 74, 32, 26, -90, 90, 20)
  ],
  C: [arc(32, 50, 28, 50, 40, 320, 26)],
  D: [
    [
      [5, 0],
      [5, 100]
    ],
    arc(5, 50, 45, 50, -90, 90, 22)
  ],
  E: [
    [
      [50, 0],
      [5, 0],
      [5, 100],
      [50, 100]
    ],
    [
      [5, 50],
      [40, 50]
    ]
  ],
  F: [
    [
      [50, 0],
      [5, 0],
      [5, 100]
    ],
    [
      [5, 50],
      [40, 50]
    ]
  ],
  G: [
    arc(32, 50, 28, 50, 20, 320, 26),
    [
      [62, 55],
      [32, 55]
    ]
  ],
  H: [
    [
      [5, 0],
      [5, 100]
    ],
    [
      [55, 0],
      [55, 100]
    ],
    [
      [5, 50],
      [55, 50]
    ]
  ],
  I: [
    [
      [15, 0],
      [45, 0]
    ],
    [
      [30, 0],
      [30, 100]
    ],
    [
      [15, 100],
      [45, 100]
    ]
  ],
  J: [[[45, 0], [45, 65], ...arc(25, 65, 20, 25, 0, 140, 16)]],
  K: [
    [
      [5, 0],
      [5, 100]
    ],
    [
      [50, 0],
      [5, 50],
      [50, 100]
    ]
  ],
  L: [
    [
      [5, 0],
      [5, 100],
      [50, 100]
    ]
  ],
  M: [
    [
      [0, 100],
      [0, 0],
      [30, 55],
      [60, 0],
      [60, 100]
    ]
  ],
  N: [
    [
      [0, 100],
      [0, 0],
      [60, 100],
      [60, 0]
    ]
  ],
  O: [arc(30, 50, 28, 50, 0, 360, 32)],
  P: [
    [
      [5, 0],
      [5, 100]
    ],
    arc(5, 27, 32, 27, -90, 90, 18)
  ],
  Q: [
    arc(30, 50, 28, 50, 0, 360, 32),
    [
      [35, 75],
      [58, 100]
    ]
  ],
  R: [
    [
      [5, 0],
      [5, 100]
    ],
    arc(5, 27, 32, 27, -90, 90, 18),
    [
      [5, 54],
      [50, 100]
    ]
  ],
  // Two true semicircles (via arc() above) sharing one crossing point at the vertical center,
  // bulging opposite ways. ry=25 is load-bearing, not tunable: each half's own height is 2*ry, and
  // the two need to sum to exactly 100 (GLYPH_HEIGHT) to meet without a gap or an overlapping kink.
  // rx=28 (wider than ry, unlike a true semicircle) is the exact same radius C/G use for their own
  // single open arc — cx=32 is shared with them too, so this bulges out to x=4/x=60 exactly like
  // they do, not past it. A narrower rx (ry's own 25, a true semicircle) read as a tightly coiled
  // cursive squiggle, out of step with how open every other curved letter in this alphabet is.
  //
  // rotate(...,20) at the end: the shape above is perfectly mirror-symmetric (top bulges left,
  // bottom bulges right, spine dead vertical through x=32) and reads as tilted anyway — the top-
  // left/bottom-right mass pulls the eye along that diagonal even though nothing is geometrically
  // slanted. Clockwise is the right direction (confirmed against a live A/B — negative reads worse,
  // not better), it just took more of it than a first pass (6, then 16) suggested: this shape's
  // fat bulges and its thin terminal tips actually shift in opposite relative senses under a single
  // rotation, so eyeballing the terminals alone undersold how much correction the bulges — the part
  // that actually reads as "leaning" — still needed.
  S: [rotate([...arc(32, 25, 28, 25, 270, 90, 16), ...arc(32, 75, 28, 25, 270, 450, 16).slice(1)], 30, 50, 20)],
  T: [
    [
      [5, 0],
      [55, 0]
    ],
    [
      [30, 0],
      [30, 100]
    ]
  ],
  U: [[[5, 0], ...arc(30, 75, 25, 25, 180, 360, 16), [55, 0]]],
  V: [
    [
      [0, 0],
      [30, 100],
      [60, 0]
    ]
  ],
  W: [
    [
      [0, 0],
      [15, 100],
      [30, 45],
      [45, 100],
      [60, 0]
    ]
  ],
  X: [
    [
      [0, 0],
      [60, 100]
    ],
    [
      [60, 0],
      [0, 100]
    ]
  ],
  Y: [
    [
      [0, 0],
      [30, 50],
      [60, 0]
    ],
    [
      [30, 50],
      [30, 100]
    ]
  ],
  Z: [
    [
      [0, 0],
      [60, 0],
      [0, 100],
      [60, 100]
    ]
  ]
}
