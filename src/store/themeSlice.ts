import { createSlice, PayloadAction } from '@reduxjs/toolkit'

type Appearance = 'system' | 'light' | 'dark'
type ColorState = { appearance: Appearance; color: string }

const initialState: ColorState = { appearance: 'system', color: '#ff0000' }

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    setAppearance(state, action: PayloadAction<Appearance>) {
      state.appearance = action.payload
    },
    setColor(state, action: PayloadAction<string>) {
      state.color = action.payload
    }
  }
})

export const { setAppearance, setColor } = themeSlice.actions
export default themeSlice.reducer
