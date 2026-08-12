import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { ContextoTema, type EstadoTema } from './contexto.ts'
import {
  CHAVE_DENSIDADE,
  CHAVE_MODO,
  CHAVE_TEMA,
  DENSIDADE_PADRAO,
  MODO_PADRAO,
  TEMA_PADRAO,
  ehDensidade,
  ehIdTema,
  ehModo,
  type Densidade,
  type IdTema,
  type Modo,
} from './temas.ts'

interface Origem {
  x: number
  y: number
}

const QUERY_ESCURO = '(prefers-color-scheme: dark)'
const QUERY_MOVIMENTO = '(prefers-reduced-motion: reduce)'

function lerArmazenado<T extends string>(
  chave: string,
  valida: (v: string) => v is T,
  padrao: T,
): T {
  try {
    const bruto = localStorage.getItem(chave)
    return bruto !== null && valida(bruto) ? bruto : padrao
  } catch {
    // localStorage bloqueado (aba anônima, iframe sem permissão): segue no padrão
    return padrao
  }
}

function guardar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor)
  } catch {
    // sem persistência é degradação aceitável; a sessão atual continua correta
  }
}

/**
 * Envolve a mudança numa View Transition, revelando o tema novo num círculo
 * que cresce a partir de onde a pessoa tocou.
 *
 * Se o navegador não suporta, ou se a pessoa pediu menos movimento, a mudança
 * acontece direto — o resultado final é idêntico, só sem o floreio.
 */
function aplicarComTransicao(mudanca: () => void, origem?: Origem): void {
  const querMenosMovimento = window.matchMedia(QUERY_MOVIMENTO).matches

  // A API está tipada no lib.dom, mas nem todo navegador a implementa —
  // por isso a checagem em runtime com `in`.
  if (querMenosMovimento || !('startViewTransition' in document)) {
    mudanca()
    return
  }

  const raiz = document.documentElement
  raiz.style.setProperty('--origem-x', `${String(origem?.x ?? window.innerWidth / 2)}px`)
  raiz.style.setProperty('--origem-y', `${String(origem?.y ?? 0)}px`)

  document.startViewTransition(mudanca)
}

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<IdTema>(() =>
    lerArmazenado(CHAVE_TEMA, ehIdTema, TEMA_PADRAO),
  )
  const [modo, setModo] = useState<Modo>(() => lerArmazenado(CHAVE_MODO, ehModo, MODO_PADRAO))
  const [densidade, setDensidade] = useState<Densidade>(() =>
    lerArmazenado(CHAVE_DENSIDADE, ehDensidade, DENSIDADE_PADRAO),
  )
  const [sistemaEscuro, setSistemaEscuro] = useState(
    () => window.matchMedia(QUERY_ESCURO).matches,
  )

  // Com modo = 'system', o app precisa acompanhar a troca feita no sistema
  // operacional sem recarregar a página.
  useEffect(() => {
    const mq = window.matchMedia(QUERY_ESCURO)
    const aoMudar = (e: MediaQueryListEvent) => {
      setSistemaEscuro(e.matches)
    }
    mq.addEventListener('change', aoMudar)
    return () => {
      mq.removeEventListener('change', aoMudar)
    }
  }, [])

  const modoEfetivo: 'light' | 'dark' =
    modo === 'system' ? (sistemaEscuro ? 'dark' : 'light') : modo

  // Reflete o estado no <html>. O index.html já fez isso uma vez antes do
  // primeiro paint; daqui para frente é o React que manda.
  useEffect(() => {
    const raiz = document.documentElement
    raiz.dataset.tema = tema
    raiz.dataset.modo = modoEfetivo
    raiz.dataset.densidade = densidade
    raiz.style.colorScheme = modoEfetivo

    // A barra de status do celular acompanha o fundo do app quando instalado.
    const cor = getComputedStyle(raiz).getPropertyValue('--c-fundo').trim()
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.setAttribute('content', cor)
    }
  }, [tema, modoEfetivo, densidade])

  const definirTema = useCallback((novo: IdTema, origem?: Origem) => {
    aplicarComTransicao(() => {
      setTema(novo)
      guardar(CHAVE_TEMA, novo)
    }, origem)
  }, [])

  const definirModo = useCallback((novo: Modo, origem?: Origem) => {
    aplicarComTransicao(() => {
      setModo(novo)
      guardar(CHAVE_MODO, novo)
    }, origem)
  }, [])

  const definirDensidade = useCallback((nova: Densidade) => {
    setDensidade(nova)
    guardar(CHAVE_DENSIDADE, nova)
  }, [])

  const alternarModo = useCallback(
    (origem?: Origem) => {
      definirModo(modoEfetivo === 'dark' ? 'light' : 'dark', origem)
    },
    [definirModo, modoEfetivo],
  )

  const valor = useMemo<EstadoTema>(
    () => ({
      tema,
      modo,
      densidade,
      modoEfetivo,
      definirTema,
      definirModo,
      definirDensidade,
      alternarModo,
    }),
    [
      tema,
      modo,
      densidade,
      modoEfetivo,
      definirTema,
      definirModo,
      definirDensidade,
      alternarModo,
    ],
  )

  return <ContextoTema value={valor}>{children}</ContextoTema>
}
