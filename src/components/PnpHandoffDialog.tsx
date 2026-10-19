import { Button } from '@rific/feedback-press'
import { ConfirmDialog, overlayActionStyles, OverlayBackdrop, OverlayCard, useCompactDialog, useOverlayCardColors } from '@tastic/hud/chrome'
import { type Profile, ProfileChip } from '@tastic/profile'
import { JSX, useEffect } from 'react'
import { BackHandler, StyleSheet, View } from 'react-native'
import { Portal, Text, useTheme } from 'react-native-paper'

import { ReadableAccent } from './ReadableAccent'

export type PnpHandoffDialogProps = {
  // False while the Settings sheet is open (or the game screen isn't the one showing), the same
  // contract as PnpWordPrompt's promptVisible: this card steps aside rather than fighting it for the
  // screen.
  visible: boolean
  // Who the word is for, and who wrote it. The guesser's profile, when they sit as one, heads the card
  // in place of the hand-off glyph.
  guesserName: string
  guesserProfile?: Profile | null
  writerName: string
  onReady: () => void
}

// The size of hud's DialogHeader icon, full and compact, which the guesser's chip stands in for.
const HEADER_CHIP_SIZE = 64
const COMPACT_HEADER_CHIP_SIZE = 32

type ProfileHandoffCardProps = { visible: boolean; title: string; message: string; profile: Profile; onReady: () => void }

// ConfirmDialog's card with one Ready, headed by the guesser's chip instead of an icon: the same
// backdrop, card and header layout (hud's DialogHeader, compact in a short space), and the same answer
// to Android back while it's up: none (Ready is the only way on), the press consumed so nothing behind
// the card takes it.
const ProfileHandoffCard = ({ visible, title, message, profile, onReady }: ProfileHandoffCardProps): JSX.Element | null => {
  const theme = useTheme()
  const { fg } = useOverlayCardColors()
  const { compact, onLayout } = useCompactDialog(0)

  useEffect(() => {
    if (!visible) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true)
    return () => subscription.remove()
  }, [visible])

  if (!visible) return null

  return (
    <Portal>
      <OverlayBackdrop style={styles.overlay} onLayout={onLayout}>
        <OverlayCard style={styles.card}>
          <View style={compact ? styles.headerCompact : styles.header}>
            <ProfileChip profile={profile} size={compact ? COMPACT_HEADER_CHIP_SIZE : HEADER_CHIP_SIZE} />
            <Text accessibilityRole='header' variant={compact ? 'headlineSmall' : 'headlineLarge'} style={[styles.title, compact && styles.titleCompact, { color: theme.colors.primary }]}>
              {title}
            </Text>
          </View>
          <Text variant='bodyLarge' style={[styles.body, { color: fg }]}>
            {message}
          </Text>
          <View style={overlayActionStyles.actions}>
            <Button mode='contained' onPress={onReady} style={overlayActionStyles.actionButtonSingle} buttonColor={theme.colors.primary} textColor={theme.colors.onPrimary}>
              Ready
            </Button>
          </View>
        </OverlayCard>
      </OverlayBackdrop>
    </Portal>
  )
}

// The beat while the device changes hands: the fleet's shared card (@tastic/hud's ConfirmDialog, the
// same one every confirm in the app uses) naming who to hand it to ("Player 2's Turn") and whose word
// is waiting, with a single Ready button. A guesser sitting as a profile gets the same card headed by
// their chip, so the device goes to the right person. It says nothing about not peeking. There's no
// Cancel: the round is already set up, so the only way forward is Ready. The card has no backdrop
// dismissal either, so a stray touch during the physical hand-off can't end it early or reach the
// keyboard underneath (Game is also locked until Ready, see its `locked` prop).
export const PnpHandoffDialog = ({ visible, guesserName, guesserProfile, writerName, onReady }: PnpHandoffDialogProps): JSX.Element | null => {
  const title = `${guesserName}'s Turn`
  const message = `${writerName}'s word is set.`
  // In a shade of the guesser's color that reads on the card (ReadableAccent).
  return <ReadableAccent>{guesserProfile ? <ProfileHandoffCard visible={visible} title={title} message={message} profile={guesserProfile} onReady={onReady} /> : <ConfirmDialog visible={visible} icon='account-arrow-right' title={title} message={message} confirmLabel='Ready' onConfirm={onReady} />}</ReadableAccent>
}

const styles = StyleSheet.create({
  body: { textAlign: 'center' },
  // ConfirmDialog's own additions to the shared card and backdrop: the card claims its full width, kept
  // 24 off the screen edges.
  card: { width: '100%' },
  // DialogHeader's two layouts: the chip over the title, or beside it in a short space.
  header: { alignItems: 'center', alignSelf: 'stretch', gap: 16 },
  headerCompact: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', gap: 12, justifyContent: 'center' },
  overlay: { paddingHorizontal: 24 },
  title: { fontWeight: 'bold', textAlign: 'center' },
  titleCompact: { flexShrink: 1 }
})
