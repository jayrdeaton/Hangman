import { createContext, useContext } from 'react'

export type AutoSaveCustomContextType = {
  // Whether a word you author gets kept in the "Custom" pack.
  //
  // Written when the round STARTS, not when it ends (see Main's handlePnpAuthored, at Hand off) —
  // so while it's on, the answer to the round currently being played is already sitting in the
  // pack before the guesser has solved it. The game menu stays reachable throughout a
  // pass-and-play session (see Main.tsx's Appbar.Header comment) — nothing locks it during
  // composing or play — so a guesser who knows to look (Choose packs → Custom → ✎) could in
  // principle read it there. That risk is the same one a written hint already carries; this toggle
  // is about whether the word survives past this one round, not about hiding it further.
  //
  // Defaults OFF, unlike the behaviour before this setting existed. Saving is a real disclosure:
  // anything in the Custom pack is readable in plain text via Choose packs → Custom → ✎, and once
  // that pack is selected the word joins the random draw pool. That's fine for a word you wrote for
  // yourself and surprising for one you wrote for someone sitting next to you, so the safe default
  // wins and PnpWordPrompt offers a toggle for the other case.
  autoSave: boolean
  setAutoSave: (autoSave: boolean) => void
}

export const AutoSaveCustomContext = createContext<AutoSaveCustomContextType>({
  autoSave: false,
  setAutoSave: () => {}
})

export const useAutoSaveCustom = () => useContext(AutoSaveCustomContext)
