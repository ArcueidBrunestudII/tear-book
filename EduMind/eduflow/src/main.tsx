import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import { BackPanelWindow } from './pages/BackPanelWindow'
import { FrontPanelWindow } from './pages/FrontPanelWindow'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/app/:appId/back" element={<BackPanelWindow />} />
        <Route path="/app/:appId/front" element={<FrontPanelWindow />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
