import { CalendarRange, Loader2 } from 'lucide-react'
import { useState } from 'react'

import { Botao } from '@/components/ui/Botao.tsx'
import { Cartao } from '@/components/ui/Cartao.tsx'
import { useVirarSemestre } from '@/data/comunidades.ts'
import { formatarBR, proximoSemestre, semestreAtual } from '@/domain/data.ts'
import type { LinhaGrupo } from '@/types/database.ts'

/**
 * O período letivo, onde ele é coletivo.
 *
 * O rótulo saía do calendário: até junho é ".1", depois ".2". Isso erra para
 * quem cursa um período que começa em fevereiro e acaba em dezembro, e deixava
 * cada membro da mesma turma virar o semestre num dia diferente — com metade
 * da turma zerada e metade não, o ranking compara coisas diferentes.
 *
 * Virar aqui **não apaga nada de ninguém**: marca a data e avisa. Cada pessoa
 * arquiva o seu em Relatórios, com os próprios dados na mão. Um botão que
 * apagasse o semestre de 40 pessoas não deveria caber na mão de um colega.
 */
export function SemestreDaTurma({
  grupo,
  podeEditar,
  usuarioId,
}: {
  grupo: LinhaGrupo
  podeEditar: boolean
  usuarioId: string
}) {
  const virar = useVirarSemestre(usuarioId)
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [avisados, setAvisados] = useState<number | null>(null)

  const [semestre, setSemestre] = useState(
    grupo.semestre ?? semestreAtual(),
  )
  const [fim, setFim] = useState(grupo.fim_do_semestre ?? '')

  if (grupo.semestre === null && !podeEditar) return null

  function abrir() {
    // A sugestão é o PRÓXIMO, não o atual: quem abre este formulário está
    // virando a página. Quem só quer corrigir a data apaga e digita.
    setSemestre(grupo.semestre === null ? semestreAtual() : proximoSemestre(grupo.semestre))
    setFim(grupo.fim_do_semestre ?? '')
    setErro(null)
    setAvisados(null)
    setEditando(true)
  }

  function enviar() {
    setErro(null)
    virar.mutate(
      { grupoId: grupo.id, semestre: semestre.trim(), fim: fim === '' ? null : fim },
      {
        onSuccess: (quantos) => {
          setAvisados(quantos)
          setEditando(false)
        },
        onError: (e: Error) => {
          setErro(e.message)
        },
      },
    )
  }

  return (
    <Cartao className="p-5">
      <h2 className="flex items-center gap-2 font-extrabold text-texto">
        <CalendarRange className="size-5 text-texto-suave" />
        Período letivo
      </h2>

      {!editando && (
        <>
          <p className="mt-1.5 text-sm font-semibold text-texto-suave">
            {grupo.semestre === null ? (
              'A turma ainda não disse qual é o semestre. Sem isso, cada um segue o calendário.'
            ) : (
              <>
                A turma está em{' '}
                <strong className="font-extrabold text-texto">{grupo.semestre}</strong>
                {grupo.fim_do_semestre !== null && (
                  <> · termina em {formatarBR(grupo.fim_do_semestre)}</>
                )}
                .
              </>
            )}
          </p>
          {avisados !== null && (
            <p role="status" className="mt-2 text-xs font-bold text-verde">
              {avisados === 0
                ? 'Semestre salvo.'
                : `Semestre salvo e ${String(avisados)} ${avisados === 1 ? 'membro avisado' : 'membros avisados'}.`}
            </p>
          )}
        </>
      )}

      {editando && (
        <div className="mt-4 space-y-3">
          <label htmlFor="s-rotulo" className="block">
            <span className="mb-1.5 block text-xs font-bold text-texto-suave">
              Semestre que começa agora
            </span>
            <input
              id="s-rotulo"
              value={semestre}
              onChange={(e) => {
                setSemestre(e.target.value)
              }}
              placeholder="2026.2"
              className="h-11 w-full rounded-controle border-2 border-borda bg-superficie-2 px-3 font-extrabold text-texto outline-none placeholder:font-semibold placeholder:text-texto-fraco focus:border-acento"
            />
          </label>

          <label htmlFor="s-fim" className="block">
            <span className="mb-1.5 block text-xs font-bold text-texto-suave">
              Último dia de aula (opcional)
            </span>
            <input
              id="s-fim"
              type="date"
              value={fim}
              onChange={(e) => {
                setFim(e.target.value)
              }}
              className="h-11 w-full rounded-controle border-2 border-borda bg-superficie-2 px-3 font-semibold text-texto outline-none focus:border-acento"
            />
          </label>

          <p className="text-xs font-semibold text-texto-fraco">
            Os membros recebem um aviso para arquivar o semestre anterior. Nada é apagado por
            aqui — cada um arquiva o seu.
          </p>
        </div>
      )}

      {erro !== null && (
        <p
          role="alert"
          className="mt-3 rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
        >
          {erro}
        </p>
      )}

      {podeEditar && (
        <div className="mt-4 flex gap-2">
          {editando ? (
            <>
              <Botao tamanho="sm" onClick={enviar} disabled={virar.isPending}>
                {virar.isPending && <Loader2 className="size-4 animate-spin" />}
                Salvar e avisar a turma
              </Botao>
              <Botao
                tamanho="sm"
                variante="fantasma"
                onClick={() => {
                  setEditando(false)
                  setErro(null)
                }}
              >
                Cancelar
              </Botao>
            </>
          ) : (
            <Botao tamanho="sm" variante="secundario" onClick={abrir}>
              {grupo.semestre === null ? 'Definir o semestre' : 'Virar o semestre'}
            </Botao>
          )}
        </div>
      )}
    </Cartao>
  )
}
