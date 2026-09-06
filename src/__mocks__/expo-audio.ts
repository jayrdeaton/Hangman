/* global jest */
module.exports = {
  Audio: {
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    Sound: jest.fn().mockImplementation(() => ({
      getStatusAsync: jest.fn().mockResolvedValue({}),
      loadAsync: jest.fn().mockResolvedValue(undefined),
      pauseAsync: jest.fn().mockResolvedValue(undefined),
      playAsync: jest.fn().mockResolvedValue(undefined),
      setOnPlaybackStatusUpdate: jest.fn(),
      stopAsync: jest.fn().mockResolvedValue(undefined),
      unloadAsync: jest.fn().mockResolvedValue(undefined)
    }))
  },
  setAudioModeAsync: jest.fn(),
  useAudioPlayer: jest.fn(() => ({
    duration: 0,
    currentTime: 0,
    isLoaded: false,
    isPlaying: false,
    load: jest.fn().mockResolvedValue(undefined),
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn(),
    addListener: jest.fn(() => ({
      remove: jest.fn()
    }))
  })),
  // @rific/feedback-press/audio's useAudioPool builds its pool with createAudioPlayer (a plain
  // factory), not the useAudioPlayer hook — both need mocking here.
  createAudioPlayer: jest.fn(() => ({
    duration: 0,
    currentTime: 0,
    isLoaded: false,
    isPlaying: false,
    load: jest.fn().mockResolvedValue(undefined),
    play: jest.fn(),
    pause: jest.fn(),
    stop: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn(),
    addListener: jest.fn(() => ({
      remove: jest.fn()
    }))
  }))
}
