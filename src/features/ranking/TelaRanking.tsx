import { Info, Users } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { Cartao } from '@/components/ui/Cartao.tsx'
import { useGrupos, useRanking } from '@/data/queries.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { usePainel } from '@/features/dashboard/usePainel.ts'
import { cn } from '@/lib/cn.ts'
import { Cabecalho, Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'
import type { ItemRanking } from '@/types/database.ts'

/**
 * §5 — "Ranking: mostra apenas a posição de cada um (1º, 2º, 3º lugar…) sem
 * expor porcentagem, faixa de presença ou qualquer número."
 *
 * Esta tela NÃO recebe número nenhum dos colegas. A RPC get_group_ranking faz
 * a ordenação dentro do banco e devolve só a colocação — não há o que a
 * interface possa vazar por descuido, porque o dado nunca chega aqui.
 */
export function TelaRanking() {
  const usuarioId = useUsuarioId()
  const painel = usePainel(usuarioId)
  const grupos = useGrupos(usuarioId)
  const navegar = useNavigate()

  const [grupoId, setGrupoId] = useState<string | null>(null)
  const [disciplinaId, setDisciplinaId] = useState<string | null>(null)

  const grupoAtivo = grupoId ?? grupos.data?.[0]?.id ?? null
  const ranking = useRanking(grupoAtivo, disciplinaId)

  if (grupos.error !== null) return <Erro erro={grupos.error} />
  if (grupos.isPending || painel.carregando) return <Esqueleto />

  const lista = grupos.data

  if (lista.length === 0) {
    return (
      <>
        <Cabecalho titulo="Ranking" />
        <main className="mx-auto max-w-2xl px-5 pt-5 pb-28">
          <Vazio
            emoji="👥"
            titulo="Você não está em nenhuma turma"
            texto="Entre na comunidade do seu período para comparar presença com os colegas — sem que ninguém veja os números de ninguém."
            acao={{ rotulo: 'Ver comunidades', aoClicar: () => void navegar('/comunidades') }}
          />
        </main>
      </>
    )
  }

  const grupo = lista.find((g) => g.id === grupoAtivo)
  const posicoes = ranking.data ?? []

  return (
    <>
      <Cabecalho titulo="Ranking" subtitulo={grupo?.nome ?? ''} />

      <main className="mx-auto max-w-2xl space-y-4 px-5 pt-5 pb-28 lg:pb-10">
        {lista.length > 1 && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
            {lista.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setGrupoId(g.id)
                }}
                aria-pressed={g.id === grupoAtivo}
                className={cn(
                  'shrink-0 rounded-pill border-2 px-3 py-1.5 text-xs font-bold whitespace-nowrap',
                  g.id === grupoAtivo
                    ? 'border-acento bg-acento-suave text-acento'
                    : 'border-borda text-texto-suave',
                )}
              >
                {g.nome}
              </button>
            ))}
          </div>
        )}

        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          <button
            type="button"
            onClick={() => {
              setDisciplinaId(null)
            }}
            aria-pressed={disciplinaId === null}
            className={cn(
              'shrink-0 rounded-pill border-2 px-3 py-1.5 text-xs font-bold whitespace-nowrap',
              disciplinaId === null
                ? 'border-acento bg-acento-suave text-acento'
                : 'border-borda text-texto-suave',
            )}
          >
            Geral
          </button>
          {painel.cartoes.map((c) => (
            <button
              key={c.disciplina.id}
              type="button"
              onClick={() => {
                setDisciplinaId(c.disciplina.id)
              }}
              aria-pressed={disciplinaId === c.disciplina.id}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-pill border-2 px-3 py-1.5 text-xs font-bold whitespace-nowrap',
                disciplinaId === c.disciplina.id
                  ? 'border-acento bg-acento-suave text-acento'
                  : 'border-borda text-texto-suave',
              )}
            >
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ backgroundColor: c.disciplina.cor }}
              />
              {c.disciplina.nome}
            </button>
          ))}
        </div>

        {ranking.isPending ? (
          <div className="h-64 animate-pulse rounded-card bg-superficie-2" />
        ) : posicoes.length === 0 ? (
          <Cartao className="p-6 text-center">
            <p className="text-3xl" aria-hidden="true">
              🔒
            </p>
            <h2 className="mt-3 font-extrabold text-texto">Grupo pequeno demais</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm font-semibold text-texto-suave">
              O ranking só aparece a partir de três pessoas. Com duas, saber que você é o 2º
              já revela quanto o outro faltou.
            </p>
          </Cartao>
        ) : (
          <>
            <ol className="space-y-2">
              {posicoes.map((p) => (
                <LinhaRanking key={p.usuario_id} item={p} />
              ))}
            </ol>

            <Cartao className="flex gap-3 p-4">
              <Info className="size-5 shrink-0 text-texto-fraco" />
              <p className="text-xs font-semibold text-texto-suave">
                Só a colocação é compartilhada. Ninguém vê a porcentagem, as horas nem a faixa
                do semáforo de ninguém — nem você as deles, nem eles as suas.
              </p>
            </Cartao>
          </>
        )}

        {grupo !== undefined && (
          <Cartao className="flex items-center gap-3 p-4">
            <Users className="size-5 shrink-0 text-texto-fraco" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-texto-fraco">Código de convite</p>
              <p className="tabular font-extrabold text-texto">{grupo.codigo_convite}</p>
            </div>
          </Cartao>
        )}
      </main>
    </>
  )
}

const MEDALHAS: Readonly<Record<number, string>> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function LinhaRanking({ item }: { item: ItemRanking }) {
  const medalha = MEDALHAS[item.posicao]

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-card border-2 p-4',
        item.eh_voce ? 'border-acento bg-acento-suave' : 'border-borda bg-superficie',
      )}
    >
      <span className="grid w-9 shrink-0 place-items-center">
        {medalha !== undefined ? (
          <span className="text-2xl" aria-hidden="true">
            {medalha}
          </span>
        ) : (
          <span className="tabular text-lg font-extrabold text-texto-fraco">
            {item.posicao}º
          </span>
        )}
      </span>

      <span className="grid size-10 shrink-0 place-items-center rounded-pill bg-superficie-2 text-lg">
        {item.emoji}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold text-texto">{item.nome}</span>
        <span className="block text-xs font-semibold text-texto-fraco">
          {item.posicao}º lugar
        </span>
      </span>

      {item.eh_voce && (
        <span className="shrink-0 rounded-pill bg-acento px-2.5 py-1 text-[0.6875rem] font-bold text-acento-contraste">
          você
        </span>
      )}
    </li>
  )
}
