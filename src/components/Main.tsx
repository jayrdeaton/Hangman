import { JSX, useState } from 'react'

import { Game } from './Game'
import { Setup } from './Setup'

export const Main = (): JSX.Element => {
  const [phrase, setPhrase] = useState('')
  const handleStart = (value: string) => setPhrase(value)
  const handleStop = () => setPhrase('')
  return !phrase ? <Setup onStart={handleStart} /> : <Game onStop={handleStop} phrase={phrase} />
}
