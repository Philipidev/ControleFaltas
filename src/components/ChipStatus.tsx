import { CHIP, PREENCHIMENTO } from './statusVisual.ts'
import { EMOJI_STATUS, ROTULO_STATUS } from '@/domain/risco.ts'
import type { Status } from '@/domain/tipos.ts'
import { cn } from '@/lib/cn.ts'

/**
 * O semáforo da §4 em forma de chip.
 *
 * Cor de status NUNCA sozinha: sempre acompanhada do emoji e do rótulo. Para
 * quem tem daltonismo, verde e vermelho podem ser o mesmo tom — o texto é o
 * canal que não falha. Vale também no modo de alto contraste forçado.
 */

interface Props {
  readonly status: Status
  readonly tamanho?: 'sm' | 'md'
  readonly className?: string
}

export function ChipStatus({ status, tamanho = 'md', className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill font-bold',
        tamanho === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        CHIP[status],
        className,
      )}
    >
      <span aria-hidden="true">{EMOJI_STATUS[status]}</span>
      {ROTULO_STATUS[status]}
    </span>
  )
}

/** Só a bolinha, para listas densas. Sempre com rótulo acessível junto. */
export function PontoStatus({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full', PREENCHIMENTO[status], className)}
      role="img"
      aria-label={ROTULO_STATUS[status]}
    />
  )
}
