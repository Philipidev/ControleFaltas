import { useEffect, useState } from 'react'

import { Cartao } from '@/components/ui/Cartao.tsx'
import {
  definirModoDaBarra,
  lerModoDaBarra,
  medirFaixaFantasma,
  MODOS_DA_BARRA,
  type ModoDaBarra,
} from '@/features/pwa/faixaFantasma.ts'
import { cn } from '@/lib/cn.ts'

const EXPLICACAO: Record<ModoDaBarra, string> = {
  normal: 'A barra para no fim do viewport — que no iPhone não é a borda do aparelho.',
  rasa: 'Desconta a faixa do recuo do indicador de gesto. Sobe os rótulos sem arriscar corte.',
  puxada: 'Empurra a barra para dentro da faixa, até a borda física. Só funciona se o iOS desenhar lá.',
}

/**
 * Números do viewport do aparelho.
 *
 * Existe porque bug de layout em PWA instalado no iOS é impossível de
 * diagnosticar de fora: não há console, não há barra de URL para abrir outra
 * página, e `dvh`, `safe-area-inset` e a altura real da tela divergem entre
 * versões do iOS de um jeito que só o aparelho sabe. Em vez de chutar
 * correções, esta tela mostra o que o sistema está realmente reportando.
 *
 * Fica em Ajustes, no fim, recolhida.
 */
export function DiagnosticoViewport() {
  const [aberto, setAberto] = useState(false)
  const [dados, setDados] = useState<Record<string, string>>({})
  const [modo, setModo] = useState<ModoDaBarra>(() => lerModoDaBarra())

  useEffect(() => {
    if (!aberto) return

    function medir() {
      // env() não é legível por JS. A sonda tem a altura do inset, e aí basta
      // medir a sonda.
      const sonda = document.createElement('div')
      sonda.style.cssText =
        'position:fixed;visibility:hidden;top:0;left:0;width:1px;' +
        'padding-top:env(safe-area-inset-top,0px);' +
        'padding-bottom:env(safe-area-inset-bottom,0px);'
      document.body.appendChild(sonda)
      const estilo = getComputedStyle(sonda)
      const insetTopo = estilo.paddingTop
      const insetBase = estilo.paddingBottom
      sonda.remove()

      const modo = ['standalone', 'minimal-ui', 'fullscreen', 'browser'].find((m) =>
        window.matchMedia(`(display-mode: ${m})`).matches,
      )

      const nav = document.querySelector('nav[aria-label="Navegação principal"]')
      const r = nav?.getBoundingClientRect()
      const doc = document.scrollingElement

      // Uma régua de 100dvh e outra de 100vh, para ver se divergem — é aí que
      // mora o bug clássico do iOS em standalone.
      const regua = document.createElement('div')
      regua.style.cssText = 'position:fixed;visibility:hidden;top:0;left:0;width:1px;height:100dvh;'
      document.body.appendChild(regua)
      const alturaDvh = regua.getBoundingClientRect().height
      regua.style.height = '100vh'
      const alturaVh = regua.getBoundingClientRect().height
      regua.style.height = '100svh'
      const alturaSvh = regua.getBoundingClientRect().height
      regua.remove()

      setDados({
        'display-mode': modo ?? 'desconhecido',
        'navigator.standalone': String(
          (navigator as Navigator & { standalone?: boolean }).standalone ?? '—',
        ),
        'inset topo': insetTopo,
        'inset base': insetBase,
        'innerHeight': `${String(window.innerHeight)}px`,
        '100dvh': `${String(Math.round(alturaDvh))}px`,
        '100vh': `${String(Math.round(alturaVh))}px`,
        '100svh': `${String(Math.round(alturaSvh))}px`,
        'visualViewport': window.visualViewport
          ? `${String(Math.round(window.visualViewport.height))}px (offset ${String(
              Math.round(window.visualViewport.offsetTop),
            )})`
          : '—',
        'screen.height': `${String(window.screen.height)}px`,
        'faixa fantasma': `${String(
          medirFaixaFantasma({
            alturaDaTela: window.screen.height,
            alturaDoViewport: window.innerHeight,
            ehAppDoIos: (navigator as Navigator & { standalone?: boolean }).standalone === true,
          }),
        )}px`,
        'barra: altura': r ? `${String(Math.round(r.height))}px` : 'não achei',
        'barra: base em': r ? `${String(Math.round(r.bottom))}px` : '—',
        'sobra abaixo da barra': r ? `${String(Math.round(window.innerHeight - r.bottom))}px` : '—',
        'documento rola': doc ? String(doc.scrollHeight > doc.clientHeight + 1) : '—',
        'scrollHeight do doc': doc ? `${String(doc.scrollHeight)}px` : '—',
      })
    }

    medir()
    window.addEventListener('resize', medir)
    return () => {
      window.removeEventListener('resize', medir)
    }
    // `modo` entra nas dependências porque muda a geometria da barra: com ela
    // puxada, "barra: base em" passa de 912 para 956 e a sobra vira negativa.
    // É por esse par de números que se confirma que o iOS desenhou na faixa.
  }, [aberto, modo])

  return (
    <Cartao className="p-5">
      <button
        type="button"
        onClick={() => {
          setAberto(!aberto)
        }}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between text-left"
      >
        <span>
          <span className="block font-extrabold text-texto">Diagnóstico do aparelho</span>
          <span className="block text-xs font-semibold text-texto-suave">
            Números do viewport, para investigar layout no celular.
          </span>
        </span>
        <span aria-hidden="true" className="ml-3 shrink-0 text-texto-fraco">
          {aberto ? '−' : '+'}
        </span>
      </button>

      {aberto && (
        <>
          <dl className="mt-4 space-y-1.5 border-t border-borda pt-4">
            {Object.entries(dados).map(([chave, valor]) => (
              <div key={chave} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="font-semibold text-texto-suave">{chave}</dt>
                <dd className="tabular shrink-0 font-extrabold text-texto">{valor}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 border-t border-borda pt-4">
            <p className="font-extrabold text-texto">Barra de baixo</p>
            <p className="mt-0.5 text-xs font-semibold text-texto-suave">
              Escolha o que deixa o menu encostado na borda do aparelho. A escolha fica salva.
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {MODOS_DA_BARRA.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={m === modo}
                  onClick={() => {
                    definirModoDaBarra(m)
                    setModo(m)
                  }}
                  className={cn(
                    'rounded-controle px-2 py-2 text-xs font-extrabold capitalize transition-colors',
                    m === modo
                      ? 'bg-acento text-acento-contraste'
                      : 'bg-superficie-2 text-texto-suave',
                  )}
                >
                  {m}
                </button>
              ))}
            </div>

            <p className="mt-2 text-xs font-semibold text-texto-fraco">{EXPLICACAO[modo]}</p>
          </div>
        </>
      )}
    </Cartao>
  )
}
