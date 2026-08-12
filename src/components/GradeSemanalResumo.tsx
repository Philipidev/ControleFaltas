import { formatarHoras } from '@/domain/risco.ts'
import { DIAS_SEMANA, NOME_DIA_CURTO, type GradeSemanal } from '@/domain/tipos.ts'
import { cn } from '@/lib/cn.ts'

/**
 * A grade semanal em sete quadradinhos.
 *
 * É a informação que explica todo o resto do app — por que faltar numa
 * segunda custa 4h e numa quarta custa 2h (§2). Mostrar as horas dentro de
 * cada dia deixa isso óbvio sem precisar de legenda.
 */
export function GradeSemanalResumo({
  grade,
  cor,
  className,
}: {
  grade: GradeSemanal
  cor?: string | undefined
  className?: string | undefined
}) {
  const porDia = new Map(grade.map((a) => [a.dia, a.horas]))

  return (
    <div className={cn('flex gap-1.5', className)}>
      {DIAS_SEMANA.map((dia) => {
        const horas = porDia.get(dia)
        const temAula = horas !== undefined

        return (
          <div
            key={dia}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 rounded-interno py-2 text-center',
              temAula ? 'text-status-contraste' : 'bg-superficie-2 text-texto-fraco',
            )}
            style={temAula && cor !== undefined ? { backgroundColor: cor } : undefined}
          >
            <span className="text-[0.625rem] font-bold uppercase">{NOME_DIA_CURTO[dia]}</span>
            <span className="tabular text-xs font-extrabold">
              {temAula ? formatarHoras(horas) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
