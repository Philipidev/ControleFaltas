import { motion } from 'motion/react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'

import { pedirInstalacao, useEstadoInstalacao } from './instalacao.ts'
import { Botao } from '@/components/ui/Botao.tsx'
import { cn } from '@/lib/cn.ts'

/**
 * "Colocar na tela de início".
 *
 * Some sozinho quando não há o que oferecer — app já instalado, ou navegador
 * sem caminho de instalação. Um botão que não leva a nada é pior que a
 * ausência dele.
 *
 * `variante` muda só a aparência: no login ele é discreto (a tarefa ali é
 * entrar, não instalar), e no perfil é um cartão que explica o ganho.
 */
export function BotaoInstalar({
  variante = 'cartao',
  className,
}: {
  variante?: 'cartao' | 'discreto'
  className?: string
}) {
  const estado = useEstadoInstalacao()
  const [ensinando, setEnsinando] = useState(false)
  const [recusou, setRecusou] = useState(false)

  if (estado === 'instalado' || estado === 'indisponivel') return null

  const ehIOS = estado === 'ios-safari' || estado === 'ios-outro-navegador'

  function acionar() {
    if (ehIOS) {
      setEnsinando(true)
      return
    }
    void pedirInstalacao().then((r) => {
      if (r === 'recusado') setRecusou(true)
    })
  }

  return (
    <>
      {variante === 'discreto' ? (
        <button
          type="button"
          onClick={acionar}
          className={cn(
            'flex items-center justify-center gap-2 text-sm font-bold text-acento',
            className,
          )}
        >
          <Download className="size-4" />
          Colocar na tela de início
        </button>
      ) : (
        <div
          className={cn(
            'rounded-card border-2 border-borda bg-superficie-2 p-4',
            className,
          )}
        >
          <p className="font-extrabold text-texto">Deixe o app na tela de início</p>
          <p className="mt-1 text-xs font-semibold text-texto-suave">
            Abre em tela cheia, sem a barra do navegador, e o ícone mostra quantas
            disciplinas estão em atenção.
          </p>
          <Botao
            className="mt-3"
            larguraTotal
            variante="secundario"
            iconeInicio={<Download className="size-4" />}
            onClick={acionar}
          >
            {ehIOS ? 'Ver como fazer' : 'Instalar'}
          </Botao>
          {recusou && (
            <p className="mt-2 text-xs font-semibold text-texto-fraco">
              Sem problema — o botão fica aqui se você mudar de ideia.
            </p>
          )}
        </div>
      )}

      {ensinando && (
        <FolhaIOS
          precisaDoSafari={estado === 'ios-outro-navegador'}
          aoFechar={() => {
            setEnsinando(false)
          }}
        />
      )}
    </>
  )
}

/**
 * As instruções do iOS.
 *
 * Não há API de instalação no iPhone — este passo a passo É o recurso. Por
 * isso ele mostra os ícones que a pessoa vai procurar na tela, em vez de só
 * descrever com palavras.
 */
function FolhaIOS({
  precisaDoSafari,
  aoFechar,
}: {
  precisaDoSafari: boolean
  aoFechar: () => void
}) {
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
        aria-label="Como colocar na tela de início"
        className="area-segura-base relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-card bg-superficie p-6 shadow-flutuante sm:rounded-card"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-texto">Na tela de início</h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="grid size-9 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
          >
            <X className="size-4" />
          </button>
        </div>

        {precisaDoSafari ? (
          <>
            <p className="rounded-interno bg-amarelo-suave px-3 py-2.5 text-sm font-bold text-amarelo">
              Abra este site no Safari primeiro.
            </p>
            <p className="mt-3 text-sm font-semibold text-texto-suave">
              No iPhone, só o Safari cria o app de verdade — em tela cheia e com o ícone
              certo. Nos outros navegadores o atalho abre de volta dentro do navegador.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-texto-suave">
              O iPhone não tem botão de instalar; são dois toques na barra do Safari.
            </p>

            <ol className="mt-4 space-y-3">
              <Passo numero={1} icone={<Share className="size-5" />}>
                Toque em <strong className="text-texto">Compartilhar</strong>, o quadrado com
                a seta para cima na barra de baixo.
              </Passo>
              <Passo numero={2} icone={<SquarePlus className="size-5" />}>
                Role a lista e escolha{' '}
                <strong className="text-texto">Adicionar à Tela de Início</strong>.
              </Passo>
              <Passo numero={3} icone={<span aria-hidden="true">📋</span>}>
                Confirme em <strong className="text-texto">Adicionar</strong>. O ícone aparece
                junto dos seus outros apps.
              </Passo>
            </ol>
          </>
        )}
      </motion.div>
    </div>,
    document.body,
  )
}

function Passo({
  numero,
  icone,
  children,
}: {
  numero: number
  icone: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-pill bg-acento-suave text-acento"
      >
        {icone}
      </span>
      <span className="pt-1 text-sm font-semibold text-texto-suave">
        <span className="sr-only">Passo {numero}: </span>
        {children}
      </span>
    </li>
  )
}
