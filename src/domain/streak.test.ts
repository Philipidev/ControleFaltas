import { describe, expect, it } from 'vitest'

import { calcularStreak, descreverStreak, marcoAlcancado, quebraStreak } from './streak.ts'
import { REGRAS_PADRAO, type Falta } from './tipos.ts'

/** §7.5 — streak de presença. */

const REGRA_ATESTADO_QUEBRA = { justificadaQuebraStreak: true }

function falta(data: string, justificada = false): Falta {
  return { id: data, disciplinaId: 'mfc', data, horasPerdidas: 4, justificada }
}

describe('quebraStreak — §7.5, a regra configurável', () => {
  it('falta comum sempre quebra', () => {
    expect(quebraStreak(falta('2026-08-03'), REGRAS_PADRAO)).toBe(true)
  })

  it('por padrão, atestado não quebra', () => {
    expect(quebraStreak(falta('2026-08-03', true), REGRAS_PADRAO)).toBe(false)
  })

  it('mas o curso pode decidir que quebra', () => {
    expect(quebraStreak(falta('2026-08-03', true), REGRA_ATESTADO_QUEBRA)).toBe(true)
  })
})

describe('calcularStreak', () => {
  it('conta desde o dia seguinte à última falta', () => {
    const s = calcularStreak([falta('2026-08-03')], '2026-08-12')
    expect(s.ultimaFalta).toBe('2026-08-03')
    expect(s.desde).toBe('2026-08-04')
    expect(s.diasSemFaltar).toBe(9) // 04 a 12, inclusive
  })

  it('considera só a falta mais recente', () => {
    const s = calcularStreak(
      [falta('2026-07-10'), falta('2026-08-03'), falta('2026-07-25')],
      '2026-08-12',
    )
    expect(s.ultimaFalta).toBe('2026-08-03')
  })

  it('zera no dia em que a falta acontece', () => {
    expect(calcularStreak([falta('2026-08-12')], '2026-08-12').diasSemFaltar).toBe(0)
  })

  it('converte para semanas', () => {
    expect(calcularStreak([falta('2026-07-21')], '2026-08-12').semanasSemFaltar).toBe(3)
  })

  it('atestado não interrompe a contagem por padrão', () => {
    const s = calcularStreak([falta('2026-08-03'), falta('2026-08-10', true)], '2026-08-12')
    expect(s.ultimaFalta).toBe('2026-08-03')
    expect(s.diasSemFaltar).toBe(9)
  })

  it('com a regra ligada, o atestado interrompe', () => {
    const s = calcularStreak(
      [falta('2026-08-03'), falta('2026-08-10', true)],
      '2026-08-12',
      REGRA_ATESTADO_QUEBRA,
    )
    expect(s.ultimaFalta).toBe('2026-08-10')
    expect(s.diasSemFaltar).toBe(2)
  })

  it('falta lançada com data futura ainda não quebra nada', () => {
    const s = calcularStreak([falta('2026-08-03'), falta('2026-08-20')], '2026-08-12')
    expect(s.ultimaFalta).toBe('2026-08-03')
  })

  it('sem faltas e sem início de contagem, não há o que contar', () => {
    const s = calcularStreak([], '2026-08-12')
    expect(s.diasSemFaltar).toBe(0)
    expect(s.ultimaFalta).toBeNull()
  })

  it('sem faltas, conta desde o início do semestre', () => {
    const s = calcularStreak([], '2026-08-12', REGRAS_PADRAO, '2026-08-01')
    expect(s.diasSemFaltar).toBe(12)
    expect(s.desde).toBe('2026-08-01')
  })
})

describe('calcularStreak — recorde', () => {
  it('guarda o maior intervalo já alcançado', () => {
    // 01/07 → 20/07 são 18 dias limpos; depois de 22/07 até 12/08 são 21
    const s = calcularStreak(
      [falta('2026-07-01'), falta('2026-07-20'), falta('2026-07-22')],
      '2026-08-12',
    )
    expect(s.diasSemFaltar).toBe(21)
    expect(s.recorde).toBe(21)
    expect(s.noRecorde).toBe(true)
  })

  it('reconhece quando a sequência atual não é a melhor', () => {
    const s = calcularStreak([falta('2026-06-01'), falta('2026-08-10')], '2026-08-12')
    expect(s.diasSemFaltar).toBe(2)
    expect(s.recorde).toBe(69) // 02/06 a 09/08
    expect(s.noRecorde).toBe(false)
  })
})

describe('descreverStreak — o reforço visual, sem exagero', () => {
  it.each([
    [[falta('2026-08-12')], '2026-08-12', 'Comece hoje sua sequência'],
    [[falta('2026-08-11')], '2026-08-12', '1 dia sem faltar'],
    [[falta('2026-08-09')], '2026-08-12', '3 dias sem faltar'],
    [[falta('2026-08-05')], '2026-08-12', '1 semana sem faltar'],
    [[falta('2026-07-21')], '2026-08-12', '3 semanas sem faltar'],
  ])('descreve corretamente', (faltas, hoje, esperado) => {
    expect(descreverStreak(calcularStreak(faltas, hoje))).toBe(esperado)
  })
})

describe('marcoAlcancado', () => {
  it('reconhece a primeira semana cheia', () => {
    expect(marcoAlcancado(calcularStreak([falta('2026-08-05')], '2026-08-12'))).toBe(7)
  })

  it('não comemora dias comuns', () => {
    expect(marcoAlcancado(calcularStreak([falta('2026-08-06')], '2026-08-12'))).toBeNull()
  })
})
