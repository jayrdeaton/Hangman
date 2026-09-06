/* global jest */
const actual = jest.requireActual('redux-persist')

module.exports = {
  ...actual,
  persistStore: jest.fn(() => ({ purge: jest.fn(), flush: jest.fn() })),
  persistReducer: (_config: any, reducer: any) => reducer,
  persistCombineReducers: (_config: any, reducers: any) => reducers,
  createMigrate: jest.fn(),
  createTransform: jest.fn(),
  getStoredState: jest.fn().mockResolvedValue(undefined)
}
