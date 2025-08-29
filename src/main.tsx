import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import BattleshipHeatmap from './BattleshipHeatmap.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BattleshipHeatmap />
  </StrictMode>,
)
