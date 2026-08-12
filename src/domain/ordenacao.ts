import { PESO_STATUS } from './risco.ts'
import type { Status } from './tipos.ts'

/**
 * §7.2 — "Ordenar por risco (as mais vermelhas aparecem primeiro, pra chamar
 * atenção)."
 *
 * O critério é status primeiro, percentual depois: duas disciplinas vermelhas
 * ficam juntas no topo, e entre elas a pior sobe. Ordenar só por percentual
 * misturaria uma vermelha de 21% com uma amarela de 20,5% — visualmente
 * parecidas, mas com urgências diferentes.
 */

export interface OrdenavelPorRisco {
  readonly status: Status
  readonly percentual: number
}

export type CriterioOrdenacao = 'risco' | 'nome' | 'saldo' | 'carga'

export function ordenarPorRisco<T extends OrdenavelPorRisco>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => {
    const peso = PESO_STATUS[b.status] - PESO_STATUS[a.status]
    if (peso !== 0) return peso
    return b.percentual - a.percentual
  })
}

export function ordenarPorNome<T extends { nome: string }>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Menor saldo primeiro — "de quais eu preciso cuidar agora". */
export function ordenarPorSaldo<T extends { horasRestantes: number }>(
  itens: readonly T[],
): T[] {
  return [...itens].sort((a, b) => a.horasRestantes - b.horasRestantes)
}

export function ordenarPorCarga<T extends { cargaHorariaTotal: number }>(
  itens: readonly T[],
): T[] {
  return [...itens].sort((a, b) => b.cargaHorariaTotal - a.cargaHorariaTotal)
}

export const ROTULO_CRITERIO: Readonly<Record<CriterioOrdenacao, string>> = {
  risco: 'Risco',
  nome: 'Nome',
  saldo: 'Menor saldo',
  carga: 'Carga horária',
}

export function ordenar<
  T extends OrdenavelPorRisco & { nome: string; horasRestantes: number; cargaHorariaTotal: number },
>(itens: readonly T[], criterio: CriterioOrdenacao): T[] {
  switch (criterio) {
    case 'risco':
      return ordenarPorRisco(itens)
    case 'nome':
      return ordenarPorNome(itens)
    case 'saldo':
      return ordenarPorSaldo(itens)
    case 'carga':
      return ordenarPorCarga(itens)
  }
}
