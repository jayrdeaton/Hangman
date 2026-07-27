import type { JSX } from 'react'

import { Fireworks } from './fireworks'

export type CelebrationProps = {
  colors: string[]
  dark?: boolean
  onComplete: () => void
}

export type CelebrationEffect = {
  id: string
  label: string
  Component: (props: CelebrationProps) => JSX.Element
}

const ALL_CELEBRATIONS: CelebrationEffect[] = [{ id: 'fireworks', label: 'Fireworks', Component: Fireworks }]

export const DEFAULT_CELEBRATION: CelebrationEffect = ALL_CELEBRATIONS[0]
