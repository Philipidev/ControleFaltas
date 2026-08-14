import { describe, expect, it } from 'vitest'

import { faltasCobertasPorAtestado } from './justificativa.ts'

/** §7.1 — um atestado cobre um período; uma falta é de um dia. */

interface FaltaFalsa {
  readonly id: string
  readonly data: string
  readonly justificada: boolean
}

function f(id: string, data: string, justificada = false): FaltaFalsa {
  return { id, data, justificada }
}

// Uma semana doente: segunda a sexta, em duas disciplinas.
const SEMANA = [
  f('seg-mfc', '2026-08-10'),
  f('seg-bio', '2026-08-10'),
  f('qua-mfc', '2026-08-12'),
  f('sex-bio', '2026-08-14'),
]

describe('faltasCobertasPorAtestado', () => {
  it('alcança todo o intervalo, em todas as disciplinas', () => {
    const cobertas = faltasCobertasPorAtestado(SEMANA, '2026-08-10', '2026-08-14')
    expect(cobertas.map((x) => x.id)).toEqual(['seg-mfc', 'seg-bio', 'qua-mfc', 'sex-bio'])
  })

  it('inclui as duas pontas', () => {
    const cobertas = faltasCobertasPorAtestado(SEMANA, '2026-08-10', '2026-08-12')
    expect(cobertas.map((x) => x.id)).toEqual(['seg-mfc', 'seg-bio', 'qua-mfc'])
  })

  it('não alcança nada fora do período', () => {
    const fora = [...SEMANA, f('seg-seguinte', '2026-08-17')]
    const cobertas = faltasCobertasPorAtestado(fora, '2026-08-10', '2026-08-14')
    expect(cobertas.some((x) => x.id === 'seg-seguinte')).toBe(false)
  })

  it('ignora as que já têm atestado — a contagem promete quantas vão mudar', () => {
    const parcial = [f('a', '2026-08-10', true), f('b', '2026-08-11')]
    expect(faltasCobertasPorAtestado(parcial, '2026-08-10', '2026-08-14').map((x) => x.id)).toEqual(
      ['b'],
    )
  })

  it('intervalo que não passa do próprio dia não alcança ninguém', () => {
    // A falta sendo criada já leva a marcação pelo insert; um "cobre até" igual
    // à data não é intervalo.
    expect(faltasCobertasPorAtestado(SEMANA, '2026-08-10', '2026-08-10')).toEqual([])
    expect(faltasCobertasPorAtestado(SEMANA, '2026-08-12', '2026-08-10')).toEqual([])
  })

  it('o que ainda não foi registrado não entra — o app não guarda o período', () => {
    // A limitação que o texto da tela precisa dizer: marcar na segunda um
    // atestado "até sexta" alcança o que já está lançado e mais nada. As faltas
    // de terça a sexta, que só serão registradas na volta, ficam de fora — e
    // vão precisar da própria marcação.
    const soSegunda = [f('seg-mfc', '2026-08-10')]
    const cobertas = faltasCobertasPorAtestado(soSegunda, '2026-08-10', '2026-08-14')
    expect(cobertas).toHaveLength(1)
    expect(cobertas[0]?.id).toBe('seg-mfc')

    // Com a semana inteira já lançada, a mesma chamada alcança as quatro.
    expect(faltasCobertasPorAtestado(SEMANA, '2026-08-10', '2026-08-14')).toHaveLength(4)
  })
})
