import { useEffect, useState } from 'react'

import { Cartao } from '@/components/ui/Cartao.tsx'
import { medirFaixaFantasma } from '@/features/pwa/faixaFantasma.ts'

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
        // O bloco de contenção inicial. Por especificação ele segue o viewport
        // PEQUENO, então aqui vale 894 enquanto o viewport tem 912 — é essa
        // diferença de 18px que faz o documento ter o que rolar.
        'clientHeight do html': `${String(document.documentElement.clientHeight)}px`,
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
  }, [aberto])

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
        <dl className="mt-4 space-y-1.5 border-t border-borda pt-4">
          {Object.entries(dados).map(([chave, valor]) => (
            <div key={chave} className="flex items-baseline justify-between gap-3 text-sm">
              <dt className="font-semibold text-texto-suave">{chave}</dt>
              <dd className="tabular shrink-0 font-extrabold text-texto">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
    </Cartao>
  )
}
