import { useEffect, useRef } from 'react'
import { type EasingFunction, type EasingFunctionFactory, type SharedValue, useSharedValue, withTiming } from 'react-native-reanimated'

// A number that eases to each new target over `duration` (withTiming, from wherever it is, so a new
// target mid-way carries on smoothly), rather than jumping there. Only while `animate` is on, and only
// once it was already on for the value before: a first value (a first measurement), and any change
// made while animation is off (the page out of sight, the system's Reduce Motion on), lands at once,
// and turning it off mid-way lands the value where it was going. Nothing runs between changes.
export const useEasedValue = (target: number, animate: boolean, duration: number, easing?: EasingFunction | EasingFunctionFactory): SharedValue<number> => {
  const value = useSharedValue(target)
  const animatedBefore = useRef(false)
  useEffect(() => {
    // No `easing: undefined`: withTiming would take it over its own default and fail on the first frame.
    value.value = animate && animatedBefore.current ? withTiming(target, easing ? { duration, easing } : { duration }) : target
    animatedBefore.current = animate
  }, [value, target, animate, duration, easing])
  return value
}
