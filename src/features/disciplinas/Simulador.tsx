import { Minus, Plus, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ChipStatus } from '@/components/ChipStatus.tsx'
import { Medidor } from '@/components/Medidor.tsx'
import { formatarHoras, formatarPercentual, type ResumoRisco } from '@/domain/risco.ts'
import { descreverHipoteses, simular, type FaltaHipotetica } from '@/domain/simulador.ts'
import { NOME_DIA, type Disciplina, type Limites } from '@/domain/tipos.ts'

/**
 * §7.3 — "E se eu faltar mais [N] vezes?"
 *
 * A pessoa escolhe quantas faltas hipotéticas e em quais dias da semana —
 * porque cada dia pesa horas diferentes — e vê o percentual projetado e o
 * novo status. A conta roda em src/domain, sem tocar no banco: é uma pergunta,
 * não um registro.
 */
export function Simulador({
  disciplina,
  risco,
  limites,
}: {
  disciplina: Disciplina
  risco: ResumoRisco
  limites: Limites
}) {
  const [hipoteses, setHipoteses] = useState<FaltaHipotetica[]>(() =>
    disciplina.grade.map((a) => ({ dia: a.dia, quantidade: 0 })),
  )

  const simulacao = useMemo(
    () => simular(risco, hipoteses, disciplina.grade, limites),
    [risco, hipoteses, disciplina.grade, limites],
  )

  const nada = simulacao.faltasHipoteticas === 0

  function ajustar(dia: number, delta: number) {
    setHipoteses((atual) =>
      atual.map((h) =>
        h.dia === dia ? { ...h, quantidade: Math.max(h.quantidade + delta, 0) } : h,
      ),
    )
  }

  return (
    <section className="cartao p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-extrabold text-texto">E se eu faltar mais…</h2>
          <p className="mt-1 text-xs font-semibold text-texto-suave">
            Cada dia pesa diferente. Some as faltas e veja onde você cai.
          </p>
        </div>
        {!nada && (
          <button
            type="button"
            onClick={() => {
              setHipoteses((atual) => atual.map((h) => ({ ...h, quantidade: 0 })))
            }}
            className="flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1.5 text-xs font-bold text-texto-suave transition-colors hover:bg-superficie-2"
          >
            <RotateCcw className="size-3.5" />
            Limpar
          </button>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {hipoteses.map((h) => {
          const horas = disciplina.grade.find((a) => a.dia === h.dia)?.horas ?? 0
          return (
            <div
              key={h.dia}
              className="flex items-center gap-3 rounded-controle bg-superficie-2 px-3 py-2"
            >
              <span className="min-w-0 flex-1 text-sm font-bold text-texto capitalize">
                {NOME_DIA[h.dia]}
                <span className="ml-1.5 font-semibold text-texto-fraco">
                  {formatarHoras(horas)}
                </span>
              </span>

              <div className="flex shrink-0 items-center gap-1">
                <BotaoContador
                  rotulo={`Menos uma falta na ${NOME_DIA[h.dia]}`}
                  onClick={() => {
                    ajustar(h.dia, -1)
                  }}
                  desabilitado={h.quantidade === 0}
                >
                  <Minus className="size-4" />
                </BotaoContador>

                <output className="tabular w-7 text-center text-base font-extrabold text-texto">
                  {h.quantidade}
                </output>

                <BotaoContador
                  rotulo={`Mais uma falta na ${NOME_DIA[h.dia]}`}
                  onClick={() => {
                    ajustar(h.dia, 1)
                  }}
                >
                  <Plus className="size-4" />
                </BotaoContador>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 border-t border-borda pt-5">
        {nada ? (
          <p className="text-center text-sm font-semibold text-texto-fraco">
            Escolha quantas faltas simular acima.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-texto">
                Faltando {descreverHipoteses(hipoteses)}
              </p>
              <ChipStatus status={simulacao.statusProjetado} tamanho="sm" />
            </div>

            <div className="mt-3 flex items-baseline gap-2.5">
              <span className="figura-hero text-3xl text-texto">
                {formatarPercentual(simulacao.percentualProjetado)}
              </span>
              <span className="text-sm font-semibold text-texto-suave">
                era {formatarPercentual(simulacao.percentualAtual)}
              </span>
            </div>

            <Medidor
              className="mt-3"
              percentual={simulacao.percentualProjetado}
              status={simulacao.statusProjetado}
              limites={limites}
              mostrarEscala
              rotulo={`Projeção para ${disciplina.nome}`}
            />

            <p
              className={`mt-4 rounded-interno px-3 py-2.5 text-sm font-bold ${
                simulacao.ultrapassaLimite
                  ? 'bg-vermelho-suave text-vermelho'
                  : simulacao.piorouDeFaixa
                    ? 'bg-amarelo-suave text-amarelo'
                    : 'bg-verde-suave text-verde'
              }`}
            >
              {simulacao.ultrapassaLimite
                ? `Reprova por falta. Só cabem ${String(simulacao.quantasCabem)} dessas ${String(simulacao.faltasHipoteticas)}.`
                : simulacao.piorouDeFaixa
                  ? `Cabe, mas sai do ${simulacao.statusAtual}. Sobrariam ${formatarHoras(simulacao.horasRestantesDepois)}.`
                  : `Tranquilo. Ainda sobrariam ${formatarHoras(simulacao.horasRestantesDepois)}.`}
            </p>
          </>
        )}
      </div>
    </section>
  )
}

function BotaoContador({
  children,
  rotulo,
  onClick,
  desabilitado = false,
}: {
  children: React.ReactNode
  rotulo: string
  onClick: () => void
  desabilitado?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      onClick={onClick}
      disabled={desabilitado}
      className="grid size-9 place-items-center rounded-pill bg-superficie text-texto transition-colors hover:bg-acento-suave hover:text-acento disabled:opacity-30"
    >
      {children}
    </button>
  )
}
