import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Generated from cssforge.config.ts by the CSS Forge Vite plugin.
import 'virtual:cssforge.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
