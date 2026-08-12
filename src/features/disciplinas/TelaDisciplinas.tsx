import { Check, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { FormularioPersonalizada } from './FormularioPersonalizada.tsx'
import { GradeSemanalResumo } from '@/components/GradeSemanalResumo.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import {
  useCatalogo,
  useDesmatricular,
  useMatricular,
  useMinhasDisciplinas,
  usePerfil,
} from '@/data/queries.ts'
import { semestreAtual } from '@/domain/data.ts'
import { formatarHoras } from '@/domain/risco.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { Cabecalho, Erro, Esqueleto } from '@/layout/pecas.tsx'

/**
 * §2 — o aluno SELECIONA disciplinas do catálogo do admin; não digita carga
 * horária nem grade. Elas já vêm com os dados oficiais.
 *
 * A opção secundária da spec — criar uma disciplina "avulsa"/pessoal — fica
 * separada e explicitamente marcada como só sua, para deixar claro que ela
 * não entra no catálogo de ninguém.
 */
export function TelaDisciplinas() {
  const usuarioId = useUsuarioId()
  const perfil = usePerfil(usuarioId)
  const minhas = useMinhasDisciplinas(usuarioId)
  const semestre = semestreAtual()

  const catalogo = useCatalogo(
    perfil.data?.curso ?? '',
    perfil.data?.periodo ?? '',
    semestre,
  )

  const matricular = useMatricular(usuarioId)
  const desmatricular = useDesmatricular(usuarioId)
  const [criando, setCriando] = useState(false)

  if (minhas.error !== null) return <Erro erro={minhas.error} />
  if (minhas.isPending || perfil.isPending) return <Esqueleto />

  const matriculadas = minhas.data
  const idsMatriculados = new Set(matriculadas.map((m) => m.disciplina.id))
  const disponiveis = (catalogo.data ?? []).filter((d) => !idsMatriculados.has(d.id))

  return (
    <>
      <Cabecalho
        titulo="Minhas disciplinas"
        subtitulo={`${perfil.data?.curso ?? ''} · ${perfil.data?.periodo ?? ''} · ${semestre}`}
      />

      <main className="mx-auto max-w-2xl space-y-6 px-5 pt-5 pb-28 lg:pb-10">
        <section>
          <h2 className="mb-3 px-1 text-sm font-extrabold text-texto-suave">
            Matriculadas ({matriculadas.length})
          </h2>

          {matriculadas.length === 0 ? (
            <Cartao className="p-6 text-center">
              <p className="text-sm font-semibold text-texto-suave">
                Nenhuma ainda. Escolha abaixo as do seu período.
              </p>
            </Cartao>
          ) : (
            <div className="space-y-3">
              {matriculadas.map(({ disciplina, personalizada }) => (
                <Cartao key={disciplina.id} corMateria={disciplina.cor} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-texto">{disciplina.nome}</h3>
                      <p className="mt-0.5 text-xs font-semibold text-texto-suave">
                        {formatarHoras(disciplina.cargaHorariaTotal)} no semestre
                        {personalizada && (
                          <span className="ml-2 rounded-pill bg-acento-suave px-2 py-0.5 text-[0.6875rem] font-bold text-acento">
                            só sua
                          </span>
                        )}
                      </p>
                    </div>

                    <button
                      type="button"
                      aria-label={`Remover ${disciplina.nome}`}
                      onClick={() => {
                        desmatricular.mutate(disciplina.id)
                      }}
                      className="grid size-9 shrink-0 place-items-center rounded-pill text-texto-fraco transition-colors hover:bg-vermelho-suave hover:text-vermelho"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  <GradeSemanalResumo
                    grade={disciplina.grade}
                    cor={disciplina.cor}
                    className="mt-3"
                  />
                </Cartao>
              ))}
            </div>
          )}
        </section>

        {disponiveis.length > 0 && (
          <section>
            <h2 className="mb-1 px-1 text-sm font-extrabold text-texto-suave">
              Do catálogo do seu período
            </h2>
            <p className="mb-3 px-1 text-xs font-semibold text-texto-fraco">
              Carga horária e grade já vêm preenchidas pela coordenação.
            </p>

            <div className="space-y-2">
              {disponiveis.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    matricular.mutate({ disciplinaId: d.id, grupoId: null })
                  }}
                  disabled={matricular.isPending}
                  className="flex w-full items-center gap-3 rounded-card border-2 border-borda bg-superficie p-4 text-left transition-colors hover:border-acento disabled:opacity-50"
                >
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: d.cor }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-texto">{d.nome}</span>
                    <span className="block text-xs font-semibold text-texto-fraco">
                      {formatarHoras(d.cargaHorariaTotal)} ·{' '}
                      {d.grade.length === 1 ? '1 dia' : `${String(d.grade.length)} dias`} por
                      semana
                    </span>
                  </span>
                  <Plus className="size-5 shrink-0 text-acento" />
                </button>
              ))}
            </div>
          </section>
        )}

        {disponiveis.length === 0 && catalogo.isSuccess && matriculadas.length > 0 && (
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-texto-fraco">
            <Check className="size-4" />
            Você já está em todas as disciplinas do seu período.
          </p>
        )}

        <section>
          {criando ? (
            <Cartao className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-extrabold text-texto">Disciplina pessoal</h2>
                <button
                  type="button"
                  aria-label="Cancelar"
                  onClick={() => {
                    setCriando(false)
                  }}
                  className="grid size-9 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
                >
                  <X className="size-4" />
                </button>
              </div>
              <FormularioPersonalizada
                usuarioId={usuarioId}
                curso={perfil.data?.curso ?? 'Pessoal'}
                periodo={perfil.data?.periodo ?? '—'}
                semestre={semestre}
                aoConcluir={() => {
                  setCriando(false)
                }}
              />
            </Cartao>
          ) : (
            <Botao
              variante="secundario"
              larguraTotal
              iconeInicio={<Plus className="size-4" />}
              onClick={() => {
                setCriando(true)
              }}
            >
              Criar disciplina pessoal
            </Botao>
          )}
          <p className="mt-2 px-1 text-center text-xs font-semibold text-texto-fraco">
            Para optativas ou cursos fora da lista oficial. Só você a enxerga.
          </p>
        </section>
      </main>
    </>
  )
}
