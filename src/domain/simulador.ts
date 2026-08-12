import { PESO_STATUS, statusPara, type ResumoRisco } from './risco.ts'
import {
  LIMITES_PADRAO,
  NOME_DIA,
  NOME_DIA_PLURAL,
  ultrapassa,
  type DiaSemana,
  type GradeSemanal,
  type Limites,
  type Status,
} from './tipos.ts'

/**
 * §7.3 — Simulador de faltas.
 *
 * "E se eu faltar mais [N] vezes?" — o usuário escolhe quantas faltas
 * hipotéticas e em quais dias da semana (porque cada dia pesa horas
 * diferentes), e o app recalcula o percentual projetado e o novo status.
 *
 * Serve para decidir ANTES de faltar: "posso faltar amanhã e ainda ficar no
 * verde?". Por isso nada aqui toca o banco — é conta pura sobre o resumo
 * atual.
 */

export interface FaltaHipotetica {
  readonly dia: DiaSemana
  readonly quantidade: number
}

export interface Simulacao {
  readonly faltasHipoteticas: number
  readonly horasHipoteticas: number
  readonly percentualAtual: number
  readonly statusAtual: Status
  readonly totalProjetado: number
  readonly percentualProjetado: number
  readonly statusProjetado: Status
  readonly horasRestantesDepois: number
  /** O status piorou de faixa por causa da simulação? */
  readonly piorouDeFaixa: boolean
  /** A simulação estoura o limite de 25%? */
  readonly ultrapassaLimite: boolean
  /** Quantas dessas faltas hipotéticas ainda cabem antes de estourar. */
  readonly quantasCabem: number
}

/** Soma as horas de um conjunto de faltas hipotéticas, segundo a grade. */
export function horasDasHipoteses(
  hipoteses: readonly FaltaHipotetica[],
  grade: GradeSemanal,
): number {
  const horasPorDia = new Map<DiaSemana, number>(grade.map((a) => [a.dia, a.horas]))
  return hipoteses.reduce((soma, h) => {
    const horas = horasPorDia.get(h.dia) ?? 0
    return soma + horas * Math.max(h.quantidade, 0)
  }, 0)
}

export function simular(
  base: ResumoRisco,
  hipoteses: readonly FaltaHipotetica[],
  grade: GradeSemanal,
  limites: Limites = LIMITES_PADRAO,
): Simulacao {
  const horasHipoteticas = horasDasHipoteses(hipoteses, grade)
  const faltasHipoteticas = hipoteses.reduce((s, h) => s + Math.max(h.quantidade, 0), 0)

  const totalProjetado = base.totalFaltado + horasHipoteticas
  const percentualProjetado =
    base.cargaHorariaTotal > 0 ? totalProjetado / base.cargaHorariaTotal : 0
  const statusProjetado = statusPara(percentualProjetado, limites)

  // Quantas das faltas simuladas cabem antes de estourar, na ordem informada.
  const horasPorDia = new Map<DiaSemana, number>(grade.map((a) => [a.dia, a.horas]))
  let saldo = base.horasRestantes
  let quantasCabem = 0
  for (const h of hipoteses) {
    const horas = horasPorDia.get(h.dia) ?? 0
    for (let i = 0; i < Math.max(h.quantidade, 0); i += 1) {
      if (horas <= 0 || ultrapassa(horas, saldo)) break
      saldo -= horas
      quantasCabem += 1
    }
  }

  return {
    faltasHipoteticas,
    horasHipoteticas,
    percentualAtual: base.percentual,
    statusAtual: base.status,
    totalProjetado,
    percentualProjetado,
    statusProjetado,
    horasRestantesDepois: Math.max(base.horasLimite - totalProjetado, 0),
    piorouDeFaixa: PESO_STATUS[statusProjetado] > PESO_STATUS[base.status],
    ultrapassaLimite: ultrapassa(percentualProjetado, limites.limiteReprovacao),
    quantasCabem,
  }
}

/** "2 segundas e 1 quarta" — resumo textual do que foi simulado. */
export function descreverHipoteses(hipoteses: readonly FaltaHipotetica[]): string {
  const ativas = hipoteses.filter((h) => h.quantidade > 0)
  if (ativas.length === 0) return 'nenhuma falta'

  const partes = ativas.map((h) => {
    const nome = h.quantidade === 1 ? NOME_DIA[h.dia] : NOME_DIA_PLURAL[h.dia]
    return `${String(h.quantidade)} ${nome}`
  })

  if (partes.length === 1) return partes[0] ?? ''
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1) ?? ''}`
}
