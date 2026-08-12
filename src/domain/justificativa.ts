import { diferencaEmDias, formatarBR, somarDias } from './data.ts'

/**
 * §7.1 — Faltas justificadas (atestado).
 *
 * "A faculdade só aceita atestado dentro de 7 dias a partir da data da falta."
 *
 * Este módulo é o espelho do trigger trg_prazo_atestado (migration 0002): a
 * UI usa daqui para desabilitar o botão e mostrar o prazo restante, e o banco
 * recusa de verdade. Os dois precisam concordar — se um dia o prazo mudar,
 * mude nos dois lugares.
 */

export const PRAZO_ATESTADO_DIAS = 7

export interface SituacaoAtestado {
  readonly dataFalta: string
  /** data da falta + 7 dias — o mesmo valor da coluna prazo_justificativa. */
  readonly prazo: string
  /** Dias inteiros até o fim do prazo. Negativo quando já venceu. */
  readonly diasRestantes: number
  readonly podeJustificar: boolean
  readonly expirado: boolean
  /** Texto pronto para a UI: "você tem até dia X para justificar". */
  readonly mensagem: string
  /** Prazo apertado (hoje ou amanhã) — merece destaque visual. */
  readonly urgente: boolean
}

export function calcularPrazo(dataFalta: string): string {
  return somarDias(dataFalta, PRAZO_ATESTADO_DIAS)
}

export function situacaoAtestado(dataFalta: string, hoje: string): SituacaoAtestado {
  const prazo = calcularPrazo(dataFalta)
  const diasRestantes = diferencaEmDias(hoje, prazo)
  const expirado = diasRestantes < 0

  return {
    dataFalta,
    prazo,
    diasRestantes,
    podeJustificar: !expirado,
    expirado,
    mensagem: montarMensagem(prazo, diasRestantes),
    urgente: !expirado && diasRestantes <= 1,
  }
}

function montarMensagem(prazo: string, diasRestantes: number): string {
  if (diasRestantes < 0) {
    const vencidoHa = -diasRestantes
    return `Prazo do atestado expirado — venceu em ${formatarBR(prazo)} (${
      vencidoHa === 1 ? 'ontem' : `há ${String(vencidoHa)} dias`
    }). Essa falta não pode mais ser justificada.`
  }
  if (diasRestantes === 0) {
    return `Hoje é o último dia para justificar esta falta.`
  }
  if (diasRestantes === 1) {
    return `Você tem até amanhã, ${formatarBR(prazo)}, para justificar esta falta.`
  }
  return `Você tem até ${formatarBR(prazo)} para justificar esta falta (${String(
    diasRestantes,
  )} dias).`
}

/**
 * Faltas ainda justificáveis, para o app poder cutucar o usuário antes de o
 * prazo vencer (§6, tipo de notificação 'prazo_atestado').
 */
export function faltasComPrazoCorrendo<T extends { data: string; justificada: boolean }>(
  faltas: readonly T[],
  hoje: string,
  avisarComDiasOuMenos = 2,
): { falta: T; situacao: SituacaoAtestado }[] {
  return faltas
    .filter((f) => !f.justificada)
    .map((falta) => ({ falta, situacao: situacaoAtestado(falta.data, hoje) }))
    .filter(({ situacao }) => situacao.podeJustificar && situacao.diasRestantes <= avisarComDiasOuMenos)
    .sort((a, b) => a.situacao.diasRestantes - b.situacao.diasRestantes)
}
