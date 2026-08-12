import type { ReactNode } from 'react'

import { MenuMais } from './MenuMais.tsx'
import { BotaoModo } from '@/components/SeletorTema.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useNotificacoes, usePerfil } from '@/data/queries.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'

/** Peças repetidas de tela: cabeçalho, carregando, erro e estado vazio. */

export function Cabecalho({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string
  subtitulo?: string
  acao?: ReactNode
}) {
  // Lidos daqui em vez de descidos por prop: o Cabeçalho aparece em dez telas
  // e nenhuma delas tem motivo para saber se você é admin. As duas queries já
  // estão no cache do TanStack Query — não custam requisição nova.
  const usuarioId = useUsuarioId()
  const perfil = usePerfil(usuarioId)
  const notificacoes = useNotificacoes(usuarioId)
  const naoLidos = (notificacoes.data ?? []).filter((n) => !n.lida).length

  return (
    <header className="area-segura-topo sticky top-0 z-20 border-b border-borda bg-fundo/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          {subtitulo !== undefined && (
            <p className="text-xs font-bold text-texto-fraco">{subtitulo}</p>
          )}
          <h1 className="truncate text-xl font-extrabold text-texto">{titulo}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {acao}
          <BotaoModo className="lg:hidden" />
          <MenuMais ehAdmin={perfil.data?.role === 'admin'} naoLidos={naoLidos} />
        </div>
      </div>
    </header>
  )
}

/**
 * Carregando sem pulo de layout: blocos com a mesma altura do conteúdo real.
 * `animate-pulse` respeita prefers-reduced-motion pela regra global do CSS.
 */
export function Esqueleto() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-5 pt-20 pb-28" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-card bg-superficie-2" />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-48 animate-pulse rounded-card bg-superficie-2" />
      ))}
    </div>
  )
}

export function Erro({ erro }: { erro: Error }) {
  return (
    <div className="mx-auto max-w-md px-5 pt-24">
      <Cartao className="p-6 text-center">
        <p className="text-3xl" aria-hidden="true">
          ⚠️
        </p>
        <h2 className="mt-3 font-extrabold text-texto">Não consegui carregar</h2>
        <p className="mt-1.5 text-sm font-semibold text-texto-suave">{erro.message}</p>
        <Botao
          className="mt-5"
          variante="secundario"
          onClick={() => {
            window.location.reload()
          }}
        >
          Tentar de novo
        </Botao>
      </Cartao>
    </div>
  )
}

export function Vazio({
  emoji,
  titulo,
  texto,
  acao,
}: {
  emoji: string
  titulo: string
  texto: string
  acao?: { rotulo: string; aoClicar: () => void }
}) {
  return (
    <Cartao className="p-8 text-center">
      <p className="text-4xl" aria-hidden="true">
        {emoji}
      </p>
      <h2 className="mt-4 font-extrabold text-texto">{titulo}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm font-semibold text-texto-suave">{texto}</p>
      {acao !== undefined && (
        <Botao className="mt-6" onClick={acao.aoClicar}>
          {acao.rotulo}
        </Botao>
      )}
    </Cartao>
  )
}
