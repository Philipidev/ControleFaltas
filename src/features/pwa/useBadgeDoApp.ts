import { useEffect } from 'react'

/**
 * §7.4 — "Widget na tela inicial: mostra, sem precisar abrir o app, as
 * disciplinas que estão em amarelo ou vermelho. Atualiza automaticamente
 * após cada falta registrada."
 *
 * O que existe de verdade na web: widget nativo de home screen só está
 * disponível no Windows 11; iOS e Android não expõem isso para PWA. A
 * tradução honesta é o BADGE numérico no ícone do app instalado — o número de
 * disciplinas que precisam de atenção, visível sem abrir nada e atualizado a
 * cada falta registrada.
 *
 * Somado aos `shortcuts` do manifest (segurar o ícone → "Marcar falta"), é o
 * mais perto que dá para chegar. Prometer widget nativo seria mentira, e a
 * limitação está escrita no README.
 */
export function useBadgeDoApp(emAtencao: number): void {
  useEffect(() => {
    // A API está tipada no lib.dom, mas só existe em navegador que suporta
    // Badging e apenas com o app instalado.
    if (!('setAppBadge' in navigator)) return

    // "Tudo em dia" é a ausência de número, não um zero pendurado no ícone.
    const acao =
      emAtencao > 0 ? navigator.setAppBadge(emAtencao) : navigator.clearAppBadge()

    void acao.catch(() => {
      /* sem permissão ou não instalado: silêncio é o comportamento certo */
    })
  }, [emAtencao])
}
