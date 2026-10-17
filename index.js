import 'react-native-gesture-handler'

// expo-router's own entry renders the root layout (src/app/_layout.tsx) in place of the old
// App.tsx. Imported last so gesture-handler's side-effect import above still runs first.
import 'expo-router/entry'
