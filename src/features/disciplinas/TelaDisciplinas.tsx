import { Check, Info, Plus, Trash2, Users, X } from 'lucide-react'
import { useState } from 'react'

import { FormularioPersonalizada } from './FormularioPersonalizada.tsx'
import { GradeSemanalResumo } from '@/components/GradeSemanalResumo.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useMinhasComunidades } from '@/data/comunidades.ts'
import {
  useCatalogo,
  useDesmatricular,
  useDisciplinasDaTurma,
  useMatricular,
  useMinhasDisciplinas,
  usePerfil,
  useVincularATurma,
} from '@/data/queries.ts'
import { candidatasDeTurma, turmaDoAluno } from '@/domain/comunidades.ts'
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

  const comunidades = useMinhasComunidades(usuarioId)
  const matricular = useMatricular(usuarioId)
  const desmatricular = useDesmatricular(usuarioId)
  const vincular = useVincularATurma(usuarioId)
  const [criando, setCriando] = useState(false)
  const [turmaEscolhida, setTurmaEscolhida] = useState<string | null>(null)

  /*
   * Qual turma responde pelas disciplinas desta pessoa.
   *
   * É o que preenche `matriculas.grupo_id`, que faz duas coisas: define o
   * escopo do ranking e diz de qual comunidade a disciplina herda a regra do
   * curso. Com mais de uma candidata o domínio se recusa a chutar, e aí a
   * escolha é oferecida — a errada colocaria a pessoa num ranking de
   * desconhecidos.
   *
   * Fica ACIMA dos early returns porque `useDisciplinasDaTurma` depende dele, e
   * hook não pode ficar depois de um `return`. Enquanto o perfil não chegou,
   * `candidatasDeTurma` devolve lista vazia e a query fica desligada.
   */
  const perfilAcademico = {
    curso: perfil.data?.curso ?? null,
    periodo: perfil.data?.periodo ?? null,
    turma: perfil.data?.turma ?? null,
  }
  const grupos = (comunidades.data ?? []).map((c) => c.grupo)
  const candidatas = candidatasDeTurma(grupos, perfilAcademico)
  const turmaId = turmaDoAluno(grupos, perfilAcademico) ?? turmaEscolhida
  const turma = candidatas.find((c) => c.id === turmaId) ?? null

  // 0016 — as que a própria turma cadastrou, além do catálogo oficial do app.
  const daTurma = useDisciplinasDaTurma(turmaId)

  if (minhas.error !== null) return <Erro erro={minhas.error} />
  if (minhas.isPending || perfil.isPending) return <Esqueleto />

  const matriculadas = minhas.data
  const idsMatriculados = new Set(matriculadas.map((m) => m.disciplina.id))
  const disponiveis = (catalogo.data ?? []).filter((d) => !idsMatriculados.has(d.id))
  const disponiveisDaTurma = (daTurma.data ?? []).filter((d) => !idsMatriculados.has(d.id))

  // Disciplina pessoal fica de fora: ela é só sua, e não entra no ranking.
  const semTurma = matriculadas.filter((m) => !m.personalizada && m.grupoId === null)

  return (
    <>
      <Cabecalho
        titulo="Minhas disciplinas"
        subtitulo={`${perfil.data?.curso ?? ''} · ${perfil.data?.periodo ?? ''} · ${semestre}`}
      />

      <main className="mx-auto max-w-2xl space-y-6 px-5 pt-5 pb-28 lg:pb-10">
        {candidatas.length > 0 && (
          <Cartao className="flex items-start gap-3 p-4">
            <Users className="mt-0.5 size-5 shrink-0 text-texto-suave" />
            <div className="min-w-0 flex-1">
              {turma === null ? (
                <>
                  <p className="text-sm font-extrabold text-texto">
                    De qual turma são estas disciplinas?
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-texto-suave">
                    Você está em mais de uma comunidade do seu período, e é a turma que define
                    com quem o ranking compara.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {candidatas.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setTurmaEscolhida(c.id)
                        }}
                        className="rounded-pill bg-superficie-2 px-3 py-1.5 text-xs font-extrabold text-texto-suave transition-colors hover:bg-acento-suave hover:text-acento"
                      >
                        {c.nome}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-texto-suave">
                    As disciplinas do catálogo entram vinculadas a{' '}
                    <strong className="font-extrabold text-texto">{turma.nome}</strong>.
                  </p>

                  {semTurma.length > 0 && (
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      className="mt-3"
                      disabled={vincular.isPending}
                      onClick={() => {
                        vincular.mutate(turma.id)
                      }}
                    >
                      Vincular as {semTurma.length} já matriculadas
                    </Botao>
                  )}
                </>
              )}
            </div>
          </Cartao>
        )}

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

        {/* 0016 — as que a própria turma cadastrou. Entram vinculadas a ela. */}
        {disponiveisDaTurma.length > 0 && turma !== null && (
          <section>
            <h2 className="mb-1 px-1 text-sm font-extrabold text-texto-suave">
              De {turma.nome}
            </h2>
            <p className="mb-3 px-1 text-xs font-semibold text-texto-fraco">
              Cadastradas por quem administra a turma. Entram vinculadas a ela e contam no
              ranking.
            </p>

            <div className="space-y-2">
              {disponiveisDaTurma.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    matricular.mutate({ disciplinaId: d.id, turmaId })
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
                    matricular.mutate({ disciplinaId: d.id, turmaId })
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

        {/*
          Duas situações davam a MESMA frase, e uma delas era mentira: sem
          catálogo cadastrado para o curso/período, `disponiveis` também é
          vazio, e a tela dizia "você já está em todas" para quem não estava em
          nenhuma. Quem usa o app sozinho, sem admin alimentando o catálogo, via
          isso como "não há mais nada a fazer aqui".
        */}
        {disponiveis.length === 0 &&
          disponiveisDaTurma.length === 0 &&
          catalogo.isSuccess &&
          matriculadas.length > 0 &&
          (catalogo.data.length === 0 ? (
            <p className="flex items-center justify-center gap-2 text-center text-sm font-semibold text-texto-fraco">
              <Info className="size-4 shrink-0" />
              {turma === null
                ? `Não há catálogo cadastrado para ${perfil.data?.curso ?? 'seu curso'} · ${perfil.data?.periodo ?? 'seu período'} · ${semestre}. Crie as suas abaixo.`
                : `Nada a mais para escolher. Quem administra ${turma.nome} pode cadastrar as disciplinas dela na tela da comunidade — ou crie as suas abaixo.`}
            </p>
          ) : (
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-texto-fraco">
              <Check className="size-4 shrink-0" />
              Você já está em todas as disciplinas do seu período.
            </p>
          ))}

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
