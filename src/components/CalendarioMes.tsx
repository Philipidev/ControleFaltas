import { ChevronLeft, ChevronRight } from 'lucide-react'

import { montarMes, type DiaDoCalendario } from '@/domain/calendario.ts'
import {
  formatarMesAno,
  paraData,
  primeiroDiaDoMes,
  somarDias,
  ultimoDiaDoMes,
} from '@/domain/data.ts'
import { NOME_DIA_CURTO, type DiaSemana, type Disciplina, type Falta } from '@/domain/tipos.ts'
import { cn } from '@/lib/cn.ts'

/**
 * §7.6 — "Calendário visual: mês com as faltas marcadas por disciplina,
 * cores por matéria."
 *
 * Cada dia mostra um ponto por falta, na cor da matéria. Dias com aula (de
 * qualquer disciplina matriculada) ganham fundo levemente destacado — assim
 * a pessoa vê de relance a diferença entre "não faltei" e "não tinha aula",
 * que é uma distinção que só a grade conhece.
 */

interface Props {
  readonly mesDe: string
  readonly disciplinas: readonly Disciplina[]
  readonly faltas: readonly Falta[]
  readonly hoje: string
  readonly aoMudarMes: (novoMes: string) => void
  readonly aoTocarDia: (data: string) => void
}

export function CalendarioMes({
  mesDe,
  disciplinas,
  faltas,
  hoje,
  aoMudarMes,
  aoTocarDia,
}: Props) {
  const dias = montarMes(mesDe, disciplinas, faltas, hoje)
  const cabecalhos: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0] // segunda a domingo

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => {
            aoMudarMes(primeiroDiaDoMes(somarDias(primeiroDiaDoMes(mesDe), -1)))
          }}
          className="grid size-10 place-items-center rounded-pill bg-superficie-2 text-texto-suave transition-colors hover:bg-acento-suave hover:text-acento"
        >
          <ChevronLeft className="size-5" />
        </button>

        <h2 className="font-extrabold text-texto capitalize">{formatarMesAno(mesDe)}</h2>

        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => {
            aoMudarMes(somarDias(ultimoDiaDoMes(mesDe), 1))
          }}
          className="grid size-10 place-items-center rounded-pill bg-superficie-2 text-texto-suave transition-colors hover:bg-acento-suave hover:text-acento"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cabecalhos.map((d) => (
          <div
            key={d}
            className="pb-1 text-center text-[0.625rem] font-bold text-texto-fraco uppercase"
          >
            {NOME_DIA_CURTO[d]}
          </div>
        ))}

        {dias.map((dia) => (
          <CelulaDia key={dia.data} dia={dia} aoTocar={aoTocarDia} />
        ))}
      </div>
    </div>
  )
}

function CelulaDia({
  dia,
  aoTocar,
}: {
  dia: DiaDoCalendario
  aoTocar: (data: string) => void
}) {
  const numero = paraData(dia.data).getDate()
  const rotulo = `${String(numero)}${dia.faltas.length > 0 ? `, ${String(dia.faltas.length)} falta${dia.faltas.length > 1 ? 's' : ''}` : ''}`

  return (
    <button
      type="button"
      onClick={() => {
        aoTocar(dia.data)
      }}
      aria-label={rotulo}
      aria-current={dia.ehHoje ? 'date' : undefined}
      className={cn(
        'flex aspect-square flex-col items-center justify-center gap-1 rounded-interno transition-colors',
        !dia.doMes && 'opacity-30',
        dia.temAula ? 'bg-superficie-2' : 'bg-transparent',
        dia.ehHoje && 'ring-2 ring-acento',
        'hover:bg-acento-suave',
      )}
    >
      <span
        className={cn(
          'tabular text-sm leading-none font-bold',
          dia.ehHoje ? 'text-acento' : 'text-texto',
        )}
      >
        {numero}
      </span>

      {/* Um ponto por falta, na cor da matéria. Acima de três, o excedente
          vira "+N" para a célula não virar sopa de pontos. */}
      <span className="flex h-2 items-center gap-0.5">
        {dia.faltas.slice(0, 3).map(({ falta, disciplina }) => (
          <span
            key={falta.id}
            aria-hidden="true"
            className={cn('size-1.5 rounded-full', falta.justificada && 'opacity-45')}
            style={{ backgroundColor: disciplina?.cor ?? 'var(--c-texto-fraco)' }}
          />
        ))}
        {dia.faltas.length > 3 && (
          <span className="text-[0.5rem] leading-none font-bold text-texto-fraco">
            +{dia.faltas.length - 3}
          </span>
        )}
      </span>
    </button>
  )
}
