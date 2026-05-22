import { createRoot } from 'react-dom/client'
import { Hud } from './hud/Hud'
import './styles/globals.css'

const root = createRoot(document.getElementById('hud-root')!)
root.render(<Hud />)
