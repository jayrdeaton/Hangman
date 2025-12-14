import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from 'react-native-paper'
import ReanimatedColorPicker, { HueSlider } from 'reanimated-color-picker'

export type ColorPickerProps = {
  color: string
  label?: string
  onChange: (colorHex: string) => void
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, label, onChange }) => {
  const [hex, setHex] = useState(color)

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <ReanimatedColorPicker
        value={hex}
        onCompleteJS={(c) => {
          const newHex = c.hex
          setHex(newHex)
          onChange(newHex)
        }}
      >
        <HueSlider thumbSize={28} />
      </ReanimatedColorPicker>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { padding: 12, width: '100%' },
  label: { fontWeight: '600', marginBottom: 8, textAlign: 'center' }
})
