import { Flame, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { usePainel } from './usePainel.ts'
import { CartaoDisciplina } from '@/components/CartaoDisciplina.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { formatarHoras, formatarPercentual } from '@/domain/risco.ts'
import { descreverStreak } from '@/domain/streak.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { FolhaMarcarFalta } from '@/features/faltas/FolhaMarcarFalta.tsx'
import { Cabecalho, Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'

/**
 * §7.2 — Dashboard geral: todas as disciplinas de uma vez, cada uma com nome,
 * semáforo, horas perdidas/total e quantos dias ainda pode faltar, ordenadas
 * por risco.
 */
export function TelaInicial() {
  const usuarioId = useUsuarioId()
  const painel = usePainel(usuarioId)
  const navegar = useNavigate()
  const [marcando, setMarcando] = useState<string | null>(null)

  if (painel.erro !== null) return <Erro erro={painel.erro} />
  if (painel.carregando) return <Esqueleto />

  return (
    <>
      <Cabecalho titulo="Minhas faltas" subtitulo="Ordenadas por risco" />

      <main className="mx-auto max-w-2xl space-y-5 px-5 pt-5 pb-28 lg:pb-10">
        {painel.cartoes.length === 0 ? (
          <Vazio
            emoji="📚"
            titulo="Nenhuma disciplina ainda"
            texto="Escolha as disciplinas do seu período para começar a acompanhar a frequência."
            acao={{ rotulo: 'Escolher disciplinas', aoClicar: () => void navegar('/disciplinas') }}
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Estatistica
                rotulo="Faltas no total"
                valor={formatarPercentual(painel.geral.percentual)}
                detalhe={formatarHoras(painel.geral.totalFaltado)}
              />
              <Estatistica
                rotulo="Precisam de atenção"
                valor={String(painel.geral.emAtencao)}
                detalhe={`de ${String(painel.geral.total)} disciplinas`}
              />
              <Estatistica
                rotulo="Nesta semana"
                valor={String(painel.semana.totalFaltas)}
                detalhe={painel.semana.totalFaltas === 1 ? 'falta' : 'faltas'}
              />
            </div>

            {/* §7.5 — gamificação leve, sem exagerar */}
            <Cartao className="flex items-center gap-4 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-acento-suave">
                <Flame className="size-6 text-acento" />
              </span>
              <div className="min-w-0">
                <p className="font-extrabold text-texto">{descreverStreak(painel.streak)}</p>
                <p className="text-xs font-semibold text-texto-suave">
                  {painel.streak.noRecorde && painel.streak.diasSemFaltar > 0
                    ? 'É o seu recorde no semestre!'
                    : `Seu recorde é de ${String(painel.streak.recorde)} dias.`}
                </p>
              </div>
            </Cartao>

            <div className="space-y-3">
              {painel.cartoes.map((c) => (
                <CartaoDisciplina
                  key={c.disciplina.id}
                  disciplina={c.disciplina}
                  risco={c.risco}
                  projecao={c.projecao}
                  limites={painel.limites}
                  onAbrir={() => void navegar(`/disciplinas/${c.disciplina.id}`)}
                  onMarcarFalta={() => {
                    setMarcando(c.disciplina.id)
                  }}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Botão flutuante: marcar falta é a ação que o app existe para fazer,
          e precisa estar a um toque de qualquer lugar da tela inicial. */}
      {painel.cartoes.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setMarcando(painel.cartoes[0]?.disciplina.id ?? '')
          }}
          className="botao-3d fixed right-5 bottom-20 z-20 flex h-14 items-center gap-2 rounded-pill bg-acento px-6 font-extrabold text-acento-contraste lg:bottom-8"
          style={{ ['--cor-labio' as string]: 'var(--c-acento-labio)' }}
        >
          <Plus className="size-5" />
          Marcar falta
        </button>
      )}

      {marcando !== null && (
        <FolhaMarcarFalta
          cartoes={painel.cartoes}
          limites={painel.limites}
          usuarioId={usuarioId}
          disciplinaInicial={marcando}
          aoFechar={() => {
            setMarcando(null)
          }}
        />
      )}
    </>
  )
}

function Estatistica({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: string
  detalhe: string
}) {
  return (
    <Cartao className="p-4">
      <p className="text-[0.6875rem] leading-tight font-bold text-texto-fraco">{rotulo}</p>
      <p className="figura-hero mt-2 text-2xl text-texto">{valor}</p>
      <p className="mt-1 text-[0.6875rem] font-semibold text-texto-suave">{detalhe}</p>
    </Cartao>
  )
}
