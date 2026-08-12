import { describe, expect, it } from 'vitest'

import { ordenar, ordenarPorRisco, ordenarPorSaldo } from './ordenacao.ts'
import type { Status } from './tipos.ts'

/** §7.2 — "as mais vermelhas aparecem primeiro, pra chamar atenção". */

interface Card {
  readonly nome: string
  readonly status: Status
  readonly percentual: number
  readonly horasRestantes: number
  readonly cargaHorariaTotal: number
}

const card = (
  nome: string,
  status: Status,
  percentual: number,
  horasRestantes = 0,
  cargaHorariaTotal = 70,
): Card => ({ nome, status, percentual, horasRestantes, cargaHorariaTotal })

describe('ordenarPorRisco', () => {
  it('coloca o mais grave primeiro', () => {
    const cards = [
      card('Verde', 'verde', 0.1),
      card('Reprovado', 'reprovado', 0.3),
      card('Amarelo', 'amarelo', 0.18),
      card('Vermelho', 'vermelho', 0.22),
    ]
    expect(ordenarPorRisco(cards).map((c) => c.nome)).toEqual([
      'Reprovado',
      'Vermelho',
      'Amarelo',
      'Verde',
    ])
  })

  it('dentro da mesma faixa, o pior percentual sobe', () => {
    const cards = [
      card('Vermelho leve', 'vermelho', 0.21),
      card('Vermelho grave', 'vermelho', 0.245),
    ]
    expect(ordenarPorRisco(cards).map((c) => c.nome)).toEqual([
      'Vermelho grave',
      'Vermelho leve',
    ])
  })

  it('status manda mais que percentual', () => {
    // uma vermelha de 20,1% vem antes de uma amarela de 20,0%, mesmo com
    // percentuais quase idênticos — as urgências são diferentes
    const cards = [card('Amarela', 'amarelo', 0.2), card('Vermelha', 'vermelho', 0.201)]
    expect(ordenarPorRisco(cards)[0]?.nome).toBe('Vermelha')
  })

  it('não muta o array original', () => {
    const cards = [card('A', 'verde', 0.1), card('B', 'vermelho', 0.22)]
    const copia = [...cards]
    ordenarPorRisco(cards)
    expect(cards).toEqual(copia)
  })

  it('lida com lista vazia', () => {
    expect(ordenarPorRisco([])).toEqual([])
  })
})

describe('ordenarPorSaldo', () => {
  it('menor saldo primeiro — "de qual eu preciso cuidar agora"', () => {
    const cards = [
      card('Folgada', 'verde', 0.05, 15),
      card('Apertada', 'vermelho', 0.22, 1.5),
      card('Média', 'amarelo', 0.18, 5),
    ]
    expect(ordenarPorSaldo(cards).map((c) => c.nome)).toEqual([
      'Apertada',
      'Média',
      'Folgada',
    ])
  })
})

describe('ordenar — despacho por critério', () => {
  const cards = [
    card('Zoologia', 'verde', 0.05, 15, 40),
    card('Anatomia', 'vermelho', 0.22, 1.5, 120),
    card('Bioquímica', 'amarelo', 0.18, 5, 80),
  ]

  it('por risco', () => {
    expect(ordenar(cards, 'risco')[0]?.nome).toBe('Anatomia')
  })

  it('por nome, com collation pt-BR', () => {
    expect(ordenar(cards, 'nome').map((c) => c.nome)).toEqual([
      'Anatomia',
      'Bioquímica',
      'Zoologia',
    ])
  })

  it('por saldo', () => {
    expect(ordenar(cards, 'saldo')[0]?.nome).toBe('Anatomia')
  })

  it('por carga horária, da maior para a menor', () => {
    expect(ordenar(cards, 'carga').map((c) => c.nome)).toEqual([
      'Anatomia',
      'Bioquímica',
      'Zoologia',
    ])
  })
})
