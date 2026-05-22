import { Tray, Menu, nativeImage, app } from 'electron'
import { createMainWindow, showOverlay } from './windows'

let tray: Tray | null = null

export function createTray(): void {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
  icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('NEXUS Voice Router')

  const menu = Menu.buildFromTemplate([
    { label: 'Falar agora', click: () => showOverlay() },
    { label: 'Abrir NEXUS', click: () => createMainWindow() },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => createMainWindow())
}

const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAJxJREFUOI3F0jEKwjAUxvFf0g7iIB7AyTN4Be/iJYTOLg6CR7DOLnoEZ69gFwfFRRwUUUFFnVTSpbQpgktw8AvJ4wv/95KQwL+rsJ8YCNGiHaqxwQ2vSqEUR0xQQRkfdHFAjFM6MMI5b3JNGsuU9CdJU/0HMzwwzgaFmCfyERZJI1XaSCITLPHKtV9hjjruWGGFNbZ4Jq//AfsAVL4UESdh1xQAAAAASUVORK5CYII='
