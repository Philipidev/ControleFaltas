import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { usePendencias } from './data/comunidades.ts'
import { usePerfil } from './data/queries.ts'
import { useSessao } from './features/auth/contexto.ts'
import { SessaoProvider } from './features/auth/sessao.tsx'
import { usePainel } from './features/dashboard/usePainel.ts'
import { TelaInicial } from './features/dashboard/TelaInicial.tsx'
import { useBadgeDoApp } from './features/pwa/useBadgeDoApp.ts'
import { Layout } from './layout/Layout.tsx'
import { Esqueleto } from './layout/pecas.tsx'
import { TelaSetup } from './layout/TelaSetup.tsx'
import { env } from './lib/env.ts'
import { queryClient } from './lib/queryClient.ts'
import { TemaProvider } from './theme/TemaProvider.tsx'

/**
 * Só a tela inicial e o login entram no bundle inicial. As demais são
 * carregadas quando visitadas — num app mobile-first, quem abre para marcar
 * uma falta não deveria baixar o back-office do admin nem o gerador de PDF.
 */
const TelaEntrar = lazy(() =>
  import('./features/auth/TelaEntrar.tsx').then((m) => ({ default: m.TelaEntrar })),
)
const TelaDisciplinas = lazy(() =>
  import('./features/disciplinas/TelaDisciplinas.tsx').then((m) => ({
    default: m.TelaDisciplinas,
  })),
)
const TelaDisciplina = lazy(() =>
  import('./features/disciplinas/TelaDisciplina.tsx').then((m) => ({
    default: m.TelaDisciplina,
  })),
)
const TelaFaltas = lazy(() =>
  import('./features/faltas/TelaFaltas.tsx').then((m) => ({ default: m.TelaFaltas })),
)
const TelaCalendario = lazy(() =>
  import('./features/calendario/TelaCalendario.tsx').then((m) => ({
    default: m.TelaCalendario,
  })),
)
const TelaRanking = lazy(() =>
  import('./features/ranking/TelaRanking.tsx').then((m) => ({ default: m.TelaRanking })),
)
const TelaAlertas = lazy(() =>
  import('./features/alertas/TelaAlertas.tsx').then((m) => ({ default: m.TelaAlertas })),
)
const TelaRelatorios = lazy(() =>
  import('./features/relatorios/TelaRelatorios.tsx').then((m) => ({
    default: m.TelaRelatorios,
  })),
)
const TelaConfiguracoes = lazy(() =>
  import('./features/config/TelaConfiguracoes.tsx').then((m) => ({
    default: m.TelaConfiguracoes,
  })),
)
const TelaAdmin = lazy(() =>
  import('./features/admin/TelaAdmin.tsx').then((m) => ({ default: m.TelaAdmin })),
)
const TelaComunidades = lazy(() =>
  import('./features/comunidades/TelaComunidades.tsx').then((m) => ({
    default: m.TelaComunidades,
  })),
)
const TelaComunidade = lazy(() =>
  import('./features/comunidades/TelaComunidade.tsx').then((m) => ({
    default: m.TelaComunidade,
  })),
)
const TelaNovaComunidade = lazy(() =>
  import('./features/comunidades/TelaNovaComunidade.tsx').then((m) => ({
    default: m.TelaNovaComunidade,
  })),
)

export default function App() {
  // Sem as chaves no .env.local, uma tela de setup explica o que falta em vez
  // de uma página em branco com erro de rede no console.
  if (!env.configurado) return <TelaSetup />

  return (
    <TemaProvider>
      <QueryClientProvider client={queryClient}>
        <SessaoProvider>
          <BrowserRouter>
            <Roteador />
          </BrowserRouter>
        </SessaoProvider>
      </QueryClientProvider>
    </TemaProvider>
  )
}

function Roteador() {
  const { usuarioId, carregando } = useSessao()

  if (carregando) return <Esqueleto />

  if (usuarioId === null) {
    return (
      <Suspense fallback={<Esqueleto />}>
        <Routes>
          <Route path="/entrar" element={<TelaEntrar />} />
          <Route path="*" element={<Navigate to="/entrar" replace />} />
        </Routes>
      </Suspense>
    )
  }

  return <RotasAutenticadas usuarioId={usuarioId} />
}

function RotasAutenticadas({ usuarioId }: { usuarioId: string }) {
  const perfil = usePerfil(usuarioId)
  const painel = usePainel(usuarioId)
  const pendencias = usePendencias(usuarioId)
  const ehAdmin = perfil.data?.role === 'admin'

  // §7.4 — o badge no ícone do app instalado acompanha as disciplinas em
  // atenção, sem precisar abrir nada.
  useBadgeDoApp(painel.geral.emAtencao)

  // Convites meus + solicitações que preciso responder, num número só.
  const totalPendencias =
    (pendencias.data?.convites ?? 0) + (pendencias.data?.solicitacoes ?? 0)

  return (
    <Routes>
      <Route element={<Layout ehAdmin={ehAdmin} pendencias={totalPendencias} />}>
        <Route index element={<TelaInicial />} />
        <Route
          path="*"
          element={
            <Suspense fallback={<Esqueleto />}>
              <Routes>
                <Route path="disciplinas" element={<TelaDisciplinas />} />
                <Route path="disciplinas/:id" element={<TelaDisciplina />} />
                <Route path="faltas" element={<TelaFaltas />} />
                <Route path="calendario" element={<TelaCalendario />} />
                <Route path="ranking" element={<TelaRanking />} />
                {/* /nova antes de /:id — senão "nova" casaria como um id. */}
                <Route path="comunidades" element={<TelaComunidades />} />
                <Route path="comunidades/nova" element={<TelaNovaComunidade />} />
                <Route path="comunidades/:id" element={<TelaComunidade />} />
                <Route path="alertas" element={<TelaAlertas />} />
                <Route path="relatorios" element={<TelaRelatorios />} />
                <Route path="configuracoes" element={<TelaConfiguracoes />} />
                {ehAdmin && <Route path="admin" element={<TelaAdmin />} />}
                <Route path="entrar" element={<Navigate to="/" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  )
}
