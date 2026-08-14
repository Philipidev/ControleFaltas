import { BookOpen, Loader2, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { EditorDeGrade, type AulaEditavel } from '@/components/EditorDeGrade.tsx'
import { GradeSemanalResumo } from '@/components/GradeSemanalResumo.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { CORES_MATERIA } from '@/data/cores.ts'
import {
  useCriarDisciplinaDaTurma,
  useDisciplinasDaTurma,
  useRemoverDisciplinaDaTurma,
} from '@/data/queries.ts'
import { semestreAtual } from '@/domain/data.ts'
import { formatarHoras } from '@/domain/risco.ts'
import { cn } from '@/lib/cn.ts'
import type { LinhaGrupo } from '@/types/database.ts'

/**
 * As disciplinas que a turma responde por (0016).
 *
 * A §2 supunha uma coordenação mantendo o catálogo oficial e alunos escolhendo
 * dele. Quem instala este app é um estudante que criou a própria turma — e
 * descobria que não podia cadastrar as matérias dela, porque escrever no
 * catálogo pedia `profiles.role = 'admin'`, que é o papel de quem administra o
 * APP, não a comunidade. A saída era se promover a admin de tudo para cadastrar
 * três matérias.
 *
 * Aqui a chave é `grupo_membros.papel`: quem administra a comunidade cadastra,
 * e todo membro ativo enxerga e se matricula. Segue o mesmo desenho de
 * `RegraDaComunidade` — quem administra define, todo mundo lê.
 *
 * Curso, período, turma e semestre NÃO são perguntados: vêm da comunidade. São
 * eles que fazem a disciplina casar com o perfil de quem cursa, e digitá-los de
 * novo aqui seria convidar a divergência que faz o catálogo sumir da tela.
 */
export function DisciplinasDaTurma({
  grupo,
  podeEditar,
  usuarioId,
}: {
  grupo: LinhaGrupo
  podeEditar: boolean
  usuarioId: string
}) {
  const disciplinas = useDisciplinasDaTurma(grupo.id)
  const criar = useCriarDisciplinaDaTurma(usuarioId)
  const remover = useRemoverDisciplinaDaTurma(usuarioId)

  const [criando, setCriando] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const lista = disciplinas.data ?? []

  // Sem curso e período a comunidade não casa com perfil nenhum, e a
  // disciplina nasceria invisível na tela de quem cursa. Dizer isso antes é
  // melhor do que deixar cadastrar e não aparecer.
  const faltaIdentificar = grupo.curso === null || grupo.periodo === null

  if (!podeEditar && lista.length === 0) return null

  return (
    <Cartao className="p-5">
      <h2 className="flex items-center gap-2 font-extrabold text-texto">
        <BookOpen className="size-5 text-texto-suave" />
        Disciplinas da turma
      </h2>
      <p className="mt-1.5 text-xs font-semibold text-texto-suave">
        {podeEditar
          ? 'Quem administra cadastra; todo mundo da turma se matricula em Minhas disciplinas.'
          : 'Cadastradas por quem administra. Matricule-se em Minhas disciplinas.'}
      </p>

      {lista.length > 0 && (
        <div className="mt-4 space-y-3">
          {lista.map((d) => (
            <div key={d.id} className="rounded-interno bg-superficie-2 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-bold text-texto">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: d.cor }}
                    />
                    <span className="truncate">{d.nome}</span>
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-texto-fraco">
                    {formatarHoras(d.cargaHorariaTotal)} no semestre
                  </p>
                </div>

                {podeEditar && (
                  <button
                    type="button"
                    aria-label={`Apagar ${d.nome}`}
                    onClick={() => {
                      setErro(null)
                      setConfirmando(d.id)
                    }}
                    className="grid size-9 shrink-0 place-items-center rounded-pill text-texto-fraco transition-colors hover:bg-vermelho-suave hover:text-vermelho"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>

              <GradeSemanalResumo grade={d.grade} cor={d.cor} className="mt-2.5" />

              {/*
                Apagar a disciplina da turma alcança as matrículas e as FALTAS
                de quem já se matriculou, por cascade. É destrutivo para outras
                pessoas, então não pode ser um toque só.
              */}
              {confirmando === d.id && (
                <div className="mt-3 rounded-interno bg-vermelho-suave p-3">
                  <p className="text-xs font-bold text-vermelho">
                    Apagar {d.nome} apaga também as faltas que os membros já registraram
                    nela. Não dá para desfazer.
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Botao
                      tamanho="sm"
                      variante="secundario"
                      disabled={remover.isPending}
                      onClick={() => {
                        setErro(null)
                        remover.mutate(
                          { grupoId: grupo.id, disciplinaId: d.id },
                          {
                            onSuccess: () => {
                              setConfirmando(null)
                            },
                            onError: (e: Error) => {
                              setErro(e.message)
                            },
                          },
                        )
                      }}
                    >
                      Apagar mesmo assim
                    </Botao>
                    <Botao
                      tamanho="sm"
                      variante="fantasma"
                      onClick={() => {
                        setConfirmando(null)
                      }}
                    >
                      Cancelar
                    </Botao>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {podeEditar && faltaIdentificar && (
        <p className="mt-4 rounded-interno bg-amarelo-suave px-3 py-2.5 text-xs font-bold text-amarelo">
          Esta comunidade ainda não diz de qual curso e período ela é. Sem isso, as disciplinas
          cadastradas aqui não casam com o perfil de ninguém e não aparecem para os membros.
          Preencha curso e período na edição da comunidade primeiro.
        </p>
      )}

      {podeEditar &&
        !faltaIdentificar &&
        (criando ? (
          <div className="mt-4 border-t border-borda pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-extrabold text-texto">Nova disciplina</h3>
              <button
                type="button"
                aria-label="Cancelar"
                onClick={() => {
                  setCriando(false)
                  setErro(null)
                }}
                className="grid size-9 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
              >
                <X className="size-4" />
              </button>
            </div>
            <Formulario
              grupo={grupo}
              enviando={criar.isPending}
              aoEnviar={(nova) => {
                setErro(null)
                criar.mutate(
                  { grupoId: grupo.id, ...nova },
                  {
                    onSuccess: () => {
                      setCriando(false)
                    },
                    onError: (e: Error) => {
                      setErro(e.message)
                    },
                  },
                )
              }}
            />
          </div>
        ) : (
          <Botao
            variante="secundario"
            larguraTotal
            className="mt-4"
            iconeInicio={<Plus className="size-4" />}
            onClick={() => {
              setCriando(true)
            }}
          >
            Adicionar disciplina
          </Botao>
        ))}

      {erro !== null && (
        <p
          role="alert"
          className="mt-3 rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
        >
          {erro}
        </p>
      )}
    </Cartao>
  )
}

interface NovaDisciplina {
  nome: string
  cargaHorariaTotal: number
  cor: string
  curso: string
  periodo: string
  turma: string | null
  semestre: string
  grade: { dia: number; horas: number }[]
}

function Formulario({
  grupo,
  enviando,
  aoEnviar,
}: {
  grupo: LinhaGrupo
  enviando: boolean
  aoEnviar: (nova: NovaDisciplina) => void
}) {
  const [nome, setNome] = useState('')
  const [carga, setCarga] = useState('60')
  const [cor, setCor] = useState<string>(CORES_MATERIA[0])
  const [grade, setGrade] = useState<readonly AulaEditavel[]>([])

  const cargaNumero = Number(carga)
  const horasPorSemana = grade.reduce((s, g) => s + g.horas, 0)
  const semanas = horasPorSemana > 0 ? Math.round(cargaNumero / horasPorSemana) : 0
  // O mesmo aviso do formulário de disciplina pessoal: um semestre letivo tem
  // ~19 semanas, e muito fora disso quase sempre é carga e grade em unidades
  // diferentes — hora-aula de 50min de um lado, hora de relógio do outro.
  const semanasEstranhas = semanas > 0 && (semanas < 10 || semanas > 30)
  const valido = nome.trim().length > 0 && cargaNumero > 0 && grade.length > 0

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        aoEnviar({
          nome: nome.trim(),
          cargaHorariaTotal: cargaNumero,
          cor,
          curso: grupo.curso ?? '',
          periodo: grupo.periodo ?? '',
          turma: grupo.turma,
          semestre: grupo.semestre ?? semestreAtual(),
          grade: grade.map((g) => ({ dia: g.dia, horas: g.horas })),
        })
      }}
    >
      <div>
        <label htmlFor="nome-turma-disc" className="mb-1.5 block text-sm font-extrabold text-texto">
          Nome
        </label>
        <input
          id="nome-turma-disc"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value)
          }}
          placeholder="Ex: Semiologia Médica"
          className="h-12 w-full rounded-controle border-2 border-borda bg-superficie-2 px-4 font-semibold text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
        />
      </div>

      <div>
        <label
          htmlFor="carga-turma-disc"
          className="mb-1.5 block text-sm font-extrabold text-texto"
        >
          Carga horária total do semestre
        </label>
        <input
          id="carga-turma-disc"
          type="number"
          min={1}
          step={1}
          value={carga}
          onChange={(e) => {
            setCarga(e.target.value)
          }}
          className="tabular h-12 w-full rounded-controle border-2 border-borda bg-superficie-2 px-4 font-semibold text-texto outline-none focus:border-acento"
        />
        <p className="mt-1.5 text-xs font-semibold text-texto-fraco">
          Copie do plano de ensino. É este número que vira o denominador dos 25%.
        </p>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-extrabold text-texto">
          Dias e horário das aulas
        </legend>
        <p className="mb-2.5 text-xs font-semibold text-texto-fraco">
          É daqui que sai o desconto automático: faltar num dia de 4h10 custa 4h10.
        </p>
        <EditorDeGrade valor={grade} aoMudar={setGrade} />
        {horasPorSemana > 0 && cargaNumero > 0 && (
          <p
            className={cn(
              'mt-1.5 text-xs font-semibold',
              semanasEstranhas ? 'text-vermelho' : 'text-texto-fraco',
            )}
          >
            {semanasEstranhas
              ? `Nessa conta, a disciplina levaria ${String(semanas)} semanas para cumprir a carga — um semestre tem umas 19. Confira a carga total e os dias.`
              : `Dá ${String(semanas)} semanas de aula para cumprir a carga.`}
          </p>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-extrabold text-texto">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {CORES_MATERIA.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={cor === c}
              onClick={() => {
                setCor(c)
              }}
              className={cn(
                'size-9 rounded-pill transition-transform',
                cor === c && 'ring-2 ring-texto ring-offset-2 ring-offset-[var(--c-superficie)]',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>

      <p className="rounded-interno bg-superficie-2 px-3 py-2.5 text-xs font-semibold text-texto-fraco">
        Entra como {grupo.curso ?? '—'} · {grupo.periodo ?? '—'}
        {grupo.turma !== null && ` · ${grupo.turma}`} · {grupo.semestre ?? semestreAtual()},
        que é o que esta comunidade declara.
      </p>

      <Botao type="submit" larguraTotal disabled={!valido || enviando}>
        {enviando && <Loader2 className="size-5 animate-spin" />}
        Cadastrar disciplina
      </Botao>
    </form>
  )
}
