import {
  Bell,
  BookOpen,
  CalendarDays,
  ChartColumn,
  CircleUser,
  House,
  Settings2,
  Shield,
  Trophy,
  Users,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink, Outlet } from 'react-router'

import { BotaoModo } from '@/components/SeletorTema.tsx'
import { cn } from '@/lib/cn.ts'

/**
 * Casca do app.
 *
 * Mobile-first: barra inferior com cinco destinos, na zona que o polegar
 * alcança. No desktop a mesma lista vira barra lateral — os destinos e a
 * ordem são idênticos, só muda a orientação, então quem aprendeu num
 * dispositivo não reaprende no outro.
 */

interface Destino {
  readonly para: string
  readonly rotulo: string
  readonly icone: ComponentType<{ className?: string }>
  readonly soAdmin?: boolean
}

const PRINCIPAIS: readonly Destino[] = [
  { para: '/', rotulo: 'Início', icone: House },
  { para: '/faltas', rotulo: 'Faltas', icone: BookOpen },
  { para: '/calendario', rotulo: 'Calendário', icone: CalendarDays },
  { para: '/comunidades', rotulo: 'Turmas', icone: Users },
  { para: '/ranking', rotulo: 'Ranking', icone: Trophy },
]

const SECUNDARIOS: readonly Destino[] = [
  { para: '/alertas', rotulo: 'Alertas', icone: Bell },
  { para: '/relatorios', rotulo: 'Relatórios', icone: ChartColumn },
  { para: '/perfil', rotulo: 'Perfil', icone: CircleUser },
  { para: '/configuracoes', rotulo: 'Ajustes', icone: Settings2 },
  { para: '/admin', rotulo: 'Admin', icone: Shield, soAdmin: true },
]

export function Layout({ ehAdmin, pendencias = 0 }: { ehAdmin: boolean; pendencias?: number }) {
  const laterais = [...PRINCIPAIS, ...SECUNDARIOS.filter((d) => !(d.soAdmin ?? false) || ehAdmin)]

  return (
    /*
     * Casca fixa, miolo rolante.
     *
     * Com `min-h-dvh` quem rolava era o DOCUMENTO. No iOS em modo aplicativo
     * isso arrasta a página inteira no efeito elástico: o cabeçalho `sticky` e
     * a barra de baixo `fixed` sobem junto e aparece o fundo atrás delas — a
     * aba inteira se mexe em vez de só o conteúdo.
     *
     * `h-dvh` + `overflow-hidden` deixa o documento exatamente do tamanho da
     * tela, então não há o que rolar nele. O scroll passa a acontecer no `div`
     * do conteúdo, e o cabeçalho gruda no topo DELE — que é o que se espera de
     * um app.
     */
    <div className="h-dvh overflow-hidden bg-fundo lg:flex">
      {/* Barra lateral — desktop */}
      <aside className="hidden h-full w-60 shrink-0 flex-col overflow-y-auto border-r border-borda bg-fundo-alt px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="grid size-9 place-items-center rounded-controle bg-acento text-lg">
            📋
          </span>
          <span className="font-extrabold text-texto">Faltas</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {laterais.map((d) => (
            <ItemLateral
              key={d.para}
              destino={d}
              contador={d.para === '/comunidades' ? pendencias : 0}
            />
          ))}
        </nav>

        <BotaoModo className="mt-2 self-start" />
      </aside>

      {/* `overscroll-contain` impede o encadeamento: sem ele, chegar ao fim
          da lista continua o gesto no documento e o efeito elástico volta. */}
      <div className="h-full flex-1 overflow-y-auto overscroll-contain">
        <Outlet />
      </div>

      {/*
        Barra inferior — mobile.

        O padding é `max(inset, 0.5rem)` e não o inset puro, porque o inset
        varia demais entre aparelhos e em metade deles é ZERO:

          iPhone com indicador de gesto ..... 34px → 48 + 34 = 82
          Android com navegação por gestos .. ~24px → 48 + 24 = 72
          Android com 3 botões .............. 0    → 48 +  8 = 56
          iPhone SE / com botão home ........ 0    → 48 +  8 = 56

        Sem o piso de 8px, os dois últimos casos colavam os rótulos na borda
        da tela. Com ele, a altura total fica entre 56 e 82 em todo aparelho —
        dentro da faixa das barras nativas (56dp no Material, 83pt no iOS).
      */}
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-fundo/90 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto flex max-w-2xl">
          {PRINCIPAIS.map((d) => (
            <li key={d.para} className="flex-1">
              <ItemInferior
                destino={d}
                contador={d.para === '/comunidades' ? pendencias : 0}
              />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

/** Bolinha com o número de pendências. Some no zero — "nada pendente" é a
 *  ausência do selo, não um "0" pendurado. */
function Selo({ contador }: { contador: number }) {
  if (contador <= 0) return null
  return (
    <span
      aria-label={`${String(contador)} pendente${contador > 1 ? 's' : ''}`}
      className="tabular grid min-w-5 place-items-center rounded-pill bg-vermelho px-1.5 text-[0.625rem] font-extrabold text-status-contraste"
    >
      {contador > 9 ? '9+' : contador}
    </span>
  )
}

function ItemLateral({ destino, contador }: { destino: Destino; contador: number }) {
  const Icone = destino.icone
  return (
    <NavLink
      to={destino.para}
      end={destino.para === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-controle px-3 py-2.5 text-sm font-extrabold transition-colors',
          isActive
            ? 'bg-acento-suave text-acento'
            : 'text-texto-suave hover:bg-superficie-2 hover:text-texto',
        )
      }
    >
      <Icone className="size-5" />
      <span className="flex-1">{destino.rotulo}</span>
      <Selo contador={contador} />
    </NavLink>
  )
}

function ItemInferior({ destino, contador }: { destino: Destino; contador: number }) {
  const Icone = destino.icone
  return (
    <NavLink
      to={destino.para}
      end={destino.para === '/'}
      className={({ isActive }) =>
        cn(
          /*
           * 48px, não 56px.
           *
           * A altura visível é isto MAIS o env(safe-area-inset-bottom) do
           * aparelho — no iPhone com indicador de gesto são ~34px. Com 56 a
           * barra chegava a ~90px, contra os ~83pt da barra de abas do
           * próprio iOS, e o miolo (ícone de 20px + rótulo de 10px) ficava
           * boiando no meio. 48 alinha com a convenção e continua acima dos
           * 44pt mínimos de alvo de toque da Apple.
           */
          'relative flex h-12 flex-col items-center justify-center gap-0.5 text-[0.625rem] font-bold transition-colors',
          isActive ? 'text-acento' : 'text-texto-fraco',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className="relative">
            <Icone className={cn('size-5 transition-transform', isActive && 'scale-110')} />
            {contador > 0 && (
              <span className="absolute -top-1.5 -right-2">
                <Selo contador={contador} />
              </span>
            )}
          </span>
          {destino.rotulo}
        </>
      )}
    </NavLink>
  )
}
