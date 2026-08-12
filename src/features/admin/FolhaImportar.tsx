import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { useMemo, useState } from 'react'

import { GradeSemanalResumo } from '@/components/GradeSemanalResumo.tsx'
import { Botao } from '@/components/ui/Botao.tsx'
import { CORES_MATERIA } from '@/data/cores.ts'
import { useSalvarDisciplinaAdmin } from '@/data/queries.ts'
import { semestreAtual } from '@/domain/data.ts'
import { importarCatalogo, MODELO_CSV } from '@/domain/importacao.ts'
import { formatarHoras } from '@/domain/risco.ts'

/**
 * §7.6 — "Importar grade horária: cadastrar todas as disciplinas de uma vez."
 *
 * O fluxo tem pré-visualização obrigatória. Importação em massa sem preview é
 * como se cria um catálogo com 40 disciplinas duplicadas e uma carga horária
 * errada que ninguém percebe até alguém reprovar.
 */
export function FolhaImportar({ aoFechar }: { aoFechar: () => void }) {
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const salvar = useSalvarDisciplinaAdmin()

  const resultado = useMemo(
    () => (texto.trim() === '' ? null : importarCatalogo(texto)),
    [texto],
  )

  async function importar() {
    if (resultado === null) return
    setEnviando(true)
    setErroGeral(null)
    setProgresso(0)

    try {
      for (const [i, linha] of resultado.linhas.entries()) {
        await salvar.mutateAsync({
          nome: linha.nome,
          codigo: linha.codigo,
          curso: linha.curso,
          periodo: linha.periodo,
          turma: linha.turma,
          semestre: semestreAtual(),
          cargaHorariaTotal: linha.cargaHorariaTotal,
          cor: CORES_MATERIA[i % CORES_MATERIA.length] ?? CORES_MATERIA[0],
          // O formato de importação não carrega horário — quem importa uma
          // grade em massa está trazendo dia e carga. O admin preenche depois,
          // e a exportação usa o horário padrão enquanto isso.
          grade: linha.grade.map((g) => ({ ...g, horaInicio: null })),
        })
        setProgresso(i + 1)
      }
      aoFechar()
    } catch (e) {
      setErroGeral(
        `${e instanceof Error ? e.message : 'Erro'} — ${String(progresso)} disciplinas já foram criadas.`,
      )
    } finally {
      setEnviando(false)
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

      <div className="area-segura-base relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-card bg-superficie p-6 shadow-flutuante sm:rounded-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-texto">Importar grade</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="grid size-9 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
          >
            <X className="size-4" />
          </button>
        </div>

        <p className="text-sm font-semibold text-texto-suave">
          Cole a planilha ou o CSV. Aceita vírgula, ponto e vírgula ou colagem direta do
          Excel/Sheets.
        </p>

        <button
          type="button"
          onClick={() => {
            setTexto(MODELO_CSV)
          }}
          className="mt-2 text-xs font-bold text-acento underline"
        >
          preencher com um exemplo
        </button>

        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
          }}
          rows={7}
          spellCheck={false}
          placeholder="nome,curso,periodo,carga,seg,ter,qua,qui,sex"
          className="mt-3 w-full rounded-controle border-2 border-borda bg-superficie-2 p-3 font-mono text-xs text-texto outline-none placeholder:text-texto-fraco focus:border-acento"
        />

        {resultado !== null && (
          <div className="mt-4 space-y-3">
            {resultado.erros.length > 0 && (
              <div className="rounded-interno bg-vermelho-suave p-3">
                <p className="flex items-center gap-2 text-sm font-extrabold text-vermelho">
                  <AlertTriangle className="size-4" />
                  {resultado.erros.length}{' '}
                  {resultado.erros.length === 1 ? 'linha com problema' : 'linhas com problema'}
                </p>
                <ul className="mt-2 space-y-1">
                  {resultado.erros.map((e) => (
                    <li key={e.linha} className="text-xs font-semibold text-vermelho">
                      Linha {e.linha}: {e.motivo}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs font-semibold text-vermelho">
                  As demais podem ser importadas normalmente.
                </p>
              </div>
            )}

            {resultado.linhas.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-extrabold text-verde">
                  <Check className="size-4" />
                  {resultado.linhas.length} prontas para importar
                </p>
                <ul className="max-h-52 space-y-2 overflow-y-auto">
                  {resultado.linhas.map((l, i) => (
                    <li key={l.linha} className="rounded-interno bg-superficie-2 p-3">
                      <p className="text-sm font-bold text-texto">{l.nome}</p>
                      <p className="text-xs font-semibold text-texto-suave">
                        {l.curso} · {l.periodo}
                        {l.turma !== null && ` · turma ${l.turma}`} ·{' '}
                        {formatarHoras(l.cargaHorariaTotal)}
                      </p>
                      <GradeSemanalResumo
                        grade={l.grade}
                        cor={CORES_MATERIA[i % CORES_MATERIA.length]}
                        className="mt-2"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {erroGeral !== null && (
          <p
            role="alert"
            className="mt-3 rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
          >
            {erroGeral}
          </p>
        )}

        <Botao
          className="mt-5"
          larguraTotal
          tamanho="lg"
          onClick={() => void importar()}
          disabled={enviando || resultado === null || resultado.linhas.length === 0}
        >
          {enviando && <Loader2 className="size-5 animate-spin" />}
          {enviando
            ? `Importando ${String(progresso)} de ${String(resultado?.linhas.length ?? 0)}…`
            : `Importar ${String(resultado?.linhas.length ?? 0)}`}
        </Botao>
      </div>
    </div>
  )
}
