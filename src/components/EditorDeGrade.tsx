import { X } from 'lucide-react'

import { deHoraMinuto, emHoraMinuto, formatarHoraMinuto } from '@/domain/risco.ts'
import { DIAS_SEMANA, NOME_DIA, NOME_DIA_CURTO, type DiaSemana } from '@/domain/tipos.ts'
import { cn } from '@/lib/cn.ts'

/**
 * Em quais dias tem aula, e de quanto tempo.
 *
 * Era uma fileira de sete campos decimais. O problema apareceu com um horário
 * real: uma aula de 4h10 vale 4,1666… e ninguém faz essa conta de cabeça —
 * quem digitasse "4,1" perderia seis minutos por aula, para sempre e sem
 * aviso, porque o campo aceita qualquer número. Agora pergunta em hora e
 * minuto, que é como o horário está escrito no papel.
 *
 * A fileira de sete virou seleção de dias: seis campos vazios ocupavam a
 * mesma largura do único que interessava, e numa tela de celular isso deixava
 * o campo que importa com 40px. Escolhido o dia, ele ganha uma linha inteira.
 *
 * Ligar um dia copia a duração do primeiro já preenchido — quase toda
 * disciplina repete o mesmo horário nos dias em que acontece, e digitar
 * "4h10" três vezes é onde o erro entra.
 */

export interface AulaEditavel {
  readonly dia: DiaSemana
  readonly horas: number
  readonly horaInicio?: string | null
}

const PADRAO = 2

export function EditorDeGrade({
  valor,
  aoMudar,
  comHorario = false,
}: {
  valor: readonly AulaEditavel[]
  aoMudar: (grade: readonly AulaEditavel[]) => void
  /** Horário de início por dia — só o catálogo do admin usa. */
  comHorario?: boolean
}) {
  const porDia = new Map(valor.map((a) => [a.dia, a]))
  const emOrdem = DIAS_SEMANA.flatMap((d) => {
    const a = porDia.get(d)
    return a === undefined ? [] : [a]
  })
  const totalSemana = emOrdem.reduce((s, a) => s + a.horas, 0)

  function alternar(dia: DiaSemana): void {
    if (porDia.has(dia)) {
      aoMudar(emOrdem.filter((a) => a.dia !== dia))
      return
    }
    aoMudar([...emOrdem, { dia, horas: emOrdem[0]?.horas ?? PADRAO, horaInicio: null }])
  }

  function trocar(dia: DiaSemana, mudanca: Partial<AulaEditavel>): void {
    aoMudar(emOrdem.map((a) => (a.dia === dia ? { ...a, ...mudanca } : a)))
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {DIAS_SEMANA.map((dia) => {
          const aula = porDia.get(dia)
          return (
            <button
              key={dia}
              type="button"
              aria-pressed={aula !== undefined}
              aria-label={`Aula na ${NOME_DIA[dia]}`}
              onClick={() => {
                alternar(dia)
              }}
              className={cn(
                'flex h-14 flex-col items-center justify-center gap-0.5 rounded-interno border-2 transition-colors',
                aula === undefined
                  ? 'border-borda text-texto-fraco'
                  : 'border-acento bg-acento-suave text-acento',
              )}
            >
              <span className="text-[0.625rem] font-bold uppercase">{NOME_DIA_CURTO[dia]}</span>
              <span className="tabular text-[0.6875rem] font-extrabold">
                {aula === undefined ? '—' : formatarHoraMinuto(aula.horas)}
              </span>
            </button>
          )
        })}
      </div>

      {emOrdem.length === 0 && (
        <p className="mt-2.5 text-xs font-semibold text-texto-fraco">
          Toque nos dias em que esta disciplina tem aula.
        </p>
      )}

      {emOrdem.length > 0 && (
        <ul className="mt-3 space-y-2">
          {emOrdem.map((aula) => {
            const { h, min } = emHoraMinuto(aula.horas)
            return (
              <li
                key={aula.dia}
                className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-interno bg-superficie-2 p-2.5"
              >
                <span className="w-16 shrink-0 text-xs font-extrabold text-texto">
                  {NOME_DIA[aula.dia].slice(0, 3)}
                </span>

                <Numero
                  rotulo={`Horas na ${NOME_DIA[aula.dia]}`}
                  valor={h}
                  max={12}
                  unidade="h"
                  aoMudar={(v) => {
                    trocar(aula.dia, { horas: deHoraMinuto(v, min) })
                  }}
                />
                <Numero
                  rotulo={`Minutos na ${NOME_DIA[aula.dia]}`}
                  valor={min}
                  max={59}
                  passo={5}
                  unidade="min"
                  aoMudar={(v) => {
                    trocar(aula.dia, { horas: deHoraMinuto(h, v) })
                  }}
                />

                {comHorario && (
                  <input
                    type="time"
                    value={aula.horaInicio ?? ''}
                    aria-label={`Horário de início na ${NOME_DIA[aula.dia]}`}
                    onChange={(e) => {
                      trocar(aula.dia, { horaInicio: e.target.value === '' ? null : e.target.value })
                    }}
                    className="h-10 min-w-28 flex-1 rounded-interno border-2 border-borda bg-superficie px-2 text-sm font-semibold text-texto outline-none focus:border-acento"
                  />
                )}

                <button
                  type="button"
                  aria-label={`Tirar a ${NOME_DIA[aula.dia]}`}
                  onClick={() => {
                    alternar(aula.dia)
                  }}
                  className="ml-auto grid size-8 shrink-0 place-items-center rounded-pill text-texto-fraco transition-colors hover:bg-vermelho-suave hover:text-vermelho"
                >
                  <X className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {totalSemana > 0 && (
        <p className="mt-2.5 text-xs font-semibold text-texto-suave">
          <strong className="font-extrabold text-texto">{formatarHoraMinuto(totalSemana)}</strong>{' '}
          de aula por semana
        </p>
      )}
    </div>
  )
}

/**
 * Campo numérico com a unidade colada.
 *
 * Vazio vale zero, e mostra vazio em vez de "0": apagar para digitar outro
 * número é o gesto mais comum aqui, e um "0" que reaparece atrapalha.
 */
function Numero({
  rotulo,
  valor,
  max,
  passo = 1,
  unidade,
  aoMudar,
}: {
  rotulo: string
  valor: number
  max: number
  passo?: number
  unidade: string
  aoMudar: (v: number) => void
}) {
  return (
    <span className="flex items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        step={passo}
        value={valor === 0 ? '' : String(valor)}
        placeholder="0"
        aria-label={rotulo}
        onChange={(e) => {
          const v = Number(e.target.value)
          aoMudar(Number.isNaN(v) ? 0 : Math.min(Math.max(v, 0), max))
        }}
        className="tabular h-10 w-14 rounded-interno border-2 border-borda bg-superficie px-1 text-center text-sm font-extrabold text-texto outline-none placeholder:font-semibold placeholder:text-texto-fraco focus:border-acento"
      />
      <span className="text-xs font-bold text-texto-suave">{unidade}</span>
    </span>
  )
}
