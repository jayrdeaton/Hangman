import React from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Line } from 'react-native-svg'

export type HangmanDrawingProps = {
  wrongGuesses: number
  color?: string
  manColor?: string
}

export const HangmanDrawing: React.FC<HangmanDrawingProps> = ({ wrongGuesses, color = 'black', manColor = 'black' }) => {
  const parts: React.ReactNode[] = [<Circle key='head' cx='200' cy='80' r='30' stroke={manColor} strokeWidth='4' fill='none' />, <Line key='body' x1='200' y1='110' x2='200' y2='180' stroke={manColor} strokeWidth='4' />, <Line key='leftarm' x1='200' y1='130' x2='170' y2='150' stroke={manColor} strokeWidth='4' />, <Line key='rightarm' x1='200' y1='130' x2='230' y2='150' stroke={manColor} strokeWidth='4' />, <Line key='leftleg' x1='200' y1='180' x2='180' y2='220' stroke={manColor} strokeWidth='4' />, <Line key='rightleg' x1='200' y1='180' x2='220' y2='220' stroke={manColor} strokeWidth='4' />]

  return (
    <View style={styles.container}>
      <Svg width='300' height='300' viewBox='0 0 300 300'>
        <Line x1='50' y1='250' x2='250' y2='250' stroke={color} strokeWidth='4' />
        <Line x1='100' y1='250' x2='100' y2='20' stroke={color} strokeWidth='4' />
        <Line x1='100' y1='20' x2='200' y2='20' stroke={color} strokeWidth='4' />
        <Line x1='200' y1='20' x2='200' y2='50' stroke={color} strokeWidth='4' />
        {parts.slice(0, wrongGuesses)}
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginVertical: 20 }
})
