import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn.ts'

interface PropsCartao extends HTMLAttributes<HTMLDivElement> {
  /** Faixa lateral com a cor da matéria (§7.6: "cores por matéria"). */
  readonly corMateria?: string | undefined
  readonly className?: string
  readonly children?: ReactNode
}

export function Cartao({ corMateria, className, children, ...resto }: PropsCartao) {
  return (
    <div
      className={cn('cartao overflow-hidden', corMateria !== undefined && 'faixa-materia', className)}
      style={corMateria !== undefined ? { ['--cor-materia' as string]: corMateria } : undefined}
      {...resto}
    >
      {children}
    </div>
  )
}

export function CabecalhoCartao({ className, children, ...resto }: PropsCartao) {
  return (
    <div className={cn('flex items-start justify-between gap-3 p-5 pb-3', className)} {...resto}>
      {children}
    </div>
  )
}

export function CorpoCartao({ className, children, ...resto }: PropsCartao) {
  return (
    <div className={cn('px-5 pb-5', className)} {...resto}>
      {children}
    </div>
  )
}
