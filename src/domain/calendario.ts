import {
  diaDaSemana,
  intervaloDeDias,
  primeiroDiaDoMes,
  somarDias,
  ultimoDiaDoMes,
} from './data.ts'
import type { DiaSemana, Disciplina, Falta } from './tipos.ts'

/**
 * §7.6 — monta a grade do mês para o calendário visual.
 *
 * Pura e sem React, para poder ser testada: montar semanas de calendário é
 * onde erros de off-by-one costumam se esconder (a semana que começa na
 * segunda, o mês que termina no meio da linha, o ano bissexto).
 *
 * `temAula` é o que distingue "não faltei" de "não tinha aula" — informação
 * que só a grade semanal conhece e que o calendário precisa mostrar.
 */

export interface FaltaNoDia {
  readonly falta: Falta
  readonly disciplina: Disciplina | undefined
}

export interface DiaDoCalendario {
  readonly data: string
  readonly doMes: boolean
  readonly ehHoje: boolean
  readonly temAula: boolean
  readonly faltas: readonly FaltaNoDia[]
}

export function montarMes(
  mesDe: string,
  disciplinas: readonly Disciplina[],
  faltas: readonly Falta[],
  hoje: string,
): DiaDoCalendario[] {
  const primeiro = primeiroDiaDoMes(mesDe)
  const ultimo = ultimoDiaDoMes(mesDe)

  // Completa até a segunda anterior e o domingo seguinte, para o mês sempre
  // render linhas cheias de sete colunas.
  const dowPrimeiro = diaDaSemana(primeiro)
  const inicio = somarDias(primeiro, -(dowPrimeiro === 0 ? 6 : dowPrimeiro - 1))
  const dowUltimo = diaDaSemana(ultimo)
  const fim = somarDias(ultimo, dowUltimo === 0 ? 0 : 7 - dowUltimo)

  const diasComAula = new Set<DiaSemana>()
  for (const d of disciplinas) {
    for (const a of d.grade) diasComAula.add(a.dia)
  }

  const porId = new Map(disciplinas.map((d) => [d.id, d]))
  const porData = new Map<string, FaltaNoDia[]>()
  for (const f of faltas) {
    const lista = porData.get(f.data) ?? []
    lista.push({ falta: f, disciplina: porId.get(f.disciplinaId) })
    porData.set(f.data, lista)
  }

  const mesAlvo = primeiro.slice(0, 7)

  return [...intervaloDeDias(inicio, fim)].map((data) => ({
    data,
    doMes: data.startsWith(mesAlvo),
    ehHoje: data === hoje,
    temAula: diasComAula.has(diaDaSemana(data)),
    faltas: porData.get(data) ?? [],
  }))
}
