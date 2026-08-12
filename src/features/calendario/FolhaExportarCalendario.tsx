import { motion } from 'motion/react'
import { CalendarPlus, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'

import { Botao } from '@/components/ui/Botao.tsx'
import { fimProvavelDoSemestre, formatarBR, hojeISO } from '@/domain/data.ts'
import { gerarIcs, type AulaParaExportar, type PrazoParaExportar } from '@/domain/ics.ts'
import { NOME_DIA_CURTO, type Disciplina } from '@/domain/tipos.ts'
import { cn } from '@/lib/cn.ts'

/**
 * Testa se dá para compartilhar ESTE arquivo, e não só se `share` existe.
 *
 * Fora daqui porque o componente chama antes de montar o arquivo final, só
 * para decidir o rótulo do botão — prometer "Adicionar ao calendário" e cair
 * num download seria pior que dizer "Baixar" desde o começo.
 */
function podeCompartilhar(arquivo: File): boolean {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] })
}

/**
 * §7.6 — leva a grade para o calendário do celular.
 *
 * Não existe API web para escrever no calendário nativo; o .ics é a ponte. O
 * que muda a experiência é COMO ele chega lá: pela folha de compartilhamento
 * do sistema é um toque em "Calendário", enquanto o download obriga a achar o
 * arquivo depois. Por isso o compartilhamento é o caminho principal, e baixar
 * é o que sobra no desktop.
 *
 * O horário é perguntado porque a grade nem sempre sabe: `hora_inicio` é
 * nullable, e para disciplina sem horário a alternativa seria um evento de dia
 * inteiro (seis por dia, calendário inútil) ou um chute silencioso.
 */
export function FolhaExportarCalendario({
  disciplinas,
  prazos,
  aoFechar,
}: {
  disciplinas: readonly Disciplina[]
  prazos: readonly PrazoParaExportar[]
  aoFechar: () => void
}) {
  const hoje = hojeISO()
  const [escolhidas, setEscolhidas] = useState<ReadonlySet<string>>(
    () => new Set(disciplinas.map((d) => d.id)),
  )
  const [horaPadrao, setHoraPadrao] = useState('08:00')
  const [fim, setFim] = useState(() => fimProvavelDoSemestre(hoje))
  const [incluirPrazos, setIncluirPrazos] = useState(prazos.length > 0)

  const selecionadas = disciplinas.filter((d) => escolhidas.has(d.id))
  const aulas: AulaParaExportar[] = selecionadas.flatMap((d) =>
    d.grade.map((a) => ({
      disciplinaId: d.id,
      disciplina: d.nome,
      dia: a.dia,
      horas: a.horas,
      horaInicio: a.horaInicio ?? null,
    })),
  )
  const semHorario = aulas.filter((a) => a.horaInicio === null).length

  // Sondado com um arquivo mínimo do mesmo tipo, uma vez: o rótulo do botão
  // precisa saber o destino antes do toque, e `canShare` não olha o conteúdo.
  const [compartilha] = useState(() =>
    podeCompartilhar(new File([''], 'a.ics', { type: 'text/calendar' })),
  )

  const [erro, setErro] = useState<string | null>(null)

  function montarArquivo(): File {
    const ics = gerarIcs({
      aulas,
      prazos: incluirPrazos ? prazos : [],
      inicio: hoje,
      fim,
      horaPadrao,
    })
    // O type importa: com text/plain o celular abre como texto em vez de
    // oferecer o calendário.
    return new File([ics], 'minhas-aulas.ics', { type: 'text/calendar' })
  }

  function baixar(arquivo: File) {
    const url = URL.createObjectURL(arquivo)
    const a = document.createElement('a')
    a.href = url
    a.download = arquivo.name
    a.click()
    // Sem o revoke o blob fica na memória da aba até recarregar.
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 1000)
  }

  /**
   * Um toque para adicionar, quando o aparelho deixa.
   *
   * Não existe API web para escrever no calendário nativo — mas a folha de
   * compartilhamento do sistema traz "Calendário" como destino, e aí o
   * caminho é tocar uma vez. É bem melhor que baixar um arquivo e caçá-lo no
   * gerenciador de arquivos depois, que é no que o download dá no celular.
   *
   * `canShare` com o arquivo de verdade, e não só `'share' in navigator`: dá
   * para compartilhar texto sem poder compartilhar arquivo, e nesse caso a
   * chamada falharia depois do toque, já com a folha aberta.
   */
  async function adicionar() {
    setErro(null)
    const arquivo = montarArquivo()

    if (podeCompartilhar(arquivo)) {
      try {
        await navigator.share({ files: [arquivo], title: 'Minhas aulas' })
        aoFechar()
        return
      } catch (e) {
        // Fechar a folha de compartilhamento não é erro — é desistir.
        if (e instanceof DOMException && e.name === 'AbortError') return
        // Qualquer outra falha cai no download, que funciona em todo lugar.
      }
    }

    try {
      baixar(arquivo)
      aoFechar()
    } catch {
      setErro('Não consegui gerar o arquivo. Tente por outro navegador.')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={aoFechar}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        role="dialog"
        aria-label="Adicionar ao calendário do celular"
        className="area-segura-base relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-card bg-superficie p-6 shadow-flutuante sm:rounded-card"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-texto">Adicionar ao calendário</h2>
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
          Gera um arquivo que o calendário do seu celular entende. Suas aulas entram como evento
          semanal, até o fim do semestre.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <span className="mb-2 block text-sm font-extrabold text-texto">Disciplinas</span>
            <div className="space-y-2">
              {disciplinas.map((d) => {
                const marcada = escolhidas.has(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() => {
                      const nova = new Set(escolhidas)
                      if (marcada) nova.delete(d.id)
                      else nova.add(d.id)
                      setEscolhidas(nova)
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-controle border-2 px-3.5 py-2.5 text-left transition-colors',
                      marcada ? 'border-acento bg-acento-suave' : 'border-borda',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: d.cor }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-texto">
                      {d.nome}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-texto-fraco">
                      {d.grade.map((a) => NOME_DIA_CURTO[a.dia]).join(' · ')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-sm font-extrabold text-texto">
                Horário padrão
              </span>
              <input
                type="time"
                value={horaPadrao}
                onChange={(e) => {
                  setHoraPadrao(e.target.value)
                }}
                className="h-12 w-full rounded-controle border-2 border-borda bg-superficie-2 px-3 font-semibold text-texto outline-none focus:border-acento"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-extrabold text-texto">
                Até
              </span>
              <input
                type="date"
                value={fim}
                min={hoje}
                onChange={(e) => {
                  setFim(e.target.value)
                }}
                className="h-12 w-full rounded-controle border-2 border-borda bg-superficie-2 px-3 font-semibold text-texto outline-none focus:border-acento"
              />
            </label>
          </div>

          {semHorario > 0 && (
            <p className="rounded-interno bg-superficie-2 px-3 py-2.5 text-xs font-semibold text-texto-suave">
              {semHorario === aulas.length
                ? 'Nenhuma aula tem horário cadastrado, então todas usam o horário padrão.'
                : `${String(semHorario)} de ${String(aulas.length)} aulas não têm horário cadastrado e vão usar o padrão.`}{' '}
              Quem administra o catálogo pode definir o horário de cada dia.
            </p>
          )}

          {prazos.length > 0 && (
            <button
              type="button"
              aria-pressed={incluirPrazos}
              onClick={() => {
                setIncluirPrazos(!incluirPrazos)
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-controle border-2 px-3.5 py-3 text-left transition-colors',
                incluirPrazos ? 'border-acento bg-acento-suave' : 'border-borda',
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-texto">
                  Incluir prazos de atestado
                </span>
                <span className="block text-xs font-semibold text-texto-suave">
                  {prazos.length === 1
                    ? '1 falta ainda dentro dos 7 dias'
                    : `${String(prazos.length)} faltas ainda dentro dos 7 dias`}
                </span>
              </span>
            </button>
          )}
        </div>

        {erro !== null && (
          <p
            role="alert"
            className="mt-4 rounded-interno bg-vermelho-suave px-3 py-2.5 text-sm font-bold text-vermelho"
          >
            {erro}
          </p>
        )}

        <Botao
          className="mt-5"
          larguraTotal
          iconeInicio={<CalendarPlus className="size-4" />}
          disabled={aulas.length === 0}
          onClick={() => {
            void adicionar()
          }}
        >
          {aulas.length === 0 ? 'Escolha ao menos uma disciplina' : 'Adicionar ao calendário'}
        </Botao>

        <p className="mt-2 text-center text-xs font-semibold text-texto-fraco">
          {compartilha
            ? 'Escolha “Calendário” na tela que abrir.'
            : 'Baixa um arquivo .ics — abra-o para o calendário importar.'}{' '}
          {aulas.length} {aulas.length === 1 ? 'aula' : 'aulas'}, toda semana até{' '}
          {formatarBR(fim)}. Importar de novo depois atualiza os mesmos eventos, não duplica.
        </p>
      </motion.div>
    </div>,
    document.body,
  )
}
