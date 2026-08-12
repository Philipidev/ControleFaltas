import type { Session } from '@supabase/supabase-js'
import { createContext, use } from 'react'

export interface EstadoSessao {
  readonly sessao: Session | null
  readonly usuarioId: string | null
  readonly carregando: boolean
  readonly sair: () => Promise<void>
}

export const ContextoSessao = createContext<EstadoSessao | null>(null)

export function useSessao(): EstadoSessao {
  const ctx = use(ContextoSessao)
  if (ctx === null) throw new Error('useSessao() precisa estar dentro de <SessaoProvider>.')
  return ctx
}

/**
 * O id do usuário logado, garantidamente presente.
 * Só use dentro de telas já protegidas pela rota autenticada — o throw aqui
 * transforma um erro de roteamento em falha barulhenta em vez de uma query
 * silenciosa com id vazio.
 */
export function useUsuarioId(): string {
  const { usuarioId } = useSessao()
  if (usuarioId === null) {
    throw new Error('useUsuarioId() chamado fora de uma rota autenticada.')
  }
  return usuarioId
}
