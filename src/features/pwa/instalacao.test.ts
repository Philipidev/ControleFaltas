import { describe, expect, it } from 'vitest'

import { classificar, type Ambiente } from './instalacao.ts'

/**
 * User agents reais, copiados de aparelhos de verdade.
 *
 * O valor deste teste é justamente este: a diferença entre iPad e Mac, e
 * entre o Safari e o Chrome do iPhone, mora em detalhes de string que não dá
 * para conferir de um computador com Windows. Aqui eles ficam registrados.
 */
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/125.0 Mobile/15E148 Safari/605.1.15',
  // iPadOS 13+ mente e se apresenta como Mac.
  ipad:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  windowsFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
}

function ambiente(parcial: Partial<Ambiente> & { userAgent: string }): Ambiente {
  return { maxTouchPoints: 0, emTelaCheia: false, temConvite: false, ...parcial }
}

describe('classificar — já instalado ganha de tudo', () => {
  it('em tela cheia não oferece nada, nem com convite na mão', () => {
    expect(
      classificar(ambiente({ userAgent: UA.androidChrome, emTelaCheia: true, temConvite: true })),
    ).toBe('instalado')
  })

  it('vale também no iPhone, onde tela cheia vem de navigator.standalone', () => {
    expect(classificar(ambiente({ userAgent: UA.iphoneSafari, emTelaCheia: true }))).toBe(
      'instalado',
    )
  })
})

describe('classificar — Android e desktop instalam de verdade', () => {
  it('Android com convite instala num toque', () => {
    expect(classificar(ambiente({ userAgent: UA.androidChrome, temConvite: true }))).toBe('pronto')
  })

  it('Chrome no Windows também', () => {
    expect(classificar(ambiente({ userAgent: UA.windowsChrome, temConvite: true }))).toBe('pronto')
  })

  it('sem o convite ainda, o botão some em vez de prometer o que não faz', () => {
    expect(classificar(ambiente({ userAgent: UA.androidChrome }))).toBe('indisponivel')
  })

  it('Firefox no Windows não instala PWA', () => {
    expect(classificar(ambiente({ userAgent: UA.windowsFirefox }))).toBe('indisponivel')
  })
})

describe('classificar — iOS não tem API, só instruções', () => {
  it('Safari do iPhone recebe o passo a passo', () => {
    expect(classificar(ambiente({ userAgent: UA.iphoneSafari }))).toBe('ios-safari')
  })

  it('Chrome, Firefox e Edge do iPhone pedem para abrir no Safari', () => {
    for (const ua of [UA.iphoneChrome, UA.iphoneFirefox, UA.iphoneEdge]) {
      expect(classificar(ambiente({ userAgent: ua }))).toBe('ios-outro-navegador')
    }
  })

  it('iPad é reconhecido apesar de se dizer Macintosh', () => {
    // maxTouchPoints é o que separa o iPad do Mac: o UA é idêntico.
    expect(classificar(ambiente({ userAgent: UA.ipad, maxTouchPoints: 5 }))).toBe('ios-safari')
  })

  it('Mac de verdade não recebe instruções de iPhone', () => {
    // Mesmo user agent do iPad, sem toque. Se a regra olhasse só o UA, o
    // desktop veria "toque em Compartilhar" — instrução impossível de seguir.
    expect(classificar(ambiente({ userAgent: UA.macSafari, maxTouchPoints: 0 }))).toBe(
      'indisponivel',
    )
  })
})

describe('classificar — cobre todo user agent conhecido', () => {
  it('nenhum cenário cai num estado inesperado', () => {
    const validos = ['instalado', 'pronto', 'ios-safari', 'ios-outro-navegador', 'indisponivel']
    for (const ua of Object.values(UA)) {
      for (const temConvite of [false, true]) {
        for (const maxTouchPoints of [0, 5]) {
          const r = classificar(ambiente({ userAgent: ua, temConvite, maxTouchPoints }))
          expect(validos, `${ua} convite=${String(temConvite)}`).toContain(r)
        }
      }
    }
  })
})
