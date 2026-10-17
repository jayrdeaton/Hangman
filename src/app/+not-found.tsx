import { Redirect } from 'expo-router'
import { JSX } from 'react'

// Any path that isn't a screen (a mistyped web address, an old link) goes Home rather than to
// expo-router's own unmatched page.
const NotFound = (): JSX.Element => <Redirect href='/' />

export default NotFound
