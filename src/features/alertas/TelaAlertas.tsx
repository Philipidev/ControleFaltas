import { BellOff, CalendarClock, Check } from 'lucide-react'

import { Cartao } from '@/components/ui/Cartao.tsx'
import { useFaltas, useMarcarNotificacaoLida, useNotificacoes } from '@/data/queries.ts'
import { formatarBR } from '@/domain/data.ts'
import { faltasComPrazoCorrendo } from '@/domain/justificativa.ts'
import { formatarHoras } from '@/domain/risco.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { usePainel } from '@/features/dashboard/usePainel.ts'
import { cn } from '@/lib/cn.ts'
import { Cabecalho, Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'

/**
 * §6 — Alertas e notificações.
 *
 * Três fontes, com origens diferentes:
 *
 * 1. Mudança de faixa — vem do banco. O trigger trg_falta_notifica compara o
 *    status antes e depois de cada falta e grava a notificação. Como é
 *    trigger, funciona mesmo se a falta for registrada por outro caminho.
 * 2. Prazo de atestado acabando — calculado no cliente a partir das faltas,
 *    porque depende só de data e não vale um round-trip.
 * 3. Resumo semanal — o mesmo cálculo da §6, também no cliente.
 */
export function TelaAlertas() {
  const usuarioId = useUsuarioId()
  const painel = usePainel(usuarioId)
  const faltas = useFaltas(usuarioId)
  const notificacoes = useNotificacoes(usuarioId)
  const marcarLida = useMarcarNotificacaoLida(usuarioId)

  if (painel.erro !== null) return <Erro erro={painel.erro} />
  if (painel.carregando || notificacoes.isPending) return <Esqueleto />

  const prazosCorrendo = faltasComPrazoCorrendo(faltas.data ?? [], painel.hoje, 3)
  const lista = notificacoes.data ?? []
  const naoLidas = lista.filter((n) => !n.lida).length

  const nomePorId = new Map(painel.cartoes.map((c) => [c.disciplina.id, c.disciplina]))

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

        {/* §7.1 — prazos de atestado prestes a vencer */}
        {prazosCorrendo.length > 0 && (
          <Cartao className="p-5">
            <h2 className="font-extrabold text-texto">Prazos de atestado acabando</h2>
            <ul className="mt-3 space-y-2">
              {prazosCorrendo.map(({ falta, situacao }) => (
                <li
                  key={falta.id}
                  className={cn(
                    'rounded-interno px-3 py-2.5',
                    situacao.urgente ? 'bg-amarelo-suave' : 'bg-superficie-2',
                  )}
                >
                  <p
                    className={cn(
                      'text-sm font-bold',
                      situacao.urgente ? 'text-amarelo' : 'text-texto',
                    )}
                  >
                    {nomePorId.get(falta.disciplinaId)?.nome ?? 'Disciplina'} ·{' '}
                    {formatarBR(falta.data)}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-texto-suave">
                    {situacao.mensagem}
                  </p>
                </li>
              ))}
            </ul>
          </Cartao>
        )}

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
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.lida) marcarLida.mutate(n.id)
                    }}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-card border-2 p-4 text-left transition-colors',
                      n.lida
                        ? 'border-borda bg-superficie opacity-70'
                        : 'border-acento bg-superficie',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-extrabold text-texto">{n.titulo}</span>
                      {n.corpo !== '' && (
                        <span className="mt-0.5 block text-xs font-semibold text-texto-suave">
                          {n.corpo}
                        </span>
                      )}
                      <span className="mt-1 block text-[0.6875rem] font-semibold text-texto-fraco">
                        {formatarBR(n.criado_em.slice(0, 10))}
                      </span>
                    </span>

                    {n.lida ? (
                      <Check className="size-4 shrink-0 text-texto-fraco" />
                    ) : (
                      <span
                        aria-label="não lido"
                        className="mt-1.5 size-2.5 shrink-0 rounded-full bg-acento"
                      />
                    )}
                  </button>
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
