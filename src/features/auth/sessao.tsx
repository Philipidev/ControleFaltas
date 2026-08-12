import type { Session } from '@supabase/supabase-js'
import { useEffect, useState, type ReactNode } from 'react'

import { ContextoSessao, type EstadoSessao } from './contexto.ts'
import { supabase } from '@/lib/supabase.ts'

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true

    // getSession() lê o token já guardado; onAuthStateChange cobre login,
    // logout, refresh do token e — importante no PWA — a volta de outra aba.
    void supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSessao(data.session)
      setCarregando(false)
    })

    const { data: inscricao } = supabase.auth.onAuthStateChange((_evento, nova) => {
      setSessao(nova)
      setCarregando(false)
    })

    return () => {
      vivo = false
      inscricao.subscription.unsubscribe()
    }
  }, [])

  const valor: EstadoSessao = {
    sessao,
    usuarioId: sessao?.user.id ?? null,
    carregando,
    sair: async () => {
      await supabase.auth.signOut()
    },
  }

  return <ContextoSessao value={valor}>{children}</ContextoSessao>
}
