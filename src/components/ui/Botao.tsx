import { type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'

import { cn } from '@/lib/cn.ts'

export type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo'
export type TamanhoBotao = 'sm' | 'md' | 'lg'

interface PropsBotao extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variante?: VarianteBotao
  readonly tamanho?: TamanhoBotao
  readonly larguraTotal?: boolean
  readonly iconeInicio?: ReactNode
  readonly iconeFim?: ReactNode
  readonly className?: string
  readonly ref?: Ref<HTMLButtonElement>
}

const VARIANTES: Record<VarianteBotao, string> = {
  primario: 'bg-acento text-acento-contraste [--cor-labio:var(--c-acento-labio)]',
  secundario:
    'bg-superficie-2 text-texto border border-borda [--cor-labio:var(--c-borda-forte)]',
  fantasma: 'bg-transparent text-texto-suave hover:bg-superficie-2 shadow-none',
  perigo: 'bg-vermelho text-status-contraste [--cor-labio:var(--c-vermelho-labio)]',
}

const TAMANHOS: Record<TamanhoBotao, string> = {
  // 44px de altura mínima: alvo de toque confortável no polegar
  sm: 'h-11 px-4 text-sm gap-1.5',
  md: 'h-13 px-6 text-base gap-2',
  lg: 'h-16 px-8 text-lg gap-2.5',
}

/**
 * Botão com o "lábio" 3D que comprime no toque — a assinatura do visual
 * escolhido. O feedback é puramente local (CSS :active), então o dedo recebe
 * a confirmação na hora, sem esperar rede.
 */
export function Botao({
  variante = 'primario',
  tamanho = 'md',
  larguraTotal = false,
  iconeInicio,
  iconeFim,
  className,
  children,
  ref,
  ...resto
}: PropsBotao) {
  const usaLabio = variante !== 'fantasma'

  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center rounded-controle font-extrabold',
        'select-none whitespace-nowrap',
        'transition-[filter,opacity] duration-150',
        'hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50',
        usaLabio && 'botao-3d',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        larguraTotal && 'w-full',
        className,
      )}
      {...resto}
    >
      {iconeInicio}
      {children}
      {iconeFim}
    </button>
  )
}
