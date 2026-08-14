import { motion } from 'motion/react'
import {
  Bell,
  ChartColumn,
  CircleHelp,
  CircleUser,
  Ellipsis,
  Library,
  Settings2,
  Shield,
  X,
} from 'lucide-react'
import { useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router'

import { cn } from '@/lib/cn.ts'

/**
 * As telas que não cabem na barra inferior.
 *
 * A lateral com a navegação completa é `lg:flex` — no celular ela não existe,
 * e a barra de baixo só tem cinco lugares. Sem esta folha, Alertas,
 * Relatórios, Ajustes e Admin ficariam sem NENHUMA porta de entrada num
 * aparelho: nem o botão de sair da conta, que mora em Ajustes, seria
 * alcançável. Por isso o botão é `lg:hidden` — no desktop a lateral já
 * resolve, e dois caminhos para o mesmo lugar só confundem.
 */
interface Item {
  readonly para: string
  readonly rotulo: string
  readonly icone: ComponentType<{ className?: string }>
  readonly soAdmin?: boolean
}

const ITENS: readonly Item[] = [
  // Primeiro porque era a única sem saída nenhuma: o botão que levava até ela
  // vivia dentro do estado vazio da tela inicial, e sumia junto com ele na
  // primeira disciplina cadastrada. Quem quisesse a segunda não tinha caminho.
  { para: '/disciplinas', rotulo: 'Minhas disciplinas', icone: Library },
  { para: '/alertas', rotulo: 'Alertas', icone: Bell },
  { para: '/relatorios', rotulo: 'Relatórios', icone: ChartColumn },
  // Perfil carrega o botão de sair da conta. No celular esta folha é o único
  // caminho até ele — a lateral que o listaria é lg:flex.
  { para: '/perfil', rotulo: 'Perfil', icone: CircleUser },
  { para: '/configuracoes', rotulo: 'Ajustes', icone: Settings2 },
  { para: '/ajuda', rotulo: 'Como funciona', icone: CircleHelp },
  { para: '/admin', rotulo: 'Admin', icone: Shield, soAdmin: true },
]

export function MenuMais({
  ehAdmin,
  naoLidos = 0,
}: {
  ehAdmin: boolean
  naoLidos?: number
}) {
  const [aberto, setAberto] = useState(false)
  const itens = ITENS.filter((i) => !(i.soAdmin ?? false) || ehAdmin)

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAberto(true)
        }}
        aria-label={naoLidos > 0 ? `Mais — ${String(naoLidos)} alertas não lidos` : 'Mais'}
        aria-haspopup="dialog"
        className="relative grid size-9 place-items-center rounded-pill bg-superficie-2 text-texto-suave lg:hidden"
      >
        <Ellipsis className="size-5" />
        {naoLidos > 0 && (
          // Sem número: o botão é pequeno e o que importa aqui é "tem coisa
          // lá dentro". A contagem exata aparece na própria tela de Alertas.
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 size-2 rounded-full bg-vermelho ring-2 ring-superficie-2"
          />
        )}
      </button>

      {/* Portal para o body, e não é detalhe de implementação: este menu vive
          dentro do <header>, que tem backdrop-blur. Um `backdrop-filter` cria
          bloco de contenção para descendentes `position: fixed` — o inset-0
          passaria a valer contra o cabeçalho, e a folha aparecia espremida em
          68px de altura no topo da tela. Fora do header, volta a valer a
          viewport. */}
      {aberto &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
            <button
              type="button"
              aria-label="Fechar"
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                setAberto(false)
              }}
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              role="dialog"
              aria-label="Mais telas"
              className="area-segura-base relative w-full max-w-md rounded-t-card bg-superficie p-6 shadow-flutuante"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-texto">Mais</h2>
                <button
                  type="button"
                  onClick={() => {
                    setAberto(false)
                  }}
                  aria-label="Fechar"
                  className="grid size-9 place-items-center rounded-pill bg-superficie-2 text-texto-suave"
                >
                  <X className="size-4" />
                </button>
              </div>

              <nav className="space-y-2">
                {itens.map((i) => (
                  <NavLink
                    key={i.para}
                    to={i.para}
                    onClick={() => {
                      setAberto(false)
                    }}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-controle px-4 py-3 font-bold transition-colors',
                        isActive ? 'bg-acento-suave text-acento' : 'bg-superficie-2 text-texto',
                      )
                    }
                  >
                    <i.icone className="size-5" />
                    {i.rotulo}
                    {i.para === '/alertas' && naoLidos > 0 && (
                      <span className="tabular ml-auto grid min-w-5 place-items-center rounded-pill bg-vermelho px-1.5 text-[0.625rem] font-extrabold text-status-contraste">
                        {naoLidos > 9 ? '9+' : naoLidos}
                      </span>
                    )}
                  </NavLink>
                ))}
              </nav>
            </motion.div>
          </div>,
          document.body,
        )}
    </>
  )
}
