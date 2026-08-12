import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import { observarInstalacao } from './features/pwa/instalacao.ts'
import './styles/index.css'

// Antes do render de propósito: `beforeinstallprompt` costuma disparar antes
// de o React montar, e um listener criado depois perderia o evento — o botão
// de instalar nunca apareceria no Android.
observarInstalacao()

const raiz = document.getElementById('root')
if (raiz === null) {
  throw new Error('Elemento #root não encontrado no index.html.')
}

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
