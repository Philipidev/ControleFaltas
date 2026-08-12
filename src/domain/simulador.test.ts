import { describe, expect, it } from 'vitest'

import { calcularRisco } from './risco.ts'
import { descreverHipoteses, horasDasHipoteses, simular } from './simulador.ts'
import type { Falta, GradeSemanal } from './tipos.ts'

/** §7.3 — "e se eu faltar mais [N] vezes?" sobre a disciplina da spec. */
const GRADE_MFC: GradeSemanal = [
  { dia: 1, horas: 4 },
  { dia: 3, horas: 2 },
]
const CARGA_MFC = 70

function falta(data: string, horas: number): Falta {
  return { id: data, disciplinaId: 'mfc', data, horasPerdidas: horas, justificada: false }
}

/** Ponto de partida: 8h perdidas de 70h → 11,4%, verde, 9,5h de saldo. */
const BASE = calcularRisco(CARGA_MFC, [falta('2026-08-10', 4), falta('2026-08-17', 4)])

describe('horasDasHipoteses', () => {
  it('pesa cada dia pela sua carga na grade', () => {
    expect(horasDasHipoteses([{ dia: 1, quantidade: 2 }], GRADE_MFC)).toBe(8)
    expect(horasDasHipoteses([{ dia: 3, quantidade: 2 }], GRADE_MFC)).toBe(4)
    expect(
      horasDasHipoteses(
        [
          { dia: 1, quantidade: 1 },
          { dia: 3, quantidade: 3 },
        ],
        GRADE_MFC,
      ),
    ).toBe(10)
  })

  it('dia fora da grade não custa nada', () => {
    expect(horasDasHipoteses([{ dia: 5, quantidade: 3 }], GRADE_MFC)).toBe(0)
  })

  it('quantidade negativa não vira crédito', () => {
    expect(horasDasHipoteses([{ dia: 1, quantidade: -5 }], GRADE_MFC)).toBe(0)
  })
})

describe('simular — "posso faltar e continuar no verde?"', () => {
  it('sem hipótese nenhuma, nada muda', () => {
    const s = simular(BASE, [], GRADE_MFC)
    expect(s.horasHipoteticas).toBe(0)
    expect(s.statusProjetado).toBe(BASE.status)
    expect(s.piorouDeFaixa).toBe(false)
  })

  it('faltar 1 quarta (2h) mantém o verde', () => {
    const s = simular(BASE, [{ dia: 3, quantidade: 1 }], GRADE_MFC)
    expect(s.totalProjetado).toBe(10)
    expect(s.percentualProjetado).toBeCloseTo(10 / 70, 10) // 14,3%
    expect(s.statusProjetado).toBe('verde')
    expect(s.piorouDeFaixa).toBe(false)
  })

  it('faltar 1 segunda (4h) empurra para o amarelo', () => {
    const s = simular(BASE, [{ dia: 1, quantidade: 1 }], GRADE_MFC)
    expect(s.totalProjetado).toBe(12)
    expect(s.percentualProjetado).toBeCloseTo(12 / 70, 10) // 17,1%
    expect(s.statusProjetado).toBe('amarelo')
    expect(s.piorouDeFaixa).toBe(true)
    expect(s.ultrapassaLimite).toBe(false)
  })

  it('faltar 2 segundas leva ao vermelho, mas ainda não reprova', () => {
    const s = simular(BASE, [{ dia: 1, quantidade: 2 }], GRADE_MFC)
    expect(s.totalProjetado).toBe(16)
    expect(s.percentualProjetado).toBeCloseTo(16 / 70, 10) // 22,9%
    expect(s.statusProjetado).toBe('vermelho')
    expect(s.ultrapassaLimite).toBe(false)
    expect(s.horasRestantesDepois).toBe(1.5)
  })

  it('faltar 3 segundas estoura os 25%', () => {
    const s = simular(BASE, [{ dia: 1, quantidade: 3 }], GRADE_MFC)
    expect(s.totalProjetado).toBe(20)
    expect(s.percentualProjetado).toBeCloseTo(20 / 70, 10) // 28,6%
    expect(s.statusProjetado).toBe('reprovado')
    expect(s.ultrapassaLimite).toBe(true)
    expect(s.horasRestantesDepois).toBe(0)
  })
})

describe('simular — quantas das faltas simuladas realmente cabem', () => {
  it('com 9,5h de saldo cabem 2 segundas das 3 pedidas', () => {
    const s = simular(BASE, [{ dia: 1, quantidade: 3 }], GRADE_MFC)
    expect(s.quantasCabem).toBe(2)
  })

  it('cabem 4 quartas das 6 pedidas', () => {
    const s = simular(BASE, [{ dia: 3, quantidade: 6 }], GRADE_MFC)
    expect(s.quantasCabem).toBe(4)
  })

  it('respeita a ordem informada ao consumir o saldo', () => {
    // 1 segunda (4h) consome até 5,5h; sobram 2 quartas (2h cada) → 1+2 = 3
    const s = simular(
      BASE,
      [
        { dia: 1, quantidade: 1 },
        { dia: 3, quantidade: 5 },
      ],
      GRADE_MFC,
    )
    expect(s.quantasCabem).toBe(3)
  })
})

describe('descreverHipoteses', () => {
  it('descreve uma única', () => {
    expect(descreverHipoteses([{ dia: 1, quantidade: 2 }])).toBe('2 segundas')
  })

  it('usa singular quando é uma só', () => {
    expect(descreverHipoteses([{ dia: 3, quantidade: 1 }])).toBe('1 quarta')
  })

  it('junta duas com "e"', () => {
    expect(
      descreverHipoteses([
        { dia: 1, quantidade: 2 },
        { dia: 3, quantidade: 1 },
      ]),
    ).toBe('2 segundas e 1 quarta')
  })

  it('ignora as zeradas', () => {
    expect(
      descreverHipoteses([
        { dia: 1, quantidade: 0 },
        { dia: 3, quantidade: 2 },
      ]),
    ).toBe('2 quartas')
  })

  it('sem nada selecionado', () => {
    expect(descreverHipoteses([])).toBe('nenhuma falta')
  })
})
