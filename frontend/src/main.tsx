// main.tsx — The entry point for the entire React application.
// This is the first JavaScript file that runs when a user opens the app in their browser.
// It finds the <div id="root"> element in the HTML page and mounts the React app into it.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// createRoot() connects React to the actual HTML page (the DOM).
// The "!" after getElementById('root') is TypeScript's "non-null assertion" —
// it tells the compiler "trust me, this element definitely exists" (it's in index.html).
// StrictMode is a development-only wrapper that helps catch common mistakes
// by intentionally double-rendering components to expose side effects.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
