import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Divider, IconButton, Modal, Portal, RadioButton, Text } from 'react-native-paper'

import { getSavedTheme, resetSettings, saveTheme, ThemeOverride } from '../utils/settings'
import { ColorPicker } from './ColorPicker'

const COLORS = {
  modalBackground: '#ffffff',
  danger: '#b00020'
}

export type SettingsScreenProps = {
  visible: boolean
  onDismiss: () => void
  color: string
  onColorChange: (c: string) => void
  onReset?: () => void
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ visible, onDismiss, color, onColorChange, onReset }) => {
  const [theme, setTheme] = useState<ThemeOverride>('system')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const saved = await getSavedTheme()
      if (mounted && saved) setTheme(saved)
    })()
    return () => {
      mounted = false
    }
  }, [visible])

  const applyTheme = async (t: ThemeOverride) => {
    setTheme(t)
    await saveTheme(t)
  }

  const handleReset = async () => {
    await resetSettings()
    if (onReset) onReset()
    onDismiss()
  }

  return (
    <Portal>
      <Modal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal}>
        <View style={styles.headerRow}>
          <Text variant='titleLarge'>Settings</Text>
          <IconButton icon='close' onPress={onDismiss} />
        </View>

        <Divider />

        <View style={styles.section}>
          <Text variant='titleMedium'>Theme</Text>
          <RadioButton.Group onValueChange={(v) => applyTheme(v as ThemeOverride)} value={theme}>
            <RadioButton.Item label='System' value='system' />
            <RadioButton.Item label='Light' value='light' />
            <RadioButton.Item label='Dark' value='dark' />
          </RadioButton.Group>
        </View>

        <Divider />

        <View style={styles.section}>
          <Text variant='titleMedium'>Primary color</Text>
          <ColorPicker color={color} onChange={onColorChange} />
        </View>

        <Divider />

        <View style={styles.actions}>
          <Button mode='contained' onPress={handleReset} buttonColor={COLORS.danger}>
            Reset to defaults
          </Button>
        </View>
      </Modal>
    </Portal>
  )
}

const styles = StyleSheet.create({
  actions: { alignItems: 'flex-end', marginTop: 16 },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  modal: {
    backgroundColor: COLORS.modalBackground,
    borderRadius: 8,
    margin: 20,
    padding: 16
  },
  section: { marginTop: 12 }
})
