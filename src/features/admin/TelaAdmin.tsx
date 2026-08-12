import { FileUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { FolhaDisciplinaAdmin } from './FolhaDisciplinaAdmin.tsx'
import { FolhaImportar } from './FolhaImportar.tsx'
import { GradeSemanalResumo } from '@/components/GradeSemanalResumo.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { paraDisciplina, type LinhaDisciplinaComGrade } from '@/data/mapeadores.ts'
import { useRemoverDisciplinaAdmin, useTodasDisciplinas } from '@/data/queries.ts'
import { formatarHoras } from '@/domain/risco.ts'
import { Cabecalho, Erro, Esqueleto, Vazio } from '@/layout/pecas.tsx'

/**
 * §2 — Painel do admin.
 *
 * "Criar/editar/remover disciplinas · definir carga horária e grade semanal ·
 * organizar por curso, período e turma · ver todas num só lugar, pra facilitar
 * atualização a cada semestre."
 *
 * O agrupamento por curso → período → turma não é enfeite: é como a
 * coordenação pensa a grade, e é o que torna a revisão semestral viável.
 */
export function TelaAdmin() {
  const disciplinas = useTodasDisciplinas()
  const remover = useRemoverDisciplinaAdmin()

  const [editando, setEditando] = useState<LinhaDisciplinaComGrade | null>(null)
  const [criando, setCriando] = useState(false)
  const [importando, setImportando] = useState(false)

  const grupos = useMemo(() => {
    const mapa = new Map<string, LinhaDisciplinaComGrade[]>()
    for (const d of disciplinas.data ?? []) {
      const chave = [d.curso, d.periodo, d.turma ?? '—', d.semestre].join(' · ')
      const lista = mapa.get(chave) ?? []
      lista.push(d)
      mapa.set(chave, lista)
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  }, [disciplinas.data])

  if (disciplinas.error !== null) return <Erro erro={disciplinas.error} />
  if (disciplinas.isPending) return <Esqueleto />

  const total = disciplinas.data.length

  return (
    <>
      <Cabecalho
        titulo="Catálogo"
        subtitulo={`${String(total)} ${total === 1 ? 'disciplina' : 'disciplinas'} · back-office`}
        acao={
          <button
            type="button"
            onClick={() => {
              setCriando(true)
            }}
            aria-label="Nova disciplina"
            className="grid size-11 place-items-center rounded-pill bg-acento text-acento-contraste"
          >
            <Plus className="size-5" />
          </button>
        }
      />

      <main className="mx-auto max-w-2xl space-y-5 px-5 pt-5 pb-28 lg:pb-10">
        <Botao
          variante="secundario"
          larguraTotal
          iconeInicio={<FileUp className="size-4" />}
          onClick={() => {
            setImportando(true)
          }}
        >
          Importar grade de uma vez
        </Botao>

        {total === 0 ? (
          <Vazio
            emoji="🗂️"
            titulo="Catálogo vazio"
            texto="Cadastre as disciplinas oficiais para que os alunos possam apenas selecioná-las."
            acao={{ rotulo: 'Criar a primeira', aoClicar: () => { setCriando(true) } }}
          />
        ) : (
          grupos.map(([chave, lista]) => (
            <section key={chave}>
              <h2 className="mb-2.5 px-1 text-sm font-extrabold text-texto-suave">{chave}</h2>
              <div className="space-y-3">
                {lista.map((linha) => {
                  const d = paraDisciplina(linha)
                  return (
                    <Cartao key={d.id} corMateria={d.cor} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-extrabold text-texto">
                            {d.nome}
                            {linha.codigo !== null && (
                              <span className="ml-2 text-xs font-bold text-texto-fraco">
                                {linha.codigo}
                              </span>
                            )}
                          </h3>
                          <p className="mt-0.5 text-xs font-semibold text-texto-suave">
                            {formatarHoras(d.cargaHorariaTotal)} ·{' '}
                            <span className="tabular">
                              {formatarHoras(d.cargaHorariaTotal * 0.25)}
                            </span>{' '}
                            até reprovar
                            {!linha.ativa && (
                              <span className="ml-2 rounded-pill bg-superficie-2 px-2 py-0.5 text-[0.6875rem] font-bold">
                                inativa
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            aria-label={`Editar ${d.nome}`}
                            onClick={() => {
                              setEditando(linha)
                            }}
                            className="grid size-9 place-items-center rounded-pill text-texto-fraco transition-colors hover:bg-acento-suave hover:text-acento"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remover ${d.nome}`}
                            onClick={() => {
                              remover.mutate(d.id)
                            }}
                            className="grid size-9 place-items-center rounded-pill text-texto-fraco transition-colors hover:bg-vermelho-suave hover:text-vermelho"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>

                      <GradeSemanalResumo grade={d.grade} cor={d.cor} className="mt-3" />
                    </Cartao>
                  )
                })}
              </div>
            </section>
          ))
        )}

        <p className="px-1 text-center text-xs font-semibold text-texto-fraco">
          Remover uma disciplina apaga também as matrículas e as faltas ligadas a ela. Para
          tirá-la de circulação sem perder histórico, marque como inativa.
        </p>
      </main>

      {(criando || editando !== null) && (
        <FolhaDisciplinaAdmin
          linha={editando}
          aoFechar={() => {
            setCriando(false)
            setEditando(null)
          }}
        />
      )}

      {importando && (
        <FolhaImportar
          aoFechar={() => {
            setImportando(false)
          }}
        />
      )}
    </>
  )
}
