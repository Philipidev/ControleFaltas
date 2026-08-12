/**
 * Catálogo de temas.
 *
 * Cada tema é só um par matiz/croma em src/styles/tokens.css — o que
 * significa que adicionar um sétimo tema custa duas linhas de CSS e uma
 * entrada aqui. As cores do semáforo (§4) não pertencem a nenhum tema:
 * são semânticas e ficam fixas por modo claro/escuro.
 */

export const TEMAS = [
  { id: 'fogo', nome: 'Fogo', emoji: '🔥', dica: 'Laranja quente, o padrão' },
  { id: 'oceano', nome: 'Oceano', emoji: '🌊', dica: 'Azul calmo' },
  { id: 'uva', nome: 'Uva', emoji: '🍇', dica: 'Roxo vibrante' },
  { id: 'doce', nome: 'Doce', emoji: '🍭', dica: 'Rosa açucarado' },
  { id: 'menta', nome: 'Menta', emoji: '🌿', dica: 'Verde-água leve' },
  {
    id: 'contraste',
    nome: 'Alto contraste',
    emoji: '◐',
    dica: 'Máxima legibilidade',
  },
] as const

export type IdTema = (typeof TEMAS)[number]['id']
export type Modo = 'light' | 'dark' | 'system'
export type Densidade = 'compacta' | 'confortavel'

export const MODOS = [
  { id: 'light', nome: 'Claro', emoji: '☀️' },
  { id: 'dark', nome: 'Escuro', emoji: '🌙' },
  { id: 'system', nome: 'Sistema', emoji: '💻' },
] as const

export const TEMA_PADRAO: IdTema = 'fogo'
export const MODO_PADRAO: Modo = 'system'
export const DENSIDADE_PADRAO: Densidade = 'confortavel'

/** Mesmas chaves lidas pelo script anti-piscada no index.html. */
export const CHAVE_TEMA = 'cf:tema'
export const CHAVE_MODO = 'cf:modo'
export const CHAVE_DENSIDADE = 'cf:densidade'

const IDS_TEMA = new Set<string>(TEMAS.map((t) => t.id))

export function ehIdTema(valor: string): valor is IdTema {
  return IDS_TEMA.has(valor)
}

export function ehModo(valor: string): valor is Modo {
  return valor === 'light' || valor === 'dark' || valor === 'system'
}

export function ehDensidade(valor: string): valor is Densidade {
  return valor === 'compacta' || valor === 'confortavel'
}
