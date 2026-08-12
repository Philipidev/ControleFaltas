import { describe, expect, it } from 'vitest'

import {
  calcularPrazo,
  faltasComPrazoCorrendo,
  PRAZO_ATESTADO_DIAS,
  situacaoAtestado,
} from './justificativa.ts'

/**
 * §7.1 — "A faculdade só aceita atestado dentro de 7 dias a partir da data da
 * falta." O teste que importa é o do 7º contra o 8º dia.
 */

const FALTA = '2026-08-03'
const PRAZO = '2026-08-10' // 03 + 7

describe('calcularPrazo', () => {
  it('é a data da falta mais 7 dias', () => {
    expect(PRAZO_ATESTADO_DIAS).toBe(7)
    expect(calcularPrazo(FALTA)).toBe(PRAZO)
  })

  it('atravessa a virada de mês', () => {
    expect(calcularPrazo('2026-08-28')).toBe('2026-09-04')
  })

  it('atravessa a virada de ano', () => {
    expect(calcularPrazo('2026-12-30')).toBe('2027-01-06')
  })
})

describe('situacaoAtestado — a fronteira dos 7 dias', () => {
  it('no mesmo dia da falta, pode justificar', () => {
    const s = situacaoAtestado(FALTA, FALTA)
    expect(s.podeJustificar).toBe(true)
    expect(s.diasRestantes).toBe(7)
  })

  it('no 7º dia (último do prazo) ainda pode', () => {
    const s = situacaoAtestado(FALTA, PRAZO)
    expect(s.podeJustificar).toBe(true)
    expect(s.expirado).toBe(false)
    expect(s.diasRestantes).toBe(0)
    expect(s.mensagem).toBe('Hoje é o último dia para justificar esta falta.')
  })

  it('no 8º dia o prazo já era', () => {
    const s = situacaoAtestado(FALTA, '2026-08-11')
    expect(s.podeJustificar).toBe(false)
    expect(s.expirado).toBe(true)
    expect(s.diasRestantes).toBe(-1)
    expect(s.mensagem).toContain('Prazo do atestado expirado')
  })

  it('bem depois do prazo, continua bloqueado', () => {
    expect(situacaoAtestado(FALTA, '2026-09-30').podeJustificar).toBe(false)
  })
})

describe('situacaoAtestado — o "prazo restante visível" da §7.1', () => {
  it('mostra a data limite quando ainda há folga', () => {
    const s = situacaoAtestado(FALTA, '2026-08-05')
    expect(s.diasRestantes).toBe(5)
    expect(s.mensagem).toBe('Você tem até 10/08/2026 para justificar esta falta (5 dias).')
    expect(s.urgente).toBe(false)
  })

  it('marca como urgente na véspera', () => {
    const s = situacaoAtestado(FALTA, '2026-08-09')
    expect(s.diasRestantes).toBe(1)
    expect(s.urgente).toBe(true)
    expect(s.mensagem).toBe('Você tem até amanhã, 10/08/2026, para justificar esta falta.')
  })

  it('marca como urgente no último dia', () => {
    expect(situacaoAtestado(FALTA, PRAZO).urgente).toBe(true)
  })

  it('diz há quanto tempo venceu', () => {
    expect(situacaoAtestado(FALTA, '2026-08-11').mensagem).toContain('ontem')
    expect(situacaoAtestado(FALTA, '2026-08-14').mensagem).toContain('há 4 dias')
  })
})

describe('faltasComPrazoCorrendo — para o alerta de prazo (§6)', () => {
  const faltas = [
    { data: '2026-08-03', justificada: false }, // vence em 10/08
    { data: '2026-08-08', justificada: false }, // vence em 15/08
    { data: '2026-08-01', justificada: false }, // venceu em 08/08
    { data: '2026-08-04', justificada: true }, // já justificada
  ]

  it('lista só as que ainda dá para justificar e estão perto do fim', () => {
    const urgentes = faltasComPrazoCorrendo(faltas, '2026-08-09', 2)
    expect(urgentes).toHaveLength(1)
    expect(urgentes[0]?.falta.data).toBe('2026-08-03')
  })

  it('ignora as já justificadas', () => {
    const todas = faltasComPrazoCorrendo(faltas, '2026-08-09', 30)
    expect(todas.every((u) => !u.falta.justificada)).toBe(true)
  })

  it('ignora as que já venceram', () => {
    const todas = faltasComPrazoCorrendo(faltas, '2026-08-09', 30)
    expect(todas.map((u) => u.falta.data)).not.toContain('2026-08-01')
  })

  it('ordena da mais urgente para a menos', () => {
    const todas = faltasComPrazoCorrendo(faltas, '2026-08-09', 30)
    expect(todas.map((u) => u.falta.data)).toEqual(['2026-08-03', '2026-08-08'])
  })
})
