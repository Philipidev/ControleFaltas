import { describe, expect, it } from 'vitest'

import { resolverRegra } from './limites.ts'

describe('resolverRegra — a cascata', () => {
  it('sem nível nenhum, vale o padrão da spec', () => {
    const r = resolverRegra({})
    expect(r.limites).toEqual({ limiteReprovacao: 0.25, faixaVerde: 0.15, faixaAmarela: 0.2 })
    expect(r.origem.limiteReprovacao).toBe('padrao')
    expect(r.limiteTravado).toBe(false)
  })

  it('a disciplina ganha da turma, que ganha da pessoa', () => {
    const r = resolverRegra({
      disciplina: { limiteReprovacao: 0.1 },
      comunidade: { limiteReprovacao: 0.2 },
      usuario: { limiteReprovacao: 0.4 },
    })
    expect(r.limites.limiteReprovacao).toBe(0.1)
    expect(r.origem.limiteReprovacao).toBe('disciplina')
  })

  it('nível que não decide é pulado, não zera a cascata', () => {
    const r = resolverRegra({
      disciplina: { limiteReprovacao: null },
      comunidade: { limiteReprovacao: 0.2 },
      usuario: { limiteReprovacao: 0.4 },
    })
    expect(r.limites.limiteReprovacao).toBe(0.2)
    expect(r.origem.limiteReprovacao).toBe('comunidade')
  })

  it('sem turma, a configuração pessoal continua valendo', () => {
    const r = resolverRegra({ usuario: { limiteReprovacao: 0.3 } })
    expect(r.limites.limiteReprovacao).toBe(0.3)
    expect(r.origem.limiteReprovacao).toBe('usuario')
    expect(r.limiteTravado).toBe(false)
  })

  it('quando vem de cima, o limite fica travado para edição', () => {
    expect(resolverRegra({ comunidade: { limiteReprovacao: 0.2 } }).limiteTravado).toBe(true)
    expect(resolverRegra({ disciplina: { limiteReprovacao: 0.2 } }).limiteTravado).toBe(true)
  })

  it('atestado desconta: mesma cascata do limite', () => {
    expect(resolverRegra({}).regras.justificadaConta).toBe(false)
    const r = resolverRegra({
      comunidade: { justificadaConta: true },
      usuario: { justificadaConta: false },
    })
    expect(r.regras.justificadaConta).toBe(true)
    expect(r.origem.justificadaConta).toBe('comunidade')
  })

  it('false do nível de cima não é "não decidi" — é uma decisão', () => {
    const r = resolverRegra({
      comunidade: { justificadaConta: false },
      usuario: { justificadaConta: true },
    })
    expect(r.regras.justificadaConta).toBe(false)
    expect(r.origem.justificadaConta).toBe('comunidade')
  })

  it('o streak é sempre seu — nenhuma turma decide', () => {
    const r = resolverRegra({
      comunidade: { justificadaQuebraStreak: true },
      usuario: { justificadaQuebraStreak: false },
    })
    expect(r.regras.justificadaQuebraStreak).toBe(false)
  })
})

describe('resolverRegra — o alerta pessoal só aperta', () => {
  it('sem turma, a faixa é a que a pessoa escolheu', () => {
    const r = resolverRegra({ usuario: { faixaVerde: 0.18, faixaAmarela: 0.22 } })
    expect(r.limites.faixaVerde).toBe(0.18)
    expect(r.limites.faixaAmarela).toBe(0.22)
    expect(r.origem.faixaVerde).toBe('usuario')
  })

  it('com a turma definindo, quem quer ser avisado ANTES consegue', () => {
    const r = resolverRegra({
      comunidade: { faixaVerde: 0.15 },
      usuario: { faixaVerde: 0.1 },
    })
    expect(r.limites.faixaVerde).toBe(0.1)
    expect(r.origem.faixaVerde).toBe('usuario')
  })

  it('e quem quer ser avisado DEPOIS não afrouxa a régua da turma', () => {
    const r = resolverRegra({
      comunidade: { faixaVerde: 0.15 },
      usuario: { faixaVerde: 0.24 },
    })
    expect(r.limites.faixaVerde).toBe(0.15)
    expect(r.origem.faixaVerde).toBe('comunidade')
  })

  it('empate fica com a turma: o número é o mesmo, o dono não', () => {
    const r = resolverRegra({ comunidade: { faixaVerde: 0.15 }, usuario: { faixaVerde: 0.15 } })
    expect(r.origem.faixaVerde).toBe('comunidade')
  })

  it('a disciplina não mexe em alerta — isso é de quem olha', () => {
    const r = resolverRegra({
      disciplina: { faixaVerde: 0.01, limiteReprovacao: 0.25 },
      usuario: { faixaVerde: 0.15 },
    })
    expect(r.limites.faixaVerde).toBe(0.15)
  })

  it('o teto da turma vai junto, para a tela travar o controle', () => {
    const r = resolverRegra({ comunidade: { faixaVerde: 0.15, faixaAmarela: 0.2 } })
    expect(r.tetoDoAlerta).toEqual({ verde: 0.15, amarela: 0.2 })
    expect(resolverRegra({}).tetoDoAlerta).toEqual({ verde: null, amarela: null })
  })
})

describe('resolverRegra — coerência entre níveis', () => {
  it('as faixas nunca passam do limite herdado', () => {
    // Estágio com 10% de teto, herdando o alerta de 15/20 da configuração
    // pessoal: sem prender as faixas, o "atenção" apareceria DEPOIS da
    // reprovação e o medidor mentiria.
    const r = resolverRegra({
      disciplina: { limiteReprovacao: 0.1 },
      usuario: { faixaVerde: 0.15, faixaAmarela: 0.2 },
    })
    expect(r.limites.limiteReprovacao).toBe(0.1)
    expect(r.limites.faixaAmarela).toBe(0.1)
    expect(r.limites.faixaVerde).toBe(0.1)
  })

  it('verde nunca passa do amarelo', () => {
    const r = resolverRegra({ usuario: { faixaVerde: 0.22, faixaAmarela: 0.18 } })
    expect(r.limites.faixaVerde).toBe(0.18)
  })

  it('a ordem normal passa intacta', () => {
    const r = resolverRegra({
      comunidade: { limiteReprovacao: 0.25, faixaVerde: 0.15, faixaAmarela: 0.2 },
    })
    expect(r.limites).toEqual({ limiteReprovacao: 0.25, faixaVerde: 0.15, faixaAmarela: 0.2 })
  })
})
