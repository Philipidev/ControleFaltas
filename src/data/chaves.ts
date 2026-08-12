/**
 * Chaves de cache do TanStack Query, num lugar só.
 *
 * Espalhar arrays literais pelos hooks é como as invalidações passam a errar
 * em silêncio: a mutação invalida `['faltas']` e a query estava em
 * `['faltas', usuarioId]`, então a tela não atualiza e ninguém percebe até um
 * usuário reclamar.
 */
export const chaves = {
  perfil: (usuarioId: string) => ['perfil', usuarioId] as const,
  configuracoes: (usuarioId: string) => ['configuracoes', usuarioId] as const,

  disciplinas: (usuarioId: string) => ['disciplinas', usuarioId] as const,
  catalogo: (curso: string, periodo: string, semestre: string) =>
    ['catalogo', curso, periodo, semestre] as const,
  todasDisciplinas: () => ['admin', 'disciplinas'] as const,

  faltas: (usuarioId: string) => ['faltas', usuarioId] as const,

  grupos: (usuarioId: string) => ['grupos', usuarioId] as const,
  ranking: (grupoId: string, disciplinaId: string | null) =>
    ['ranking', grupoId, disciplinaId] as const,

  // --- Comunidades ---------------------------------------------------------
  catalogo_comunidades: (termo: string) => ['comunidades', 'catalogo', termo] as const,
  comunidade: (grupoId: string) => ['comunidades', grupoId] as const,
  membros: (grupoId: string) => ['comunidades', grupoId, 'membros'] as const,
  convites: (usuarioId: string) => ['comunidades', 'convites', usuarioId] as const,
  pendencias: (usuarioId: string) => ['comunidades', 'pendencias', usuarioId] as const,

  notificacoes: (usuarioId: string) => ['notificacoes', usuarioId] as const,
  resumoSemanal: (usuarioId: string) => ['resumo-semanal', usuarioId] as const,
} as const
