import React from 'react'
import { createRoot } from 'react-dom/client'
import { Overlay } from './overlay/Overlay'
import './styles/globals.css'

const root = createRoot(document.getElementById('overlay-root')!)
root.render(
  <React.StrictMode>
    <Overlay />
  </React.StrictMode>
)
