import { Moon, Sun, SunMoon } from 'lucide-react'
import type { MouseEvent } from 'react'

import { cn } from '@/lib/cn.ts'
import { useTema } from '@/theme/contexto.ts'
import { MODOS, TEMAS, type IdTema, type Modo } from '@/theme/temas.ts'

/** Coordenadas do clique: a revelação circular do tema nasce onde o dedo tocou. */
function origemDoClique(e: MouseEvent<HTMLElement>): { x: number; y: number } {
  const r = e.currentTarget.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

const ICONE_MODO = { light: Sun, dark: Moon, system: SunMoon } as const

export function BotaoModo({ className }: { className?: string }) {
  const { modoEfetivo, alternarModo } = useTema()
  const Icone = modoEfetivo === 'dark' ? Moon : Sun

  return (
    <button
      type="button"
      onClick={(e) => {
        alternarModo(origemDoClique(e))
      }}
      aria-label={`Mudar para o modo ${modoEfetivo === 'dark' ? 'claro' : 'escuro'}`}
      className={cn(
        'grid size-11 place-items-center rounded-pill bg-superficie-2 text-texto-suave',
        'transition-colors hover:bg-acento-suave hover:text-acento',
        className,
      )}
    >
      <Icone className="size-5" />
    </button>
  )
}

export function SeletorTema({ className }: { className?: string }) {
  const { tema, modo, definirModo } = useTema()

  return (
    <div className={cn('space-y-5', className)}>
      <fieldset>
        <legend className="mb-2.5 text-sm font-extrabold text-texto">Aparência</legend>
        <div className="flex gap-2">
          {MODOS.map((m) => {
            const Icone = ICONE_MODO[m.id satisfies Modo]
            const ativo = modo === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={(e) => {
                  definirModo(m.id, origemDoClique(e))
                }}
                aria-pressed={ativo}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1.5 rounded-controle border-2 py-3',
                  'text-xs font-bold transition-colors',
                  ativo
                    ? 'border-acento bg-acento-suave text-acento'
                    : 'border-borda text-texto-suave hover:border-borda-forte',
                )}
              >
                <Icone className="size-5" />
                {m.nome}
              </button>
            )
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 text-sm font-extrabold text-texto">Cor do app</legend>
        <div className="grid grid-cols-3 gap-2">
          {TEMAS.map((t) => (
            <BotaoTema key={t.id} id={t.id} nome={t.nome} emoji={t.emoji} ativo={tema === t.id} />
          ))}
        </div>
        <p className="mt-3 text-xs font-medium text-texto-fraco">
          As cores do semáforo (verde, amarelo, vermelho) não mudam com o tema — elas
          significam alguma coisa.
        </p>
      </fieldset>
    </div>
  )
}

function BotaoTema({
  id,
  nome,
  emoji,
  ativo,
}: {
  id: IdTema
  nome: string
  emoji: string
  ativo: boolean
}) {
  const { definirTema } = useTema()

  return (
    <button
      type="button"
      data-tema={id}
      onClick={(e) => {
        definirTema(id, origemDoClique(e))
      }}
      aria-pressed={ativo}
      className={cn(
        'flex flex-col items-center gap-2 rounded-controle border-2 p-3 transition-all',
        ativo ? 'border-acento' : 'border-borda hover:border-borda-forte',
      )}
    >
      {/* data-tema no próprio botão + a variável --amostra (re-declarada por
          elemento em tokens.css) fazem cada quadrinho pintar a cor do tema
          que representa, sem uma tabela de hex duplicada em JS. */}
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-pill bg-[var(--amostra)] text-sm shadow-[0_3px_0_0_var(--amostra-labio)]"
      >
        {emoji}
      </span>
      <span className="text-[0.6875rem] font-bold text-texto-suave">{nome}</span>
    </button>
  )
}
