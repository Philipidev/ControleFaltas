import { cn } from '@/lib/cn.ts'

/**
 * O nível "disciplina" da regra do curso, num formulário.
 *
 * Os dois campos são anuláveis, e vazio não é "sem regra": é "herda". Por isso
 * o que está valendo hoje aparece como marca-d'água em vez de um zero — um
 * campo em branco num formulário de regra parece defeito, e a pessoa preenche
 * só para se tranquilizar, congelando um número que devia acompanhar a turma.
 */

export interface RegraEditavel {
  readonly limiteReprovacao: number | null
  readonly justificadaConta: boolean | null
}

export function EditorDeRegra({
  valor,
  aoMudar,
  herdado,
  className,
}: {
  valor: RegraEditavel
  aoMudar: (regra: RegraEditavel) => void
  /** O que vale enquanto esta disciplina não decide, e quem decidiu. */
  herdado: { readonly limite: number; readonly justificadaConta: boolean; readonly origem: string }
  className?: string
}) {
  const porcento = valor.limiteReprovacao === null ? '' : String(Math.round(valor.limiteReprovacao * 100))

  return (
    <fieldset className={className}>
      <legend className="text-sm font-extrabold text-texto">Regra desta disciplina</legend>
      <p className="mt-0.5 mb-3 text-xs font-semibold text-texto-fraco">
        Em branco, herda o que já vale: {Math.round(herdado.limite * 100)}% ({herdado.origem}).
        Preencha só se esta disciplina foge da regra geral.
      </p>

      <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-texto-suave">
          Reprova por falta acima de
        </span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={100}
            step={1}
            value={porcento}
            placeholder={String(Math.round(herdado.limite * 100))}
            onChange={(e) => {
              const v = e.target.value.trim()
              aoMudar({
                ...valor,
                limiteReprovacao: v === '' ? null : Math.min(Math.max(Number(v), 1), 100) / 100,
              })
            }}
            className="tabular h-11 w-24 rounded-controle border-2 border-borda bg-superficie-2 px-3 text-center font-extrabold text-texto outline-none placeholder:font-semibold placeholder:text-texto-fraco focus:border-acento"
          />
          <span className="text-sm font-bold text-texto-suave">% da carga horária</span>
        </span>
      </label>

      <div className="mt-3">
        <span className="mb-1.5 block text-xs font-bold text-texto-suave">
          Falta justificada desconta da carga
        </span>
        <div className="flex gap-2">
          {(
            [
              [null, 'Herdar'],
              [true, 'Desconta'],
              [false, 'Não desconta'],
            ] as const
          ).map(([opcao, rotulo]) => (
            <button
              key={rotulo}
              type="button"
              aria-pressed={valor.justificadaConta === opcao}
              onClick={() => {
                aoMudar({ ...valor, justificadaConta: opcao })
              }}
              className={cn(
                'flex-1 rounded-controle border-2 py-2 text-xs font-extrabold transition-colors',
                valor.justificadaConta === opcao
                  ? 'border-acento bg-acento-suave text-acento'
                  : 'border-borda text-texto-suave',
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>
    </fieldset>
  )
}

/**
 * O convite para não repetir a mesma regra N vezes.
 *
 * Diz QUAIS disciplinas serão alteradas, e não "todas": o RLS recusa em
 * silêncio o que não é de quem pede, e um botão que promete demais falha sem
 * avisar. Quando o lote cobriria tudo, o texto aponta o caminho mais curto —
 * subir um nível vale para sempre, inclusive para o que ainda nem existe.
 */
export function AplicarEmLote({
  quantidade,
  descricaoDoEscopo,
  atalhoDeNivel,
  aplicando,
  aplicadas,
  aoAplicar,
}: {
  quantidade: number
  descricaoDoEscopo: string
  atalhoDeNivel?: string | undefined
  aplicando: boolean
  aplicadas: number | null
  aoAplicar: () => void
}) {
  if (quantidade <= 0) return null

  return (
    <div className="mt-3 rounded-interno bg-superficie-2 p-3">
      <button
        type="button"
        disabled={aplicando}
        onClick={aoAplicar}
        className="text-left text-xs font-extrabold text-acento disabled:opacity-50"
      >
        Usar esta regra {descricaoDoEscopo} ({quantidade})
      </button>
      {atalhoDeNivel !== undefined && (
        <p className="mt-1 text-[0.6875rem] font-semibold text-texto-fraco">{atalhoDeNivel}</p>
      )}
      {aplicadas !== null && (
        <p role="status" className="mt-1 text-[0.6875rem] font-bold text-verde">
          {aplicadas === 1 ? '1 disciplina atualizada.' : `${String(aplicadas)} disciplinas atualizadas.`}
        </p>
      )}
    </div>
  )
}
