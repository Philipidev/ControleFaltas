import { comparar, diferencaEmDias, somarDias } from './data.ts'
import { REGRAS_PADRAO, type Falta, type RegrasFalta } from './tipos.ts'

/**
 * §7.5 — Streak de presença.
 *
 * "Contador de dias/semanas sem faltar. Zera quando há uma falta não
 * justificada. Falta justificada por atestado pode não quebrar o streak
 * (regra configurável). Gamificação leve, sem exagerar."
 */

export interface Streak {
  readonly diasSemFaltar: number
  readonly semanasSemFaltar: number
  /** Última falta que quebrou o streak. */
  readonly ultimaFalta: string | null
  /** Desde quando a sequência está correndo. */
  readonly desde: string | null
  /** Maior sequência já alcançada, em dias. */
  readonly recorde: number
  /** A sequência atual é o recorde? Vale confete. */
  readonly noRecorde: boolean
}

/** Uma falta quebra o streak? Depende da regra configurada (§7.5). */
export function quebraStreak(falta: Falta, regras: RegrasFalta): boolean {
  return !falta.justificada || regras.justificadaQuebraStreak
}

/**
 * @param inicioContagem  Início do semestre (ou da matrícula). Sem ele, quem
 *                        nunca faltou fica com streak zero, porque não há de
 *                        quando contar.
 */
export function calcularStreak(
  faltas: readonly Falta[],
  hoje: string,
  regras: RegrasFalta = REGRAS_PADRAO,
  inicioContagem?: string,
): Streak {
  const quebras = faltas
    .filter((f) => quebraStreak(f, regras))
    .map((f) => f.data)
    // ignora faltas lançadas com data futura: não quebram nada ainda
    .filter((data) => comparar(data, hoje) <= 0)
    .sort(comparar)

  const ultimaFalta = quebras.at(-1) ?? null
  const desde = ultimaFalta !== null ? somarDias(ultimaFalta, 1) : (inicioContagem ?? null)

  const diasSemFaltar =
    desde !== null ? Math.max(diferencaEmDias(desde, hoje) + 1, 0) : 0

  const recorde = Math.max(calcularRecorde(quebras, hoje, inicioContagem), diasSemFaltar)

  return {
    diasSemFaltar,
    semanasSemFaltar: Math.floor(diasSemFaltar / 7),
    ultimaFalta,
    desde,
    recorde,
    noRecorde: diasSemFaltar > 0 && diasSemFaltar >= recorde,
  }
}

/** Maior intervalo entre faltas consecutivas, em dias. */
function calcularRecorde(
  quebras: readonly string[],
  hoje: string,
  inicioContagem?: string,
): number {
  let maior = 0
  let anterior = inicioContagem ?? null

  for (const data of quebras) {
    if (anterior !== null) {
      maior = Math.max(maior, Math.max(diferencaEmDias(anterior, data) - 1, 0))
    }
    anterior = data
  }

  if (anterior !== null) {
    maior = Math.max(maior, Math.max(diferencaEmDias(anterior, hoje), 0))
  }

  return maior
}

/**
 * "3 semanas sem faltar 🔥" — reforço visual pedido pela spec, sem exagero.
 * Abaixo de uma semana mostra dias; a partir daí, semanas (é a unidade que a
 * pessoa sente).
 */
export function descreverStreak(streak: Streak): string {
  const { diasSemFaltar, semanasSemFaltar } = streak

  if (diasSemFaltar <= 0) return 'Comece hoje sua sequência'
  if (diasSemFaltar === 1) return '1 dia sem faltar'
  if (diasSemFaltar < 7) return `${String(diasSemFaltar)} dias sem faltar`
  if (semanasSemFaltar === 1) return '1 semana sem faltar'
  return `${String(semanasSemFaltar)} semanas sem faltar`
}

/** Marcos que valem uma comemoração discreta. */
const MARCOS_EM_DIAS = [7, 14, 21, 30, 60, 90, 120] as const

export function marcoAlcancado(streak: Streak): number | null {
  return MARCOS_EM_DIAS.find((m) => m === streak.diasSemFaltar) ?? null
}
