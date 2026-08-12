import { describe, expect, it } from 'vitest'

import { medirFaixaFantasma, type MedidasDaTela } from './faixaFantasma.ts'

function tela(parcial: Partial<MedidasDaTela>): MedidasDaTela {
  return { alturaDaTela: 956, alturaDoViewport: 956, ehAppDoIos: true, ...parcial }
}

describe('medirFaixaFantasma', () => {
  /**
   * Os números vêm do Diagnóstico do aparelho num iPhone 17 Pro Max com o app
   * na tela de início: tela de 956, viewport de 912. É o caso que motivou o
   * módulo inteiro.
   */
  it('mede a faixa do iPhone 17 Pro Max em modo aplicativo', () => {
    expect(medirFaixaFantasma(tela({ alturaDoViewport: 912 }))).toBe(44)
  })

  it('devolve 0 quando o viewport ocupa a tela toda — que é o esperado', () => {
    expect(medirFaixaFantasma(tela({ alturaDoViewport: 956 }))).toBe(0)
  })

  it('ignora aparelho que não é iPhone em modo aplicativo', () => {
    // No Android o `innerHeight` já vem descontado das barras do sistema, e
    // descontar isso de novo do recuo colaria os rótulos na navegação por
    // gestos. `navigator.standalone` não existe lá — é o que separa os dois.
    expect(medirFaixaFantasma(tela({ alturaDoViewport: 812, ehAppDoIos: false }))).toBe(0)
  })

  it('ignora a diferença gigante da paisagem', () => {
    // Deitado, o iOS mantém `screen.height` em retrato: a subtração passa de
    // 500px e não tem nada a ver com a faixa.
    expect(medirFaixaFantasma(tela({ alturaDoViewport: 430 }))).toBe(0)
  })

  it('ignora viewport maior que a tela', () => {
    expect(medirFaixaFantasma(tela({ alturaDaTela: 900, alturaDoViewport: 956 }))).toBe(0)
  })

  it('arredonda a fração que o zoom de acessibilidade produz', () => {
    expect(medirFaixaFantasma(tela({ alturaDoViewport: 911.6 }))).toBe(44)
  })

  it('devolve 0 se o aparelho não souber informar a altura', () => {
    expect(medirFaixaFantasma(tela({ alturaDaTela: Number.NaN }))).toBe(0)
  })
})
