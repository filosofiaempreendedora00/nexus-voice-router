import { app } from 'electron'
import { join } from 'path'

export function resourcesPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath)
  }
  return join(app.getAppPath(), 'resources')
}
