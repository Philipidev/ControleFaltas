import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'

import { chaves } from './chaves.ts'
import { paraDisciplina, paraFaltaDetalhada, type FaltaDetalhada } from './mapeadores.ts'
import type { RegraDoNivel } from '@/domain/limites.ts'
import type { Disciplina, Limites } from '@/domain/tipos.ts'
import { LIMITES_PADRAO } from '@/domain/tipos.ts'
import { mensagemDeErro, supabase } from '@/lib/supabase.ts'
import type {
  Atualizacao,
  ItemRanking,
  Json,
  LinhaConfiguracoes,
  LinhaGrupo,
  LinhaNotificacao,
  LinhaProfile,
} from '@/types/database.ts'

/**
 * Acesso a dados. Nenhuma tela importa `supabase` direto — tudo passa por aqui.
 *
 * Decisão importante: os cálculos da §4 (percentual, status, dias restantes)
 * NÃO vêm do servidor, mesmo existindo a view v_disciplina_status. Eles são
 * feitos por src/domain, que é código puro coberto por 159 testes. Isso dá
 * três coisas: uma única fonte de verdade para a matemática, funcionamento
 * offline no PWA, e o simulador da §7.3 respondendo sem ida e volta de rede.
 * A view continua valendo para o que roda no servidor (Edge Function do
 * resumo semanal) e para inspeção no SQL Editor.
 */

function lancar(erro: unknown): never {
  throw new Error(mensagemDeErro(erro))
}

// ---------------------------------------------------------------------------
// Perfil e configurações
// ---------------------------------------------------------------------------

export function usePerfil(usuarioId: string): UseQueryResult<LinhaProfile> {
  return useQuery({
    queryKey: chaves.perfil(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', usuarioId)
        .single()
      if (error !== null) lancar(error)
      return data
    },
  })
}

export interface PerfilEditavel {
  readonly nome: string
  readonly emoji: string
  readonly curso: string | null
  readonly periodo: string | null
  readonly turma: string | null
}

/**
 * Salva o perfil.
 *
 * `role` NÃO entra aqui de propósito. A policy de UPDATE permite editar a
 * própria linha, e é `trg_protege_role` que barra a auto-promoção a admin —
 * mandar o campo só renderia um erro do banco. Curso/período/turma mexem em
 * quais disciplinas o catálogo oferece (§2), então o painel também cai.
 */
export function useSalvarPerfil(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (novo: PerfilEditavel) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          nome: novo.nome.trim(),
          emoji: novo.emoji,
          // '' viraria uma string vazia no banco, que depois apareceria como
          // "Medicina ·  · Turma A" nas descrições. null é a ausência.
          curso: novo.curso?.trim() === '' ? null : (novo.curso?.trim() ?? null),
          periodo: novo.periodo?.trim() === '' ? null : (novo.periodo?.trim() ?? null),
          turma: novo.turma?.trim() === '' ? null : (novo.turma?.trim() ?? null),
        })
        .eq('id', usuarioId)
      if (error !== null) lancar(error)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.perfil(usuarioId) })
      void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
      // O nome e o emoji aparecem na lista de membros e no ranking.
      void qc.invalidateQueries({ queryKey: ['comunidades'] })
      void qc.invalidateQueries({ queryKey: ['ranking'] })
    },
  })
}

export function useConfiguracoes(usuarioId: string): UseQueryResult<LinhaConfiguracoes> {
  return useQuery({
    queryKey: chaves.configuracoes(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('configuracoes')
        .select('*')
        .eq('usuario_id', usuarioId)
        .single()
      if (error !== null) lancar(error)
      return data
    },
  })
}

/**
 * A configuração pessoal como um nível da cascata da regra (domain/limites.ts).
 *
 * As colunas são NOT NULL no banco — quem tem linha em `configuracoes` decide
 * tudo. Por isso o nível pessoal só perde para a disciplina e para a turma, e
 * o padrão de 25/15/20 só aparece para quem ainda não tem a linha.
 */
export function nivelDoUsuario(config: LinhaConfiguracoes | undefined): RegraDoNivel {
  if (config === undefined) return {}
  return {
    limiteReprovacao: config.limite_reprovacao,
    faixaVerde: config.faixa_verde,
    faixaAmarela: config.faixa_amarela,
    justificadaQuebraStreak: config.justificada_quebra_streak,
  }
}

/** A comunidade como nível da cascata. Anulável campo a campo, de propósito. */
export function nivelDaComunidade(grupo: LinhaGrupo | null | undefined): RegraDoNivel {
  if (grupo === null || grupo === undefined) return {}
  return {
    limiteReprovacao: grupo.limite_reprovacao,
    faixaVerde: grupo.faixa_verde,
    faixaAmarela: grupo.faixa_amarela,
  }
}

/** Converte a linha de configurações no formato que o domínio espera. */
export function limitesDe(config: LinhaConfiguracoes | undefined): Limites {
  if (config === undefined) return LIMITES_PADRAO
  return {
    limiteReprovacao: config.limite_reprovacao,
    faixaVerde: config.faixa_verde,
    faixaAmarela: config.faixa_amarela,
  }
}

export function useSalvarConfiguracoes(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    // Atualizacao<> (e não Partial<Row>) porque usuario_id e atualizado_em
    // não são atualizáveis: um é chave, o outro é do trigger de auditoria.
    mutationFn: async (mudancas: Atualizacao<'configuracoes'>) => {
      const { error } = await supabase
        .from('configuracoes')
        .update(mudancas)
        .eq('usuario_id', usuarioId)
      if (error !== null) lancar(error)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.configuracoes(usuarioId) })
    },
  })
}

// ---------------------------------------------------------------------------
// Disciplinas
// ---------------------------------------------------------------------------

export interface DisciplinaMatriculada {
  readonly disciplina: Disciplina
  readonly grupoId: string | null
  readonly personalizada: boolean
  /** O período letivo a que esta matrícula pertence, ex: '2026.2'. */
  readonly semestre: string
  /** Nível mais específico da regra do curso — ver domain/limites.ts. */
  readonly regra: RegraDoNivel
}

export function useMinhasDisciplinas(
  usuarioId: string,
): UseQueryResult<DisciplinaMatriculada[]> {
  return useQuery({
    queryKey: chaves.disciplinas(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('matriculas')
        .select('grupo_id, disciplinas!inner(*, disciplina_grade(dia_semana, horas, hora_inicio))')
        .eq('usuario_id', usuarioId)
        .eq('ativa', true)
      if (error !== null) lancar(error)

      return data.map((m) => ({
        disciplina: paraDisciplina(m.disciplinas),
        grupoId: m.grupo_id,
        personalizada: m.disciplinas.personalizada,
        semestre: m.disciplinas.semestre,
        regra: {
          limiteReprovacao: m.disciplinas.limite_reprovacao,
        },
      }))
    },
  })
}

/** §2 — catálogo oficial do curso/período, para o aluno selecionar. */
export function useCatalogo(curso: string, periodo: string, semestre: string) {
  return useQuery({
    queryKey: chaves.catalogo(curso, periodo, semestre),
    enabled: curso !== '' && periodo !== '',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('disciplinas')
        .select('*, disciplina_grade(dia_semana, horas, hora_inicio)')
        .eq('curso', curso)
        .eq('periodo', periodo)
        .eq('semestre', semestre)
        .eq('personalizada', false)
        .eq('ativa', true)
        .order('nome')
      if (error !== null) lancar(error)
      return data.map(paraDisciplina)
    },
  })
}

/** Só a regra do curso entra no lote — nunca carga horária ou grade. */
export interface RegraEmLote {
  readonly limite_reprovacao: number | null
}

/**
 * Onde o lote pega. Explícito de propósito: "todas as disciplinas" quer dizer
 * coisas diferentes para o aluno e para quem mantém o catálogo, e o RLS recusa
 * em silêncio o que não for de quem está pedindo — prometer o que não vai
 * acontecer é pior do que não oferecer.
 */
export type EscopoDoLote =
  | { readonly tipo: 'minhas-pessoais' }
  | {
      readonly tipo: 'catalogo'
      readonly curso: string
      readonly periodo: string
      readonly semestre: string
    }

/**
 * Aplica a mesma regra a várias disciplinas de uma vez.
 *
 * A alternativa é digitar 20% em oito disciplinas e descobrir na nona que uma
 * delas ficou em 25%. Devolve quantas linhas mudaram de fato — o número que a
 * tela confirma depois.
 */
export function useAplicarRegraEmLote(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      regra,
      escopo,
      exceto,
    }: {
      regra: RegraEmLote
      escopo: EscopoDoLote
      /** A disciplina que acabou de ser salva, para não contar duas vezes. */
      exceto?: string
    }) => {
      const alvo =
        escopo.tipo === 'minhas-pessoais'
          ? supabase
              .from('disciplinas')
              .update(regra)
              .eq('personalizada', true)
              .eq('criado_por', usuarioId)
          : supabase
              .from('disciplinas')
              .update(regra)
              .eq('personalizada', false)
              .eq('curso', escopo.curso)
              .eq('periodo', escopo.periodo)
              .eq('semestre', escopo.semestre)

      const { data, error } = await (exceto === undefined ? alvo : alvo.neq('id', exceto)).select(
        'id',
      )
      if (error !== null) lancar(error)
      return data.length
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
      void qc.invalidateQueries({ queryKey: ['catalogo'] })
    },
  })
}

/**
 * Liga as minhas matrículas à turma — `matriculas.grupo_id`.
 *
 * É o elo que define o escopo do ranking e, a partir dele, de qual comunidade
 * a disciplina herda a regra do curso. A decisão de QUAIS disciplinas entram
 * mora na RPC, e não aqui: ela casa curso, período e turma da disciplina com
 * os da comunidade, e deixa de fora as pessoais — que são só suas e não têm
 * com quem ser comparadas.
 *
 * Devolve quantas foram vinculadas.
 */
export function useVincularATurma(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (grupoId: string) => {
      const { data, error } = await supabase.rpc('vincular_disciplinas_ao_grupo', {
        p_grupo_id: grupoId,
      })
      if (error !== null) lancar(error)
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
    },
  })
}

export function useMatricular(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      disciplinaId,
      turmaId,
    }: {
      disciplinaId: string
      /** A turma a que esta matrícula pertence, quando se sabe qual é. */
      turmaId: string | null
    }) => {
      const { error } = await supabase
        .from('matriculas')
        .upsert(
          { usuario_id: usuarioId, disciplina_id: disciplinaId, ativa: true },
          { onConflict: 'usuario_id,disciplina_id' },
        )
      if (error !== null) lancar(error)

      // O vínculo vem da RPC, e não de um `grupo_id` mandado daqui, para
      // existir uma regra só: se o cliente decidisse por conta própria, ela
      // divergiria da que o banco aplica no backfill e ao entrar na turma.
      if (turmaId !== null) {
        const { error: erroVinculo } = await supabase.rpc('vincular_disciplinas_ao_grupo', {
          p_grupo_id: turmaId,
        })
        if (erroVinculo !== null) lancar(erroVinculo)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
    },
  })
}

/**
 * §2, opção secundária — disciplina "avulsa"/pessoal, fora da lista oficial.
 *
 * Nasce com personalizada = true e criado_por = você, e a policy de SELECT em
 * 0003 garante que só você a enxerga: o catálogo do admin continua íntegro.
 */
export function useCriarDisciplinaPersonalizada(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nova: {
      nome: string
      cargaHorariaTotal: number
      cor: string
      curso: string
      periodo: string
      semestre: string
      grade: { dia: number; horas: number }[]
      /** Nível "disciplina" da regra. Null nos dois campos = herda. */
      regra?: RegraEmLote
    }) => {
      const { data: disciplina, error: erroDisciplina } = await supabase
        .from('disciplinas')
        .insert({
          nome: nova.nome,
          curso: nova.curso,
          periodo: nova.periodo,
          semestre: nova.semestre,
          carga_horaria_total: nova.cargaHorariaTotal,
          cor: nova.cor,
          personalizada: true,
          criado_por: usuarioId,
          limite_reprovacao: nova.regra?.limite_reprovacao ?? null,
        })
        .select('id')
        .single()
      if (erroDisciplina !== null) lancar(erroDisciplina)

      if (nova.grade.length > 0) {
        const { error: erroGrade } = await supabase.from('disciplina_grade').insert(
          nova.grade.map((g) => ({
            disciplina_id: disciplina.id,
            dia_semana: g.dia,
            horas: g.horas,
          })),
        )
        if (erroGrade !== null) lancar(erroGrade)
      }

      const { error: erroMatricula } = await supabase.from('matriculas').insert({
        usuario_id: usuarioId,
        disciplina_id: disciplina.id,
      })
      if (erroMatricula !== null) lancar(erroMatricula)

      return disciplina.id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
    },
  })
}

// ---------------------------------------------------------------------------
// Disciplinas da turma — 0016
//
// O terceiro caso da §2: nem catálogo oficial do app, nem avulsa de uma pessoa.
// Quem administra a comunidade cadastra as matérias dela, e todo membro ativo
// as enxerga e se matricula. É catálogo de verdade — entra no ranking e aceita
// a regra do curso —, só que a chave é `grupo_membros.papel` em vez de
// `profiles.role`. O RLS de 0016 é quem garante; aqui é só conveniência.
// ---------------------------------------------------------------------------

export function useDisciplinasDaTurma(grupoId: string | null): UseQueryResult<Disciplina[]> {
  return useQuery({
    queryKey: chaves.disciplinasDaTurma(grupoId ?? ''),
    enabled: grupoId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('disciplinas')
        .select('*, disciplina_grade(dia_semana, horas, hora_inicio)')
        .eq('grupo_id', grupoId ?? '')
        .eq('ativa', true)
        .order('nome')
      if (error !== null) lancar(error)
      return data.map(paraDisciplina)
    },
  })
}

export function useCriarDisciplinaDaTurma(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nova: {
      grupoId: string
      nome: string
      cargaHorariaTotal: number
      cor: string
      /** Vêm da comunidade, não de quem digita: é a turma que responde por eles. */
      curso: string
      periodo: string
      turma: string | null
      semestre: string
      grade: { dia: number; horas: number }[]
    }) => {
      const { data: disciplina, error: erroDisciplina } = await supabase
        .from('disciplinas')
        .insert({
          nome: nova.nome,
          curso: nova.curso,
          periodo: nova.periodo,
          turma: nova.turma,
          semestre: nova.semestre,
          carga_horaria_total: nova.cargaHorariaTotal,
          cor: nova.cor,
          // Não é avulsa: é da turma. O CHECK `disciplina_avulsa_sem_grupo`
          // recusa a combinação personalizada + grupo_id.
          personalizada: false,
          grupo_id: nova.grupoId,
          criado_por: usuarioId,
        })
        .select('id')
        .single()
      if (erroDisciplina !== null) lancar(erroDisciplina)

      if (nova.grade.length > 0) {
        const { error: erroGrade } = await supabase.from('disciplina_grade').insert(
          nova.grade.map((g) => ({
            disciplina_id: disciplina.id,
            dia_semana: g.dia,
            horas: g.horas,
          })),
        )
        if (erroGrade !== null) lancar(erroGrade)
      }

      return disciplina.id
    },
    onSuccess: (_id, v) => {
      void qc.invalidateQueries({ queryKey: chaves.disciplinasDaTurma(v.grupoId) })
      // A tela de disciplinas oferece as da turma para matricular.
      void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
    },
  })
}

/**
 * Apagar a disciplina da turma, não a minha matrícula.
 *
 * Alcança quem já se matriculou: o `on delete cascade` de `matriculas` e de
 * `faltas` leva junto o que aquelas pessoas registraram. Por isso a tela
 * pergunta antes, e por isso isto só aparece para quem administra.
 */
export function useRemoverDisciplinaDaTurma(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ disciplinaId }: { grupoId: string; disciplinaId: string }) => {
      const { error } = await supabase.from('disciplinas').delete().eq('id', disciplinaId)
      if (error !== null) lancar(error)
    },
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: chaves.disciplinasDaTurma(v.grupoId) })
      void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
      void qc.invalidateQueries({ queryKey: chaves.faltas(usuarioId) })
    },
  })
}

export function useDesmatricular(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (disciplinaId: string) => {
      const { error } = await supabase
        .from('matriculas')
        .delete()
        .eq('usuario_id', usuarioId)
        .eq('disciplina_id', disciplinaId)
      if (error !== null) lancar(error)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
      void qc.invalidateQueries({ queryKey: chaves.faltas(usuarioId) })
    },
  })
}

// ---------------------------------------------------------------------------
// Admin — §2, painel do administrador
// ---------------------------------------------------------------------------

/** Todo o catálogo oficial num lugar só, "pra facilitar atualização a cada semestre". */
export function useTodasDisciplinas() {
  return useQuery({
    queryKey: chaves.todasDisciplinas(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('disciplinas')
        .select('*, disciplina_grade(dia_semana, horas, hora_inicio)')
        .eq('personalizada', false)
        .order('curso')
        .order('periodo')
        .order('nome')
      if (error !== null) lancar(error)
      return data
    },
  })
}

export interface EntradaCatalogo {
  readonly id?: string
  readonly nome: string
  readonly codigo: string | null
  readonly curso: string
  readonly periodo: string
  readonly turma: string | null
  readonly semestre: string
  readonly cargaHorariaTotal: number
  readonly cor: string
  /** `horaInicio` em 'HH:MM'; null quando o horário não é conhecido. */
  readonly grade: readonly { dia: number; horas: number; horaInicio: string | null }[]
  /** Nível "disciplina" da regra do curso. Null nos dois campos = herda. */
  readonly regra?: RegraEmLote
}

/**
 * Cria ou atualiza uma disciplina do catálogo junto com a grade.
 *
 * A grade é substituída inteira (apaga e reinsere) em vez de sofrer um diff:
 * são no máximo sete linhas, e um diff aqui introduziria a chance de sobrar
 * um dia fantasma que o trigger de horas usaria depois.
 */
export function useSalvarDisciplinaAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entrada: EntradaCatalogo) => {
      const campos = {
        nome: entrada.nome,
        codigo: entrada.codigo,
        curso: entrada.curso,
        periodo: entrada.periodo,
        turma: entrada.turma,
        semestre: entrada.semestre,
        carga_horaria_total: entrada.cargaHorariaTotal,
        cor: entrada.cor,
        limite_reprovacao: entrada.regra?.limite_reprovacao ?? null,
      }

      let id = entrada.id

      if (id === undefined) {
        const { data, error } = await supabase
          .from('disciplinas')
          .insert({ ...campos, personalizada: false })
          .select('id')
          .single()
        if (error !== null) lancar(error)
        id = data.id
      } else {
        const { error } = await supabase.from('disciplinas').update(campos).eq('id', id)
        if (error !== null) lancar(error)

        const { error: erroLimpar } = await supabase
          .from('disciplina_grade')
          .delete()
          .eq('disciplina_id', id)
        if (erroLimpar !== null) lancar(erroLimpar)
      }

      if (entrada.grade.length > 0) {
        const { error } = await supabase.from('disciplina_grade').insert(
          entrada.grade.map((g) => ({
            disciplina_id: id,
            dia_semana: g.dia,
            horas: g.horas,
            hora_inicio: g.horaInicio ?? null,
          })),
        )
        if (error !== null) lancar(error)
      }

      return id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.todasDisciplinas() })
      // A grade alimenta o painel do aluno e a exportação para o calendário.
      void qc.invalidateQueries({ queryKey: ['disciplinas'] })
      void qc.invalidateQueries({ queryKey: ['catalogo'] })
    },
  })
}

export function useRemoverDisciplinaAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('disciplinas').delete().eq('id', id)
      if (error !== null) lancar(error)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.todasDisciplinas() })
    },
  })
}

// ---------------------------------------------------------------------------
// Faltas — §3 e §7.1
// ---------------------------------------------------------------------------

export function useFaltas(usuarioId: string): UseQueryResult<FaltaDetalhada[]> {
  return useQuery({
    queryKey: chaves.faltas(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faltas')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('data', { ascending: false })
      if (error !== null) lancar(error)
      return data.map(paraFaltaDetalhada)
    },
  })
}

export function useMarcarFalta(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      disciplinaId,
      data,
      justificada = false,
      cobreAte = null,
      observacao,
    }: {
      disciplinaId: string
      data: string
      /** §7.1 — "tenho atestado". É anotação: não muda o cálculo de risco. */
      justificada?: boolean
      /** Último dia coberto pelo mesmo atestado, quando cobre mais de um. */
      cobreAte?: string | null
      observacao?: string
    }) => {
      // horas_perdidas fica de fora de propósito (§3): o trigger
      // trg_falta_horas preenche a partir da grade semanal. Mandar um número
      // daqui seria o cliente opinando sobre algo que o banco já sabe.
      const { error } = await supabase.from('faltas').insert({
        usuario_id: usuarioId,
        disciplina_id: disciplinaId,
        data,
        justificada,
        observacao: observacao ?? null,
      })
      if (error !== null) lancar(error)

      // Um atestado cobre um período, não uma aula: ficar doente de segunda a
      // sexta são oito faltas em quatro disciplinas. O intervalo alcança o que
      // JÁ está registrado — o app não guarda o período do atestado, então
      // falta registrada depois disto não entra sozinha, e é por isso que a
      // tela fala em "faltas já registradas".
      if (justificada && cobreAte !== null && cobreAte > data) {
        const { error: erroIntervalo } = await supabase
          .from('faltas')
          .update({ justificada: true })
          .eq('usuario_id', usuarioId)
          .gte('data', data)
          .lte('data', cobreAte)
        if (erroIntervalo !== null) lancar(erroIntervalo)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.faltas(usuarioId) })
      void qc.invalidateQueries({ queryKey: chaves.notificacoes(usuarioId) })
    },
  })
}

export function useRemoverFalta(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (faltaId: string) => {
      const { error } = await supabase.from('faltas').delete().eq('id', faltaId)
      if (error !== null) lancar(error)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.faltas(usuarioId) })
    },
  })
}

export function useJustificarFalta(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ faltaId, justificada }: { faltaId: string; justificada: boolean }) => {
      // Sem prazo e sem anexo: é uma anotação, e o banco aceita ligar e
      // desligar quando a pessoa quiser.
      const { error } = await supabase
        .from('faltas')
        .update({ justificada })
        .eq('id', faltaId)
      if (error !== null) lancar(error)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.faltas(usuarioId) })
    },
  })
}

// ---------------------------------------------------------------------------
// Grupos e ranking — §5
// ---------------------------------------------------------------------------

/**
 * Grupos dos quais eu participo — só participações ATIVAS.
 *
 * O filtro de status não é detalhe: sem ele, um convite ainda não respondido
 * apareceria no seletor do ranking, e a pessoa tentaria ler a comparação de um
 * grupo em que não entrou (a RPC recusaria, mas com um erro feio no lugar de
 * uma tela coerente).
 */
export function useGrupos(usuarioId: string) {
  return useQuery({
    queryKey: chaves.grupos(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grupo_membros')
        .select('grupos!inner(id, nome, emoji, tipo, codigo_convite, curso, periodo, turma)')
        .eq('usuario_id', usuarioId)
        .eq('status', 'ativo')
      if (error !== null) lancar(error)
      return data.map((m) => m.grupos)
    },
  })
}

export function useRanking(
  grupoId: string | null,
  disciplinaId: string | null,
): UseQueryResult<ItemRanking[]> {
  return useQuery({
    queryKey: chaves.ranking(grupoId ?? '', disciplinaId),
    enabled: grupoId !== null,
    queryFn: async () => {
      // A RPC devolve APENAS posição, nome e avatar. Nenhum percentual sai do
      // servidor — é a única porta de leitura cruzada que existe (§5).
      const { data, error } = await supabase.rpc('get_group_ranking', {
        p_grupo_id: grupoId ?? '',
        p_disciplina_id: disciplinaId,
      })
      if (error !== null) lancar(error)
      return data
    },
  })
}

export function useEntrarNoGrupo(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (codigo: string) => {
      const { data, error } = await supabase.rpc('entrar_no_grupo', { p_codigo: codigo })
      if (error !== null) lancar(error)
      // Entrar por código já deixa a pessoa ativa, então o vínculo é agora.
      // Não derruba a entrada se falhar: a tela de disciplinas tem o botão.
      const { error: erroVinculo } = await supabase.rpc('vincular_disciplinas_ao_grupo', {
        p_grupo_id: data,
      })
      if (erroVinculo !== null) {
        console.warn('Não consegui vincular as disciplinas à turma:', mensagemDeErro(erroVinculo))
      }
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.grupos(usuarioId) })
      // Entrar por código muda as MESMAS coisas que entrar pela tela de
      // comunidades: a lista de turmas, as pendências e — porque entrar
      // vincula as matrículas ao grupo — o painel de disciplinas.
      void qc.invalidateQueries({ queryKey: ['comunidades'] })
      void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
    },
  })
}

// ---------------------------------------------------------------------------
// §7.6 — Reset por semestre: "zera os dados mas mantém histórico"
// ---------------------------------------------------------------------------

export function useHistoricoSemestres(usuarioId: string) {
  return useQuery({
    queryKey: ['historico', usuarioId] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('historico_semestres')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('semestre', { ascending: false })
      if (error !== null) lancar(error)
      return data
    },
  })
}

/**
 * Arquiva o semestre e zera os dados do usuário.
 *
 * A ordem importa: o snapshot é gravado ANTES de qualquer apagamento. Se o
 * insert do histórico falhar, nada é apagado — melhor terminar com um
 * semestre não arquivado do que com um semestre perdido.
 *
 * As matrículas são desativadas em vez de removidas, porque as disciplinas do
 * catálogo continuam existindo e o aluno pode reativar sem recadastrar.
 */
export function useArquivarSemestre(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ semestre, snapshot }: { semestre: string; snapshot: Json }) => {
      const { error: erroHistorico } = await supabase
        .from('historico_semestres')
        .upsert({ usuario_id: usuarioId, semestre, snapshot }, { onConflict: 'usuario_id,semestre' })
      if (erroHistorico !== null) lancar(erroHistorico)

      const { error: erroFaltas } = await supabase
        .from('faltas')
        .delete()
        .eq('usuario_id', usuarioId)
      if (erroFaltas !== null) lancar(erroFaltas)

      const { error: erroMatriculas } = await supabase
        .from('matriculas')
        .update({ ativa: false })
        .eq('usuario_id', usuarioId)
      if (erroMatriculas !== null) lancar(erroMatriculas)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.faltas(usuarioId) })
      void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
      void qc.invalidateQueries({ queryKey: ['historico', usuarioId] })
    },
  })
}

// ---------------------------------------------------------------------------
// Notificações — §6
// ---------------------------------------------------------------------------

export function useNotificacoes(usuarioId: string): UseQueryResult<LinhaNotificacao[]> {
  return useQuery({
    queryKey: chaves.notificacoes(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('*')
        .eq('usuario_id', usuarioId)
        .order('criado_em', { ascending: false })
        .limit(50)
      if (error !== null) lancar(error)
      return data
    },
  })
}

export function useMarcarNotificacaoLida(usuarioId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
      if (error !== null) lancar(error)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: chaves.notificacoes(usuarioId) })
    },
  })
}
