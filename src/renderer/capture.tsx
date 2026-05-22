import { createRoot } from 'react-dom/client'
import { Capture } from './capture/Capture'

const root = createRoot(document.getElementById('capture-root')!)
root.render(<Capture />)
