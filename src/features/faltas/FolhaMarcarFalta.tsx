import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'

import { Botao } from '@/components/ui/Botao.tsx'
import { useMarcarFalta } from '@/data/queries.ts'
import { diaDaSemana, formatarExtenso, hojeISO } from '@/domain/data.ts'
import { projetarAulas } from '@/domain/diasRestantes.ts'
import { formatarHoras, formatarPercentual, statusPara } from '@/domain/risco.ts'
import { NOME_DIA, type Limites } from '@/domain/tipos.ts'
import type { CartaoPainel } from '@/features/dashboard/usePainel.ts'
import { cn } from '@/lib/cn.ts'

/**
 * §3 — Registro de falta: "seleciona a disciplina e a data" e pronto.
 *
 * Nenhum campo de horas. Elas vêm da grade, calculadas pelo trigger no banco.
 * O que a tela mostra antes de confirmar é o EFEITO: quantas horas isso vai
 * custar e para onde o semáforo vai. É também onde entra o aviso preventivo
 * da §6 — "se você faltar de novo nesta disciplina, vai passar de 25%" — no
 * único momento em que ele muda uma decisão.
 */

interface Props {
  readonly cartoes: readonly CartaoPainel[]
  readonly limites: Limites
  readonly usuarioId: string
  readonly disciplinaInicial?: string | undefined
  /** Vinda do calendário: a pessoa tocou num dia específico. */
  readonly dataInicial?: string | undefined
  readonly aoFechar: () => void
}

export function FolhaMarcarFalta({
  cartoes,
  limites,
  usuarioId,
  disciplinaInicial,
  dataInicial,
  aoFechar,
}: Props) {
  const hoje = hojeISO()
  const [disciplinaId, setDisciplinaId] = useState(
    disciplinaInicial ?? cartoes[0]?.disciplina.id ?? '',
  )
  const [data, setData] = useState(dataInicial ?? hoje)
  const [erro, setErro] = useState<string | null>(null)

  const marcar = useMarcarFalta(usuarioId)
  const cartao = cartoes.find((c) => c.disciplina.id === disciplinaId)

  const previsao = useMemo(() => {
    if (cartao === undefined) return null

    const dow = diaDaSemana(data)
    const aula = cartao.disciplina.grade.find((a) => a.dia === dow)

    // Sem aula nesse dia da semana, o banco recusaria. Melhor dizer agora.
    if (aula === undefined) {
      return {
        temAula: false as const,
        diasComAula: cartao.disciplina.grade.map((a) => NOME_DIA[a.dia]).join(', '),
      }
    }

    const novoTotal = cartao.risco.totalFaltado + aula.horas
    const novoPercentual =
      cartao.disciplina.cargaHorariaTotal > 0
        ? novoTotal / cartao.disciplina.cargaHorariaTotal
        : 0
    const novoStatus = statusPara(novoPercentual, limites)
    const saldoDepois = Math.max(cartao.risco.horasLimite - novoTotal, 0)

    return {
      temAula: true as const,
      horas: aula.horas,
      novoPercentual,
      novoStatus,
      mudaDeFaixa: novoStatus !== cartao.risco.status,
      estoura: novoTotal > cartao.risco.horasLimite,
      // §6: e depois desta, a próxima já estoura?
      proximaEstoura: projetarAulas(cartao.disciplina.grade, saldoDepois, data).proximaAulaEstoura,
    }
  }, [cartao, data, limites])

  async function confirmar() {
    if (cartao === undefined) return
    setErro(null)
    try {
      await marcar.mutateAsync({ disciplinaId, data })
      aoFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui registrar.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={aoFechar}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="area-segura-base relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-card bg-superficie p-6 shadow-flutuante sm:rounded-card"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-texto">Marcar falta</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="grid size-9 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <span className="mb-2 block text-sm font-extrabold text-texto">Disciplina</span>
            <div className="space-y-2">
              {cartoes.map((c) => (
                <button
                  key={c.disciplina.id}
                  type="button"
                  onClick={() => {
                    setDisciplinaId(c.disciplina.id)
                  }}
                  aria-pressed={c.disciplina.id === disciplinaId}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-controle border-2 px-3 py-2.5 text-left transition-colors',
                    c.disciplina.id === disciplinaId
                      ? 'border-acento bg-acento-suave'
                      : 'border-borda hover:border-borda-forte',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: c.disciplina.cor }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-texto">
                    {c.disciplina.nome}
                  </span>
                  {c.disciplina.id === disciplinaId && (
                    <Check className="size-4 shrink-0 text-acento" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="data-falta" className="mb-1.5 block text-sm font-extrabold text-texto">
              Data
            </label>
            <input
              id="data-falta"
              type="date"
              value={data}
              max={hoje}
              onChange={(e) => {
                setData(e.target.value)
              }}
              className="h-13 w-full rounded-controle border-2 border-borda bg-superficie-2 px-4 font-semibold text-texto outline-none transition-colors focus:border-acento"
            />
            <p className="mt-1.5 text-xs font-semibold text-texto-fraco">
              {formatarExtenso(data)}
            </p>
          </div>

          {/* O efeito, antes de confirmar */}
          {previsao !== null && !previsao.temAula && (
            <p className="rounded-interno bg-amarelo-suave px-3 py-2.5 text-sm font-bold text-amarelo">
              Esta disciplina não tem aula nesse dia — só {previsao.diasComAula}. Confira a
              data.
            </p>
          )}

          {previsao !== null && previsao.temAula && cartao !== undefined && (
            <div className="rounded-interno bg-superficie-2 p-4">
              <p className="text-sm font-bold text-texto">
                Vai descontar{' '}
                <span className="text-acento">{formatarHoras(previsao.horas)}</span> de{' '}
                {formatarHoras(cartao.disciplina.cargaHorariaTotal)}.
              </p>
              <p className="mt-1 text-sm font-semibold text-texto-suave">
                {formatarPercentual(cartao.risco.percentual)} →{' '}
                <span className="font-extrabold text-texto">
                  {formatarPercentual(previsao.novoPercentual)}
                </span>
              </p>

              {previsao.estoura && (
                <p className="mt-3 flex gap-2 rounded-interno bg-vermelho-suave px-3 py-2 text-xs font-bold text-vermelho">
                  <AlertTriangle className="size-4 shrink-0" />
                  Esta falta já passa do limite de{' '}
                  {formatarPercentual(limites.limiteReprovacao, 0)}.
                </p>
              )}

              {/* §6 — o aviso preventivo, no momento em que ele importa */}
              {!previsao.estoura && previsao.proximaEstoura && (
                <p className="mt-3 flex gap-2 rounded-interno bg-amarelo-suave px-3 py-2 text-xs font-bold text-amarelo">
                  <AlertTriangle className="size-4 shrink-0" />
                  Depois desta, faltar de novo nesta disciplina passa de{' '}
                  {formatarPercentual(limites.limiteReprovacao, 0)}.
                </p>
              )}
            </div>
          )}

          {erro !== null && (
            <p
              role="alert"
              className="rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
            >
              {erro}
            </p>
          )}

          <Botao
            larguraTotal
            tamanho="lg"
            onClick={() => void confirmar()}
            disabled={marcar.isPending || cartao === undefined || previsao?.temAula !== true}
          >
            {marcar.isPending && <Loader2 className="size-5 animate-spin" />}
            Registrar falta
          </Botao>
        </div>
      </motion.div>
    </div>
  )
}
