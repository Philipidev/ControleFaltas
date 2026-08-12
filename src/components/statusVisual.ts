import type { Status } from '@/domain/tipos.ts'

/**
 * Mapa único de status → classes utilitárias.
 *
 * Fica separado dos componentes por dois motivos: o Fast Refresh do Vite só
 * funciona em arquivos que exportam apenas componentes, e ter as quatro cores
 * do semáforo num lugar só evita que o chip e o medidor saiam de sincronia.
 */

export const FUNDO_SUAVE: Readonly<Record<Status, string>> = {
  verde: 'bg-verde-suave',
  amarelo: 'bg-amarelo-suave',
  vermelho: 'bg-vermelho-suave',
  reprovado: 'bg-reprovado-suave',
}

export const PREENCHIMENTO: Readonly<Record<Status, string>> = {
  verde: 'bg-verde',
  amarelo: 'bg-amarelo',
  vermelho: 'bg-vermelho',
  reprovado: 'bg-reprovado',
}

export const TEXTO: Readonly<Record<Status, string>> = {
  verde: 'text-verde',
  amarelo: 'text-amarelo',
  vermelho: 'text-vermelho',
  reprovado: 'text-reprovado',
}

/** Chip: fundo claro + texto na cor do status, do mesmo passo da rampa. */
export const CHIP: Readonly<Record<Status, string>> = {
  verde: 'bg-verde-suave text-verde',
  amarelo: 'bg-amarelo-suave text-amarelo',
  vermelho: 'bg-vermelho-suave text-vermelho',
  reprovado: 'bg-reprovado-suave text-reprovado',
}
