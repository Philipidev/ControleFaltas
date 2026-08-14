import { BellOff, CalendarClock, Check, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import { Cartao } from '@/components/ui/Cartao.tsx'
import { useMarcarNotificacaoLida, useNotificacoes } from '@/data/queries.ts'
import { formatarBR } from '@/domain/data.ts'
import { acaoDoAlerta, destinoDoAlerta, emojiDoAlerta } from '@/domain/notificacoes.ts'
import { formatarHoras } from '@/domain/risco.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { usePainel } from '@/features/dashboard/usePainel.ts'
import { cn } from '@/lib/cn.ts'
import { Cabecalho, Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'
import type { LinhaNotificacao } from '@/types/database.ts'

/**
 * §6 — Alertas e notificações.
 *
 * Duas fontes, com origens diferentes:
 *
 * 1. Mudança de faixa — vem do banco. O trigger trg_falta_notifica compara o
 *    status antes e depois de cada falta e grava a notificação. Como é
 *    trigger, funciona mesmo se a falta for registrada por outro caminho.
 * 2. Resumo semanal — o mesmo cálculo da §6, no cliente.
 *
 * Havia uma terceira, "prazo de atestado acabando". Não há mais prazo para
 * marcar uma falta com atestado (0015), então não há o que avisar.
 */
export function TelaAlertas() {
  const usuarioId = useUsuarioId()
  const painel = usePainel(usuarioId)
  const notificacoes = useNotificacoes(usuarioId)
  const marcarLida = useMarcarNotificacaoLida(usuarioId)

  if (painel.erro !== null) return <Erro erro={painel.erro} />
  if (painel.carregando || notificacoes.isPending) return <Esqueleto />

  const lista = notificacoes.data ?? []
  const naoLidas = lista.filter((n) => !n.lida).length

  return (
    <>
      <Cabecalho
        titulo="Alertas"
        subtitulo={naoLidas > 0 ? `${String(naoLidas)} não lidos` : 'tudo em dia'}
      />

      <main className="mx-auto max-w-2xl space-y-4 px-5 pt-5 pb-28 lg:pb-10">
        {/* §6 — resumo semanal */}
        <Cartao className="p-5">
          <h2 className="flex items-center gap-2 font-extrabold text-texto">
            <CalendarClock className="size-5 text-acento" />
            Sua semana
          </h2>
          <p className="mt-2 text-sm font-semibold text-texto-suave">
            {painel.semana.mensagem}
          </p>

          {painel.semana.porDisciplina.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {painel.semana.porDisciplina.map((d) => (
                <li key={d.disciplinaId} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: d.cor }}
                  />
                  <span className="min-w-0 flex-1 truncate font-bold text-texto">{d.nome}</span>
                  <span className="tabular shrink-0 font-semibold text-texto-suave">
                    {d.faltas}× · {formatarHoras(d.horas)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        {/* §6 — mudanças de faixa, gravadas pelo trigger */}
        <section>
          <h2 className="mb-3 px-1 text-sm font-extrabold text-texto-suave">Histórico</h2>

          {lista.length === 0 ? (
            <Vazio
              emoji="🔔"
              titulo="Nenhum alerta ainda"
              texto="Você será avisado quando alguma disciplina entrar em amarelo ou vermelho."
            />
          ) : (
            <ul className="space-y-2">
              {lista.map((n) => (
                <li key={n.id}>
                  <LinhaAlerta
                    notificacao={n}
                    aoAbrir={() => {
                      if (!n.lida) marcarLida.mutate(n.id)
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <Cartao className="flex gap-3 p-4">
          <BellOff className="size-5 shrink-0 text-texto-fraco" />
          <p className="text-xs font-semibold text-texto-suave">
            Notificações fora do app (push) exigem a Edge Function do resumo semanal — ainda
            não implantada. Por enquanto os alertas vivem aqui e no ícone do app.
          </p>
        </Cartao>
      </main>
    </>
  )
}

/**
 * Um alerta com destino é um `Link`; sem destino, um `button`.
 *
 * A diferença importa além do estilo: o link ganha menu de contexto, abre em
 * nova aba com ctrl+clique e é anunciado como link por leitor de tela. Um
 * `button` com navigate() por dentro perde as três coisas.
 */
function LinhaAlerta({
  notificacao: n,
  aoAbrir,
}: {
  notificacao: LinhaNotificacao
  aoAbrir: () => void
}) {
  const destino = destinoDoAlerta(n.tipo, n.dados, n.disciplina_id)
  const emoji = emojiDoAlerta(n.tipo, n.titulo)
  const acao = destino === null ? null : acaoDoAlerta(n.tipo)

  const classe = cn(
    'flex w-full items-start gap-3 rounded-card border-2 p-4 text-left transition-colors',
    n.lida ? 'border-borda bg-superficie opacity-70' : 'border-acento bg-superficie',
  )

  const conteudo = (
    <>
      {emoji !== null && (
        <span aria-hidden="true" className="text-xl leading-none">
          {emoji}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block font-extrabold text-texto">{n.titulo}</span>
        {n.corpo !== '' && (
          <span className="mt-0.5 block text-xs font-semibold text-texto-suave">{n.corpo}</span>
        )}
        <span className="mt-1 flex items-center gap-1.5 text-[0.6875rem] font-semibold text-texto-fraco">
          {formatarBR(n.criado_em.slice(0, 10))}
          {acao !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-bold text-acento">{acao}</span>
              <ChevronRight className="size-3 text-acento" />
            </>
          )}
        </span>
      </span>

      {n.lida ? (
        <Check className="size-4 shrink-0 text-texto-fraco" />
      ) : (
        <span aria-label="não lido" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-acento" />
      )}
    </>
  )

  if (destino !== null) {
    return (
      <Link to={destino} onClick={aoAbrir} className={classe}>
        {conteudo}
      </Link>
    )
  }

  return (
    <button type="button" onClick={aoAbrir} className={classe}>
      {conteudo}
    </button>
  )
}
