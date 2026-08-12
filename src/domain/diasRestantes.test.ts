import { describe, expect, it } from 'vitest'

import { diaDaSemana } from './data.ts'
import {
  descreverPorTipoDeDia,
  descreverProjecao,
  porTipoDeDia,
  projetarAulas,
  proximasAulas,
} from './diasRestantes.ts'
import { calcularRisco } from './risco.ts'
import type { Falta, GradeSemanal } from './tipos.ts'

/** A grade literal da spec: Segunda = 4h, Quarta = 2h, carga total 70h. */
const GRADE_MFC: GradeSemanal = [
  { dia: 1, horas: 4 },
  { dia: 3, horas: 2 },
]
const CARGA_MFC = 70

// Agosto de 2026: dia 10 é segunda, 12 é quarta, 14 é sexta.
const SEGUNDA = '2026-08-10'
const QUARTA = '2026-08-12'
const SEXTA = '2026-08-14'

function falta(data: string, horas: number): Falta {
  return { id: data, disciplinaId: 'mfc', data, horasPerdidas: horas, justificada: false }
}

describe('sanidade do calendário usado nos testes', () => {
  it('as datas âncora caem nos dias da semana esperados', () => {
    expect(diaDaSemana(SEGUNDA)).toBe(1)
    expect(diaDaSemana(QUARTA)).toBe(3)
    expect(diaDaSemana(SEXTA)).toBe(5)
  })
})

describe('porTipoDeDia — o exemplo textual da §4', () => {
  // Com 8h já perdidas de 70h, sobram 9,5h até os 25%.
  // A spec sugere exatamente esta leitura: "ainda pode faltar 2 segundas ou 4 quartas".
  const risco = calcularRisco(CARGA_MFC, [falta(SEGUNDA, 4), falta('2026-08-17', 4)])

  it('sobram 9,5h', () => {
    expect(risco.horasRestantes).toBe(9.5)
  })

  it('cabem 2 segundas (4h) e 4 quartas (2h)', () => {
    const itens = porTipoDeDia(GRADE_MFC, risco.horasRestantes)
    expect(itens).toEqual([
      { dia: 1, horas: 4, quantas: 2 },
      { dia: 3, horas: 2, quantas: 4 },
    ])
  })

  it('descreve como a spec escreveu', () => {
    expect(descreverPorTipoDeDia(porTipoDeDia(GRADE_MFC, risco.horasRestantes))).toBe(
      '2 segundas ou 4 quartas',
    )
  })

  it('usa o singular quando cabe só uma', () => {
    expect(descreverPorTipoDeDia(porTipoDeDia(GRADE_MFC, 4))).toBe('1 segunda ou 2 quartas')
  })

  it('sem saldo, diz que não cabe mais nada', () => {
    expect(descreverPorTipoDeDia(porTipoDeDia(GRADE_MFC, 0))).toBe('nenhuma falta a mais')
  })

  it('some o dia cujo saldo não cobre nem uma aula', () => {
    // 3h cobrem uma quarta (2h), mas não uma segunda (4h)
    expect(descreverPorTipoDeDia(porTipoDeDia(GRADE_MFC, 3))).toBe('1 quarta')
  })
})

describe('proximasAulas — caminha a grade pelo calendário real', () => {
  it('alterna segunda e quarta a partir de uma segunda', () => {
    expect(proximasAulas(GRADE_MFC, SEGUNDA, 4).map((a) => a.data)).toEqual([
      '2026-08-10', // seg
      '2026-08-12', // qua
      '2026-08-17', // seg
      '2026-08-19', // qua
    ])
  })

  it('inclui o próprio dia quando ele tem aula', () => {
    expect(proximasAulas(GRADE_MFC, QUARTA, 1)[0]).toEqual({
      data: QUARTA,
      dia: 3,
      horas: 2,
    })
  })

  it('a partir de uma sexta, a próxima aula é a segunda seguinte', () => {
    expect(proximasAulas(GRADE_MFC, SEXTA, 1)[0]?.data).toBe('2026-08-17')
  })

  it('grade vazia não gera aula nenhuma (e não trava)', () => {
    expect(proximasAulas([], SEGUNDA, 5)).toEqual([])
  })
})

describe('projetarAulas — a leitura cronológica da §4', () => {
  it('com 9,5h de saldo, cabem uma segunda e uma quarta', () => {
    // seg 4h → sobra 5,5h · qua 2h → sobra 3,5h · seg 4h não cabe
    const p = projetarAulas(GRADE_MFC, 9.5, SEGUNDA)
    expect(p.aulasQueCabem).toBe(2)
    expect(p.ultimaDataSegura).toBe(QUARTA)
    expect(p.aulas.map((a) => a.data)).toEqual([SEGUNDA, QUARTA])
  })

  it('descreve para o card do dashboard', () => {
    expect(descreverProjecao(projetarAulas(GRADE_MFC, 9.5, SEGUNDA))).toBe(
      'Ainda pode faltar 2 aulas',
    )
    expect(descreverProjecao(projetarAulas(GRADE_MFC, 4, SEGUNDA))).toBe(
      'Ainda pode faltar 1 aula',
    )
    expect(descreverProjecao(projetarAulas(GRADE_MFC, 0, SEGUNDA))).toBe(
      'Não pode mais faltar',
    )
  })

  it('aponta a próxima aula prevista', () => {
    expect(projetarAulas(GRADE_MFC, 9.5, SEXTA).proximaAula).toEqual({
      data: '2026-08-17',
      dia: 1,
      horas: 4,
    })
  })
})

describe('projetarAulas — §6, o aviso preventivo', () => {
  it('avisa quando faltar na próxima aula já estoura o limite', () => {
    // saldo de 3h, mas a próxima aula (segunda) custa 4h
    const p = projetarAulas(GRADE_MFC, 3, SEGUNDA)
    expect(p.proximaAulaEstoura).toBe(true)
    expect(p.aulasQueCabem).toBe(0)
  })

  it('não avisa quando a próxima aula ainda cabe', () => {
    expect(projetarAulas(GRADE_MFC, 4, SEGUNDA).proximaAulaEstoura).toBe(false)
  })

  it('o saldo exato da próxima aula ainda cabe (fronteira)', () => {
    // 4h de saldo com aula de 4h: cabe, é o último dia seguro
    const p = projetarAulas(GRADE_MFC, 4, SEGUNDA)
    expect(p.aulasQueCabem).toBe(1)
    expect(p.ultimaDataSegura).toBe(SEGUNDA)
  })

  it('sem saldo nenhum, a próxima aula estoura', () => {
    expect(projetarAulas(GRADE_MFC, 0, SEGUNDA).proximaAulaEstoura).toBe(true)
  })

  it('grade vazia não inventa aviso', () => {
    const p = projetarAulas([], 0, SEGUNDA)
    expect(p.proximaAula).toBeNull()
    expect(p.proximaAulaEstoura).toBe(false)
  })
})
