import { createContext, use } from 'react'

import type { Densidade, IdTema, Modo } from './temas.ts'

export interface EstadoTema {
  readonly tema: IdTema
  readonly modo: Modo
  readonly densidade: Densidade
  /** O que está de fato pintado agora — resolve 'system'. */
  readonly modoEfetivo: 'light' | 'dark'
  /**
   * @param origem Coordenadas do clique. Quando informadas, o tema novo é
   *   revelado num círculo que cresce a partir dali (View Transitions).
   */
  readonly definirTema: (tema: IdTema, origem?: { x: number; y: number }) => void
  readonly definirModo: (modo: Modo, origem?: { x: number; y: number }) => void
  readonly definirDensidade: (densidade: Densidade) => void
  readonly alternarModo: (origem?: { x: number; y: number }) => void
}

export const ContextoTema = createContext<EstadoTema | null>(null)

/**
 * O prefixo `use` não é enfeite: é o que faz o eslint-plugin-react-hooks
 * reconhecer isto como hook e validar as regras de hooks em cada chamada.
 * Um `usarTema` em português desligaria essa checagem no projeto inteiro.
 */
export function useTema(): EstadoTema {
  const contexto = use(ContextoTema)
  if (contexto === null) {
    throw new Error('useTema() precisa estar dentro de <TemaProvider>.')
  }
  return contexto
}
