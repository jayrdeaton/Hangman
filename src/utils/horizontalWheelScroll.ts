import { Platform } from 'react-native'

type WheelLikeEvent = {
  currentTarget: { scrollLeft: number }
  deltaX: number
  deltaY: number
  preventDefault: () => void
}

// react-native-web forwards unrecognized DOM event props like onWheel straight through to the
// rendered element, so a horizontal ScrollView/FlatList can accept this prop directly; native
// silently ignores it. Redirects vertical mouse-wheel input into horizontal scroll — on web there's
// no visible scrollbar and no native drag-to-scroll affordance for a hidden-indicator carousel.
export const horizontalWheelScrollProps =
  Platform.OS === 'web'
    ? {
        onWheel: (e: WheelLikeEvent) => {
          if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
          e.currentTarget.scrollLeft += e.deltaY
          e.preventDefault()
        }
      }
    : {}
