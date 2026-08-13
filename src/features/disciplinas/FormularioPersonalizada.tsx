import { Loader2 } from 'lucide-react'
import { useState } from 'react'

import { EditorDeGrade, type AulaEditavel } from '@/components/EditorDeGrade.tsx'
import { AplicarEmLote, EditorDeRegra, type RegraEditavel } from '@/components/EditorDeRegra.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { CORES_MATERIA } from '@/data/cores.ts'
import {
  useAplicarRegraEmLote,
  useCriarDisciplinaPersonalizada,
  useMinhasDisciplinas,
} from '@/data/queries.ts'
import { useContextoDaRegra } from '@/data/regra.ts'
import { FRASE_NIVEL } from '@/domain/limites.ts'
import { cn } from '@/lib/cn.ts'

/**
 * §2, opção secundária — cadastro de disciplina "avulsa"/pessoal.
 *
 * Aqui o aluno PRECISA informar carga e grade, porque não existe dado oficial
 * para essa disciplina. É o oposto do fluxo do catálogo, e é por isso que a
 * spec trata isto como secundário: manter a grade correta é justamente o
 * trabalho que o catálogo do admin poupa.
 */
export function FormularioPersonalizada({
  usuarioId,
  curso,
  periodo,
  semestre,
  aoConcluir,
}: {
  usuarioId: string
  curso: string
  periodo: string
  semestre: string
  aoConcluir: () => void
}) {
  const criar = useCriarDisciplinaPersonalizada(usuarioId)
  const contexto = useContextoDaRegra(usuarioId)
  const minhas = useMinhasDisciplinas(usuarioId)
  const emLote = useAplicarRegraEmLote(usuarioId)

  const [nome, setNome] = useState('')
  const [regra, setRegra] = useState<RegraEditavel>({
    limiteReprovacao: null,
    justificadaConta: null,
  })
  const [aplicadas, setAplicadas] = useState<number | null>(null)
  const [carga, setCarga] = useState('60')
  const [cor, setCor] = useState<string>(CORES_MATERIA[0])
  const [grade, setGrade] = useState<readonly AulaEditavel[]>([])
  const [erro, setErro] = useState<string | null>(null)

  // O lote só alcança o que é seu: o catálogo pertence à turma, e o RLS
  // recusaria em silêncio.
  const matriculadas = minhas.data ?? []
  const outrasPessoais = matriculadas.filter((m) => m.personalizada)
  const temDoCatalogo = matriculadas.some((m) => !m.personalizada)

  const cargaNumero = Number(carga)
  const horasPorSemana = grade.reduce((s, g) => s + g.horas, 0)
  const semanas = horasPorSemana > 0 ? Math.round(cargaNumero / horasPorSemana) : 0
  // Um semestre letivo tem ~19 semanas. Muito fora disso quase sempre é
  // carga e grade em unidades diferentes — hora-aula de 50min num lado,
  // hora de relógio no outro —, e o erro só apareceria em novembro.
  const semanasEstranhas = semanas > 0 && (semanas < 10 || semanas > 30)
  const valido = nome.trim().length > 0 && cargaNumero > 0 && grade.length > 0

  async function enviar() {
    setErro(null)
    try {
      await criar.mutateAsync({
        nome: nome.trim(),
        cargaHorariaTotal: cargaNumero,
        cor,
        curso,
        periodo,
        semestre,
        grade: [...grade],
        regra: {
          limite_reprovacao: regra.limiteReprovacao,
          justificada_conta: regra.justificadaConta,
        },
      })
      aoConcluir()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui criar.')
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void enviar()
      }}
    >
      <div>
        <label htmlFor="nome-disc" className="mb-1.5 block text-sm font-extrabold text-texto">
          Nome
        </label>
        <input
          id="nome-disc"
          value={nome}
          onChange={(e) => {
            setNome(e.target.value)
          }}
          placeholder="Ex: Libras (optativa)"
          className="h-12 w-full rounded-controle border-2 border-borda bg-superficie-2 px-4 font-semibold text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
        />
      </div>

      <div>
        <label htmlFor="carga-disc" className="mb-1.5 block text-sm font-extrabold text-texto">
          Carga horária total do semestre
        </label>
        <input
          id="carga-disc"
          type="number"
          min={1}
          step={1}
          value={carga}
          onChange={(e) => {
            setCarga(e.target.value)
          }}
          className="tabular h-12 w-full rounded-controle border-2 border-borda bg-superficie-2 px-4 font-semibold text-texto outline-none focus:border-acento"
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-extrabold text-texto">Dias e horário das aulas</legend>
        <p className="mb-2.5 text-xs font-semibold text-texto-fraco">
          É daqui que sai o desconto automático: faltar num dia de 4h10 custa 4h10. Uma aula de
          50 minutos é 0h50; cinco delas seguidas, 4h10.
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
                'size-9 rounded-pill transition-transform',
                cor === c && 'ring-2 ring-texto ring-offset-2 ring-offset-[var(--c-superficie)]',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>

      <div>
        <EditorDeRegra
          valor={regra}
          aoMudar={setRegra}
          herdado={{
            limite: contexto.geral.limites.limiteReprovacao,
            justificadaConta: contexto.geral.regras.justificadaConta,
            origem: FRASE_NIVEL[contexto.geral.origem.limiteReprovacao],
          }}
        />

        <AplicarEmLote
          quantidade={outrasPessoais.length}
          descricaoDoEscopo="nas outras disciplinas que você criou"
          atalhoDeNivel={
            temDoCatalogo
              ? 'As do catálogo são da turma: a regra delas vem de lá, ou de Ajustes.'
              : 'Para valer em tudo, inclusive no que ainda vai criar, defina em Ajustes.'
          }
          aplicando={emLote.isPending}
          aplicadas={aplicadas}
          aoAplicar={() => {
            emLote.mutate(
              {
                regra: {
                  limite_reprovacao: regra.limiteReprovacao,
                  justificada_conta: regra.justificadaConta,
                },
                escopo: { tipo: 'minhas-pessoais' },
              },
              { onSuccess: setAplicadas },
            )
          }}
        />
      </div>

      {erro !== null && (
        <p
          role="alert"
          className="rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
        >
          {erro}
        </p>
      )}

      <Botao type="submit" larguraTotal disabled={!valido || criar.isPending}>
        {criar.isPending && <Loader2 className="size-5 animate-spin" />}
        Criar disciplina
      </Botao>
    </form>
  )
}
