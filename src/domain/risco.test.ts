import { describe, expect, it } from 'vitest'

import {
  calcularRisco,
  deHoraMinuto,
  emHoraMinuto,
  formatarHoraMinuto,
  formatarPercentual,
  formatarProgressoHoras,
  horasQueContam,
  statusPara,
} from './risco.ts'
import { LIMITES_PADRAO, type Falta } from './tipos.ts'

/**
 * Os números aqui saem da própria especificação:
 * "Medicina, Família e Comunidade" — 70h, Segunda = 4h, Quarta = 2h,
 * exemplo de dashboard "8h / 70h", limite de reprovação em 25%.
 */
const CARGA_MFC = 70

function falta(data: string, horas: number, justificada = false): Falta {
  return { id: data, disciplinaId: 'mfc', data, horasPerdidas: horas, justificada }
}

describe('statusPara — as faixas exatas da tabela da §4', () => {
  // "Verde: até 15%" — 15% cravado ainda é verde
  it('15,0% é verde (o limite é inclusivo)', () => {
    expect(statusPara(0.15)).toBe('verde')
  })

  it('logo acima de 15% vira amarelo', () => {
    expect(statusPara(0.1501)).toBe('amarelo')
  })

  // "Amarelo: 15% a 20%" — 20% cravado ainda é amarelo
  it('20,0% ainda é amarelo', () => {
    expect(statusPara(0.2)).toBe('amarelo')
  })

  // "Vermelho: acima de 20%"
  it('logo acima de 20% vira vermelho', () => {
    expect(statusPara(0.2001)).toBe('vermelho')
  })

  // "reprovado por falta se ultrapassar 25%" — 25% cravado ainda não reprovou
  it('25,0% cravado ainda é vermelho, não reprovado', () => {
    expect(statusPara(0.25)).toBe('vermelho')
  })

  it('acima de 25% é reprovado', () => {
    expect(statusPara(0.2501)).toBe('reprovado')
  })

  it('zero falta é verde', () => {
    expect(statusPara(0)).toBe('verde')
  })

  it('respeita faixas customizadas', () => {
    const rigido = { limiteReprovacao: 0.2, faixaVerde: 0.05, faixaAmarela: 0.1 }
    expect(statusPara(0.05, rigido)).toBe('verde')
    expect(statusPara(0.08, rigido)).toBe('amarelo')
    expect(statusPara(0.15, rigido)).toBe('vermelho')
    expect(statusPara(0.21, rigido)).toBe('reprovado')
  })
})

describe('statusPara — fronteiras que o ponto flutuante poderia estragar', () => {
  // 12/80 e 10.5/70 dão exatamente 0.15. Sem a tolerância do EPSILON, um erro
  // na última casa jogaria uma disciplina tranquila para o amarelo.
  it.each([
    [12, 80],
    [10.5, 70],
    [15, 100],
    [18, 120],
    [6, 40],
  ])('%dh de %dh é exatamente 15%% e continua verde', (faltado, carga) => {
    expect(statusPara(faltado / carga)).toBe('verde')
  })

  it.each([
    [16, 80],
    [14, 70],
    [20, 100],
    [24, 120],
  ])('%dh de %dh é exatamente 20%% e continua amarelo', (faltado, carga) => {
    expect(statusPara(faltado / carga)).toBe('amarelo')
  })
})

describe('calcularRisco — o exemplo "8h / 70h" da §7.2', () => {
  const risco = calcularRisco(CARGA_MFC, [falta('2026-08-10', 4), falta('2026-08-17', 4)])

  it('soma as horas perdidas', () => {
    expect(risco.totalFaltado).toBe(8)
  })

  it('calcula o percentual sobre a carga total', () => {
    expect(risco.percentual).toBeCloseTo(8 / 70, 10)
    expect(formatarPercentual(risco.percentual)).toBe('11,4%')
  })

  it('fica no verde', () => {
    expect(risco.status).toBe('verde')
  })

  it('sabe que o teto de 25% de 70h é 17,5h', () => {
    expect(risco.horasLimite).toBe(17.5)
  })

  it('sobram 9,5h até a reprovação', () => {
    expect(risco.horasRestantes).toBe(9.5)
  })

  it('exibe no formato pedido pela spec', () => {
    expect(formatarProgressoHoras(risco.totalFaltado, risco.cargaHorariaTotal)).toBe('8h / 70h')
  })

  it('consumiu pouco menos da metade do orçamento de faltas', () => {
    expect(risco.consumoDoLimite).toBeCloseTo(8 / 17.5, 10)
  })
})

describe('calcularRisco — §7.1: justificada conta ou não', () => {
  const faltas = [falta('2026-08-10', 4), falta('2026-08-12', 2, true)]

  it('por padrão, a justificada não desconta da carga horária', () => {
    const risco = calcularRisco(CARGA_MFC, faltas)
    expect(risco.totalFaltado).toBe(4)
    expect(risco.totalJustificado).toBe(2)
    expect(risco.qtdFaltas).toBe(1)
    expect(risco.qtdJustificadas).toBe(1)
  })

  it('com justificadaConta = true, ela entra na conta', () => {
    const risco = calcularRisco(CARGA_MFC, faltas, LIMITES_PADRAO, {
      justificadaConta: true,
      justificadaQuebraStreak: false,
    })
    expect(risco.totalFaltado).toBe(6)
  })

  it('o contador separado continua existindo nos dois modos', () => {
    const comConta = calcularRisco(CARGA_MFC, faltas, LIMITES_PADRAO, {
      justificadaConta: true,
      justificadaQuebraStreak: false,
    })
    expect(comConta.totalJustificado).toBe(2)
  })
})

describe('calcularRisco — casos de borda', () => {
  it('sem faltas, tudo zerado e verde', () => {
    const risco = calcularRisco(CARGA_MFC, [])
    expect(risco.totalFaltado).toBe(0)
    expect(risco.percentual).toBe(0)
    expect(risco.status).toBe('verde')
    expect(risco.horasRestantes).toBe(17.5)
  })

  it('faltando além do limite, o saldo não fica negativo', () => {
    const risco = calcularRisco(CARGA_MFC, [falta('2026-08-10', 30)])
    expect(risco.status).toBe('reprovado')
    expect(risco.horasRestantes).toBe(0)
    expect(risco.ultrapassouLimite).toBe(true)
  })

  it('carga zero não vira Infinity na tela', () => {
    const risco = calcularRisco(0, [falta('2026-08-10', 4)])
    expect(Number.isFinite(risco.percentual)).toBe(true)
    expect(risco.percentual).toBe(0)
    expect(risco.status).toBe('verde')
  })
})

describe('horasQueContam', () => {
  it('ignora justificadas por padrão', () => {
    expect(horasQueContam([falta('2026-08-10', 4), falta('2026-08-12', 2, true)])).toBe(4)
  })

  it('soma tudo quando a regra do curso manda contar', () => {
    expect(
      horasQueContam([falta('2026-08-10', 4), falta('2026-08-12', 2, true)], {
        justificadaConta: true,
        justificadaQuebraStreak: false,
      }),
    ).toBe(6)
  })
})

describe('hora e minuto — o formulário pergunta assim, o banco guarda decimal', () => {
  it('converte a ida e a volta sem perder o minuto', () => {
    // 4h10 é 4,1666… e o banco tem duas casas: 4,17. A volta precisa devolver
    // os mesmos 4h10, senão a pessoa digita uma coisa e reabre outra.
    for (const [h, min] of [
      [4, 10],
      [1, 20],
      [2, 50],
      [0, 50],
      [3, 40],
      [1, 45],
      [2, 0],
      [0, 5],
    ] as const) {
      const decimal = deHoraMinuto(h, min)
      expect(emHoraMinuto(decimal)).toEqual({ h, min })
    }
  })

  it('todos os 60 minutos de todas as horas até 8 voltam iguais', () => {
    for (let h = 0; h <= 8; h += 1) {
      for (let min = 0; min < 60; min += 1) {
        expect(emHoraMinuto(deHoraMinuto(h, min))).toEqual({ h, min })
      }
    }
  })

  it('trata entrada inválida como zero em vez de NaN', () => {
    expect(deHoraMinuto(Number.NaN, 30)).toBe(0.5)
    expect(deHoraMinuto(-3, -10)).toBe(0)
  })

  it('formata para leitura', () => {
    expect(formatarHoraMinuto(deHoraMinuto(4, 10))).toBe('4h10')
    expect(formatarHoraMinuto(2)).toBe('2h')
    expect(formatarHoraMinuto(deHoraMinuto(0, 50))).toBe('50min')
    expect(formatarHoraMinuto(deHoraMinuto(1, 5))).toBe('1h05')
  })

  it('o decimal antigo continua legível', () => {
    // Grades cadastradas antes disto usam 2,5 e 1,5 — precisam aparecer certo.
    expect(formatarHoraMinuto(2.5)).toBe('2h30')
    expect(formatarHoraMinuto(1.5)).toBe('1h30')
  })
})
