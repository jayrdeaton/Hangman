import { Button } from '@rific/feedback-press'
import { DialogHeader, overlayActionStyles, OverlayBackdrop, OverlayCard } from '@tastic/hud/chrome'
import { JSX, useEffect, useRef, useState } from 'react'
import { BackHandler, StyleSheet, View } from 'react-native'
import { Portal, Text, TextInput, useTheme } from 'react-native-paper'
import Animated from 'react-native-reanimated'

import { SCREEN_GUTTER, useKeyboardLiftedCard } from '@/hooks/useKeyboardLiftedCard'
import { isPlayerNameTaken, MAX_PLAYER_NAME_LENGTH, normalizePlayerName, type PnpPlayer } from '@/utils/pnpSession'

export type PnpPlayerNameDialogProps = {
  // The seat being renamed. The loadout mounts this only while one is (keyed on it), so the field
  // always starts from that seat's name.
  player: PnpPlayer
  // The whole table, so a name another seat already goes by can't be saved.
  players: PnpPlayer[]
  onSave: (name: string) => void
  onCancel: () => void
}

// Renaming a Pass & Play player, on the fleet's card (@tastic/hud's OverlayBackdrop and OverlayCard,
// with the compact header so it keeps its room with the keyboard up): one Name field, then Cancel and
// Save. Save (or the keyboard's Done) is only offered for a name that's left something once trimmed
// and that nobody else at the table goes by. No backdrop dismissal, like every fleet card; Android's
// back button cancels. The card rises to clear the keyboard the way the Pass & Play prompt does
// (useKeyboardLiftedCard).
export const PnpPlayerNameDialog = ({ player, players, onSave, onCancel }: PnpPlayerNameDialogProps): JSX.Element => {
  const theme = useTheme()
  const { overlayStyle, cardMaxHeight, liftStyle, onCardLayout } = useKeyboardLiftedCard()
  const [name, setName] = useState(player.name)
  const normalized = normalizePlayerName(name)
  const taken = normalized !== '' && isPlayerNameTaken(players, normalized, player.id)
  const canSave = normalized !== '' && !taken

  // Added once, as the dialog opens (it's mounted only while open), onCancel read through a ref (hud's
  // ConfirmDialog idiom), so it stays ahead of the page's own listener and behind anything opened later.
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onCancelRef.current = onCancel
  })
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancelRef.current()
      return true
    })
    return () => subscription.remove()
  }, [])

  const handleSave = () => {
    if (canSave) onSave(normalized)
  }

  return (
    <Portal>
      <OverlayBackdrop style={[styles.overlay, overlayStyle]}>
        <Animated.View style={[styles.lift, liftStyle]} onLayout={onCardLayout}>
          <OverlayCard accessibilityViewIsModal style={[styles.card, { maxHeight: cardMaxHeight }]}>
            <DialogHeader icon='account-edit-outline' title='Player Name' compact />
            <View style={styles.field}>
              <TextInput testID='player-name-input' value={name} onChangeText={setName} onSubmitEditing={handleSave} label='Name' mode='outlined' autoFocus autoCapitalize='words' autoCorrect={false} spellCheck={false} returnKeyType='done' maxLength={MAX_PLAYER_NAME_LENGTH} />
              {/* Only once it's a problem, so the field doesn't open with a line of error text under it.
                  The line keeps its room either way, so the buttons don't jump as it comes and goes. */}
              <Text variant='bodySmall' accessibilityLiveRegion='polite' style={[styles.error, { color: theme.colors.error }]}>
                {taken ? 'Another player has this name' : ''}
              </Text>
            </View>
            <View style={overlayActionStyles.actions}>
              <Button mode='outlined' onPress={onCancel} style={overlayActionStyles.actionButton}>
                Cancel
              </Button>
              <Button mode='contained' onPress={handleSave} disabled={!canSave} style={overlayActionStyles.actionButton} buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary}>
                Save
              </Button>
            </View>
          </OverlayCard>
        </Animated.View>
      </OverlayBackdrop>
    </Portal>
  )
}

const styles = StyleSheet.create({
  card: { width: '100%' },
  // Paper's HelperText spacing, under the field: one bodySmall line, held open while empty.
  error: { minHeight: 24, paddingHorizontal: 12, paddingTop: 4 },
  field: { alignSelf: 'stretch' },
  // Full width so the card inside can take its 360 maximum, as it does straight in the backdrop.
  lift: { alignItems: 'center', width: '100%' },
  overlay: { paddingHorizontal: SCREEN_GUTTER }
})
