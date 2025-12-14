import { StatusBar } from 'expo-status-bar'
import { JSX, useState } from 'react'
import { Alert, Platform, StyleSheet, View } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { Appbar, Button, Text, TextInput } from 'react-native-paper'

import { useTheme } from '../hooks'
import { ColorPicker } from './ColorPicker'

export type SetupProps = {
  onStart: (value: string) => void
}

export const Setup = ({ onStart }: SetupProps): JSX.Element => {
  const { color, setColor } = useTheme()
  // Game state
  const [phrase, setPhrase] = useState('')
  const [isSecure, setIsSecure] = useState(false)
  const handleSecure = () => setIsSecure((s) => !s)
  const handleStart = () => {
    const normalized = phrase
      .replace(/[^A-Za-z ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
    if (!normalized || normalized.replace(/ /g, '').length === 0) {
      Alert.alert('Enter a valid word', 'Please enter a secret word using letters A–Z (spaces allowed)')
      return
    }
    onStart(normalized)
  }
  return (
    <View style={StyleSheet.absoluteFill}>
      <Appbar.Header>
        <Appbar.Content title='Setup' />
        {/* <Appbar.Action icon='cog' onPress={() => setSettingsVisible(true)} accessibilityLabel='Settings' /> */}
      </Appbar.Header>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}>
        <View style={styles.setupContainer}>
          <Text style={styles.title}>Pass & Play — Enter a secret word</Text>
          <TextInput style={styles.input} value={phrase} onChangeText={setPhrase} placeholder='Secret word (letters and spaces allowed)' autoCapitalize='characters' secureTextEntry={!isSecure} maxLength={128} numberOfLines={3} mode='outlined' right={<TextInput.Icon icon={isSecure ? 'eye-off' : 'eye'} onPress={handleSecure} />} />
          <ColorPicker label='Pick accent color for this round' color={color} onChange={setColor} />
          <Button mode='contained' onPress={handleStart} style={styles.margin}>
            Start Game
          </Button>
        </View>
        <StatusBar style='auto' />
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 16
  },
  input: {
    textAlignVertical: 'top',
    width: '100%'
  },
  margin: { marginVertical: 8 },
  setupContainer: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%'
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12
  }
})
