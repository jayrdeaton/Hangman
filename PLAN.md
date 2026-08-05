# Plan

## Notes

A ripple effect color change on the winning keypress would be really cool

The scroll view with inputs need to account for the keyboard.  Maybe that should be baked in to react-native-scroll-view rific module so that I don't have to worry about it on future projects.

I think it would be great if the 'wrong guess pips' actually showed the letters that were guessed and were wrong.  Then the correct guesses and the incorrect ones are all clearly visible without having to deduce anything.  The pip type could be an option, for the way it currently is vs that  option.

The generative ones, like balloons, need to have a fill color so the strings behind them dont show through the baloons.  Or the balloons (snowflakes too) could be random theme colors, that'd be a nice effect.

The snowflakes mode gave me more tries than the other modes?

Why is there a delay when opening and closing drawers?

How does random work?  Does it select a pack randomly first then inside the pack so they are weighted differently?  Or does a large pack get picked out of more often than a smaller pack?

I think I want the achievements unlocked to be called out in the win dialog instead of in a toast.  Make sure to include the trophy icon, maybe with a pulse or dance effect or something

I plan to add sound effects, so I'm wondering if I should add haptic and sound settings.  I think that these belong in a sub game menu setting dialog or screen, or collapsible part of the drawer or something (maybe they should all be collapsible), because I dont think keyboard layout and theme settings would get touched all that frequently.

The game menu is all about getting a game going.  You have the settings for it, then all the packs then the random and pass and play settings.  I think a press on a pack should start a random in that pack, one press and done.  Long press could take you to browse the pack.  Browsing the pack is also the first class action in achievements, so its available there too, but the game menu should get a game going as quickly as possible IMO.

Custom packs should have the place for a custom label, but get "Custom" by default if its empty.  Should be editable in the form. The form also should use react-native-focus-chain rific package.  If on last menu focus item it should add another.  That way you can just keep laternating between hint and answer then enter and never have to press away.  Make sure keyboards are being dismissed when navigated away from, I did find that was a bug. 

Hangman-Scrapers needs an update, US States has too many to be US States....

I also want more private packs.  Harry Potter, Lord of the Rings, Star Wars, Star Trek, etc etc.

## Swap redux-persist storage engine to MMKV

**Status:** Deferred, not urgent.

**Context:** expo-doctor flags `redux-persist` as unmaintained (no recent
releases). It's not broken — Hangman, Lumber, and CashierFu-Utility all use
the same `@reduxjs/toolkit` + `react-redux` + `redux-persist` stack on top of
`@react-native-async-storage/async-storage`, and it works fine on current
versions. Currently suppressed via `expo.doctor.reactNativeDirectoryCheck.exclude`
in `package.json`.

**Idea:** Rather than replacing redux-persist itself, swap the underlying
storage engine from AsyncStorage to `react-native-mmkv`. MMKV is synchronous
and significantly faster; redux-persist supports a custom storage adapter, so
this is a contained change (no Redux architecture rewrite).

**Tradeoff:** MMKV is a native module, so it requires a dev client build —
not compatible with Expo Go. Not a blocker since none of these projects rely
on Expo Go currently.

**Scope:** Could be rolled out the same way to Lumber and CashierFu-Utility
once validated here, since all three share the identical redux-persist setup.
