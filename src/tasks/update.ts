import * as TaskManager from 'expo-task-manager'
import * as Updates from 'expo-updates'

import { tasks } from '../constants'

TaskManager.defineTask(tasks.update, async () => {
  const update = await Updates.checkForUpdateAsync()
  if (update.isAvailable) {
    await Updates.fetchUpdateAsync()
    await Updates.reloadAsync()
  }
})
