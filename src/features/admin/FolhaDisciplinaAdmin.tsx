import { Loader2, X } from 'lucide-react'
import { useState } from 'react'

import { EditorDeGrade, type AulaEditavel } from '@/components/EditorDeGrade.tsx'
import { AplicarEmLote, EditorDeRegra, type RegraEditavel } from '@/components/EditorDeRegra.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { CORES_MATERIA } from '@/data/cores.ts'
import type { LinhaDisciplinaComGrade } from '@/data/mapeadores.ts'
import {
  useAplicarRegraEmLote,
  useSalvarDisciplinaAdmin,
  useTodasDisciplinas,
} from '@/data/queries.ts'
import { semestreAtual } from '@/domain/data.ts'
import { formatarHoraMinuto, formatarHoras } from '@/domain/risco.ts'
import { LIMITES_PADRAO, type DiaSemana } from '@/domain/tipos.ts'
import { useUsuarioId } from '@/features/auth/contexto.ts'
import { cn } from '@/lib/cn.ts'

/** §2 — criar/editar disciplina do catálogo, com carga horária e grade. */
export function FolhaDisciplinaAdmin({
  linha,
  aoFechar,
}: {
  linha: LinhaDisciplinaComGrade | null
  aoFechar: () => void
}) {
  const salvar = useSalvarDisciplinaAdmin()
  const todas = useTodasDisciplinas()
  const emLote = useAplicarRegraEmLote(useUsuarioId())

  const [nome, setNome] = useState(linha?.nome ?? '')
  const [codigo, setCodigo] = useState(linha?.codigo ?? '')
  const [curso, setCurso] = useState(linha?.curso ?? '')
  const [periodo, setPeriodo] = useState(linha?.periodo ?? '')
  const [turma, setTurma] = useState(linha?.turma ?? '')
  const [semestre, setSemestre] = useState(linha?.semestre ?? semestreAtual())
  const [carga, setCarga] = useState(String(linha?.carga_horaria_total ?? 60))
  const [cor, setCor] = useState(linha?.cor ?? CORES_MATERIA[0])
  const [erro, setErro] = useState<string | null>(null)
  const [regra, setRegra] = useState<RegraEditavel>({
    limiteReprovacao: linha?.limite_reprovacao ?? null,
  })
  const [aplicadas, setAplicadas] = useState<number | null>(null)

  // O horário não entra em cálculo nenhum de falta — serve para a exportação
  // ao calendário do celular marcar a aula na hora certa em vez de chutar.
  const [grade, setGrade] = useState<readonly AulaEditavel[]>(() =>
    (linha?.disciplina_grade ?? []).map((g) => ({
      dia: g.dia_semana as DiaSemana,
      horas: g.horas,
      // O banco devolve 'HH:MM:SS'; o input[type=time] quer 'HH:MM'.
      horaInicio: g.hora_inicio === null ? null : g.hora_inicio.slice(0, 5),
    })),
  )

  /*
   * O alcance do lote, recontado enquanto se digita curso/período/semestre:
   * é a promessa que o botão faz, e ela muda a cada tecla desses três campos.
   */
  const irmas = (todas.data ?? []).filter(
    (d) =>
      d.id !== linha?.id &&
      d.curso === curso.trim() &&
      d.periodo === periodo.trim() &&
      d.semestre === semestre.trim(),
  ).length

  const cargaNumero = Number(carga)
  const horasPorSemana = grade.reduce((s, g) => s + g.horas, 0)
  const valido =
    nome.trim() !== '' && curso.trim() !== '' && periodo.trim() !== '' && cargaNumero > 0

  async function enviar() {
    setErro(null)
    try {
      await salvar.mutateAsync({
        ...(linha !== null ? { id: linha.id } : {}),
        nome: nome.trim(),
        codigo: codigo.trim() === '' ? null : codigo.trim(),
        curso: curso.trim(),
        periodo: periodo.trim(),
        turma: turma.trim() === '' ? null : turma.trim(),
        semestre: semestre.trim(),
        cargaHorariaTotal: cargaNumero,
        cor,
        grade: grade.map((g) => ({ ...g, horaInicio: g.horaInicio ?? null })),
        regra: { limite_reprovacao: regra.limiteReprovacao },
      })
      aoFechar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={aoFechar}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void enviar()
        }}
        className="area-segura-base relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-card bg-superficie p-6 shadow-flutuante sm:rounded-card"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-texto">
            {linha === null ? 'Nova disciplina' : 'Editar disciplina'}
          </h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="grid size-9 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3.5">
          <Campo id="a-nome" rotulo="Nome" valor={nome} aoMudar={setNome} />

          <div className="grid grid-cols-2 gap-3">
            <Campo id="a-codigo" rotulo="Código" valor={codigo} aoMudar={setCodigo} />
            <Campo id="a-semestre" rotulo="Semestre" valor={semestre} aoMudar={setSemestre} />
          </div>

          <Campo id="a-curso" rotulo="Curso" valor={curso} aoMudar={setCurso} />

          <div className="grid grid-cols-2 gap-3">
            <Campo id="a-periodo" rotulo="Período" valor={periodo} aoMudar={setPeriodo} />
            <Campo id="a-turma" rotulo="Turma" valor={turma} aoMudar={setTurma} />
          </div>

          <Campo
            id="a-carga"
            rotulo="Carga horária total"
            valor={carga}
            aoMudar={setCarga}
            tipo="number"
          />

          <fieldset>
            <legend className="mb-1.5 text-sm font-extrabold text-texto">Grade semanal</legend>
            <p className="mb-2.5 text-xs font-semibold text-texto-fraco">
              Toque nos dias e informe quanto dura a aula. É daqui que sai o desconto
              automático da falta — e o horário de início alimenta a exportação para o
              calendário do celular.
            </p>
            <EditorDeGrade valor={grade} aoMudar={setGrade} comHorario />

            {horasPorSemana > 0 && cargaNumero > 0 && (
              <p className="mt-2 text-xs font-semibold text-texto-suave">
                {formatarHoraMinuto(horasPorSemana)} por semana ·{' '}
                {Math.round(cargaNumero / horasPorSemana)} semanas ·{' '}
                <span className="text-vermelho">
                  {formatarHoras(cargaNumero * 0.25)} até reprovar
                </span>
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-extrabold text-texto">Cor</legend>
            <div className="flex gap-2">
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
                    'size-9 rounded-pill',
                    cor === c &&
                      'ring-2 ring-texto ring-offset-2 ring-offset-[var(--c-superficie)]',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </fieldset>

          <EditorDeRegra
          className="mt-5 border-t border-borda pt-5"
          valor={regra}
          aoMudar={setRegra}
          herdado={{
            limite: LIMITES_PADRAO.limiteReprovacao,
            origem: 'que vem da turma de quem cursa, ou do ajuste pessoal dela',
          }}
        />

        <AplicarEmLote
          quantidade={irmas}
          descricaoDoEscopo={`em ${curso.trim() === '' ? 'todo o' : curso.trim()} · ${periodo.trim() === '' ? 'período' : periodo.trim()} · ${semestre.trim()}`}
          atalhoDeNivel="Vale para quem já está matriculado também — a regra é lida na hora de calcular."
          aplicando={emLote.isPending}
          aplicadas={aplicadas}
          aoAplicar={() => {
            emLote.mutate(
              {
                regra: { limite_reprovacao: regra.limiteReprovacao },
                escopo: {
                  tipo: 'catalogo',
                  curso: curso.trim(),
                  periodo: periodo.trim(),
                  semestre: semestre.trim(),
                },
                ...(linha === null ? {} : { exceto: linha.id }),
              },
              { onSuccess: setAplicadas },
            )
          }}
        />

        {erro !== null && (
            <p
              role="alert"
              className="rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
            >
              {erro}
            </p>
          )}

          <Botao type="submit" larguraTotal tamanho="lg" disabled={!valido || salvar.isPending}>
            {salvar.isPending && <Loader2 className="size-5 animate-spin" />}
            Salvar
          </Botao>
        </div>
      </form>
    </div>
  )
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  tipo = 'text',
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  tipo?: 'text' | 'number'
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-extrabold text-texto">
        {rotulo}
      </label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => {
          aoMudar(e.target.value)
        }}
        className="h-12 w-full rounded-controle border-2 border-borda bg-superficie-2 px-4 font-semibold text-texto outline-none focus:border-acento"
      />
    </div>
  )
}
