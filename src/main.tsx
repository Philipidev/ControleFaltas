import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App.tsx'
import { observarFaixaFantasma } from './features/pwa/faixaFantasma.ts'
import { observarInstalacao } from './features/pwa/instalacao.ts'
import './styles/index.css'

// Antes do render de propósito: `beforeinstallprompt` costuma disparar antes
// de o React montar, e um listener criado depois perderia o evento — o botão
// de instalar nunca apareceria no Android.
observarInstalacao()

// Também antes do render: a barra de baixo é das primeiras coisas pintadas, e
// medir a faixa depois faria o menu saltar no primeiro frame.
observarFaixaFantasma()

const raiz = document.getElementById('root')
if (raiz === null) {
  throw new Error('Elemento #root não encontrado no index.html.')
}

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
