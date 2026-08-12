import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'

import { chaves } from './chaves.ts'
import type { PapelComunidade, StatusMembro, Visibilidade } from '@/domain/comunidades.ts'
import { mensagemDeErro, supabase } from '@/lib/supabase.ts'
import type { ItemCatalogo, LinhaGrupo } from '@/types/database.ts'

/**
 * Acesso a dados das comunidades.
 *
 * Toda escrita passa por RPC, nunca por `.insert()` ou `.update()` em
 * grupo_membros: o RLS de 0006 não tem policy para esses comandos justamente
 * porque as regras de quem-pode-o-quê moram nas funções de 0007. Se algum hook
 * daqui tentar gravar direto, o banco recusa — de propósito.
 */

function lancar(erro: unknown): never {
  throw new Error(mensagemDeErro(erro))
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** Catálogo de comunidades (nunca traz secretas). */
export function useCatalogo(termo: string): UseQueryResult<ItemCatalogo[]> {
  return useQuery({
    queryKey: chaves.catalogo_comunidades(termo),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('buscar_comunidades', {
        p_termo: termo,
        p_limite: 50,
      })
      if (error !== null) lancar(error)
      return data
    },
  })
}

export interface MinhaComunidade {
  readonly grupo: LinhaGrupo
  readonly papel: PapelComunidade
  readonly status: StatusMembro
}

/** Só as participações ATIVAS — convites pendentes vêm em useConvites(). */
export function useMinhasComunidades(usuarioId: string): UseQueryResult<MinhaComunidade[]> {
  return useQuery({
    queryKey: chaves.minhasComunidades(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grupo_membros')
        .select('papel, status, grupos!inner(*)')
        .eq('usuario_id', usuarioId)
        .eq('status', 'ativo')
      if (error !== null) lancar(error)

      return data.map((m) => ({
        grupo: m.grupos,
        papel: m.papel as PapelComunidade,
        status: m.status,
      }))
    },
  })
}

/** §Convites — o que espera resposta minha. */
export function useConvites(usuarioId: string): UseQueryResult<MinhaComunidade[]> {
  return useQuery({
    queryKey: chaves.convites(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grupo_membros')
        .select('papel, status, grupos!inner(*)')
        .eq('usuario_id', usuarioId)
        .eq('status', 'convidado')
      if (error !== null) lancar(error)

      return data.map((m) => ({
        grupo: m.grupos,
        papel: m.papel as PapelComunidade,
        status: m.status,
      }))
    },
  })
}

export function useComunidade(grupoId: string) {
  return useQuery({
    queryKey: chaves.comunidade(grupoId),
    enabled: grupoId !== '',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grupos')
        .select('*')
        .eq('id', grupoId)
        .single()
      if (error !== null) lancar(error)
      return data
    },
  })
}

export interface MembroDaComunidade {
  readonly usuarioId: string
  readonly nome: string
  readonly emoji: string
  readonly papel: PapelComunidade
  readonly status: StatusMembro
  readonly mensagem: string | null
}

/**
 * Membros da comunidade.
 *
 * Quem não é membro ativo recebe só a própria linha (RLS), e quem administra
 * recebe também os pendentes. A tela não precisa saber disso: o servidor já
 * devolve o recorte certo para cada um.
 *
 * O embed precisa nomear a constraint. `grupo_membros` tem DOIS caminhos até
 * `profiles` — `usuario_id` e `convidado_por` — e um `profiles(...)` solto faz
 * o PostgREST recusar a query inteira por ambiguidade, não escolher um. Sem o
 * nome, a lista voltava vazia e a tela concluía que ninguém era membro.
 */
export function useMembros(grupoId: string): UseQueryResult<MembroDaComunidade[]> {
  return useQuery({
    queryKey: chaves.membros(grupoId),
    enabled: grupoId !== '',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grupo_membros')
        .select(
          'usuario_id, papel, status, mensagem, perfil:profiles!grupo_membros_usuario_id_fkey(nome, emoji)',
        )
        .eq('grupo_id', grupoId)
      if (error !== null) lancar(error)

      return data.map((m) => {
        // O tipo gerado promete `perfil` sempre presente, porque usuario_id é
        // NOT NULL. Em runtime não é: sem `!inner` o embed é left join, e o
        // RLS de profiles esconde quem não é ativo nem tem pendência comigo —
        // um membro `recusado`, por exemplo. O PostgREST devolve null ali.
        //
        // O cast ALARGA o tipo em vez de estreitar: está admitindo que o
        // gerado mente, não silenciando um erro real.
        const perfil = m.perfil as { nome: string; emoji: string } | null

        return {
          usuarioId: m.usuario_id,
          nome: perfil?.nome ?? 'Alguém',
          emoji: perfil?.emoji ?? '👤',
          papel: m.papel as PapelComunidade,
          status: m.status,
          mensagem: m.mensagem,
        }
      })
    },
  })
}

/** Badge do menu: convites meus + solicitações que preciso responder. */
export function usePendencias(usuarioId: string) {
  return useQuery({
    queryKey: chaves.pendencias(usuarioId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contar_pendencias')
      if (error !== null) lancar(error)
      return data[0] ?? { convites: 0, solicitacoes: 0 }
    },
  })
}

// ---------------------------------------------------------------------------
// Escrita — sempre por RPC
// ---------------------------------------------------------------------------

/**
 * Virar membro ativo é o que liga as minhas disciplinas ao grupo.
 *
 * A RPC existe desde a 0006 e ninguém a chamava: o comentário do
 * `useInvalidarComunidades` abaixo dizia que entrar numa comunidade vinculava
 * as matrículas, mas nada vinculava. O efeito era o ranking geral somando
 * carga zero e empatando a turma inteira em 1º lugar.
 *
 * Falhar aqui não desfaz a entrada: a pessoa já é membro, e a tela de
 * disciplinas oferece o mesmo vínculo num botão. Derrubar a mutação inteira
 * mostraria um erro para quem acabou de entrar com sucesso.
 */
async function vincularDisciplinas(grupoId: string): Promise<void> {
  const { error } = await supabase.rpc('vincular_disciplinas_ao_grupo', { p_grupo_id: grupoId })
  if (error !== null) {
    console.warn('Não consegui vincular as disciplinas à turma:', mensagemDeErro(error))
  }
}

/** Invalida tudo que depende de participação: catálogo, minhas, badge, ranking. */
function useInvalidarComunidades(usuarioId: string) {
  const qc = useQueryClient()
  return (grupoId?: string) => {
    void qc.invalidateQueries({ queryKey: ['comunidades'] })
    void qc.invalidateQueries({ queryKey: chaves.grupos(usuarioId) })
    void qc.invalidateQueries({ queryKey: ['ranking'] })
    // Entrar numa comunidade vincula as matrículas ao grupo, então o painel
    // também muda.
    void qc.invalidateQueries({ queryKey: chaves.disciplinas(usuarioId) })
    if (grupoId !== undefined) {
      void qc.invalidateQueries({ queryKey: chaves.membros(grupoId) })
    }
  }
}

export interface NovaComunidade {
  readonly nome: string
  readonly visibilidade: Visibilidade
  readonly instituicao?: string | null
  readonly curso?: string | null
  readonly periodo?: string | null
  readonly turma?: string | null
  readonly descricao?: string | null
  readonly emoji?: string
}

export function useCriarComunidade(usuarioId: string) {
  const invalidar = useInvalidarComunidades(usuarioId)
  return useMutation({
    mutationFn: async (nova: NovaComunidade) => {
      const { data, error } = await supabase.rpc('criar_comunidade', {
        p_nome: nova.nome,
        p_visibilidade: nova.visibilidade,
        p_instituicao: nova.instituicao ?? null,
        p_curso: nova.curso ?? null,
        p_periodo: nova.periodo ?? null,
        p_turma: nova.turma ?? null,
        p_descricao: nova.descricao ?? null,
        p_emoji: nova.emoji ?? '🎓',
      })
      if (error !== null) lancar(error)
      await vincularDisciplinas(data)
      return data
    },
    onSuccess: (grupoId) => {
      invalidar(grupoId)
    },
  })
}

export function useSolicitarAcesso(usuarioId: string) {
  const invalidar = useInvalidarComunidades(usuarioId)
  return useMutation({
    mutationFn: async ({ grupoId, mensagem }: { grupoId: string; mensagem?: string }) => {
      const { data, error } = await supabase.rpc('solicitar_acesso', {
        p_grupo_id: grupoId,
        p_mensagem: mensagem ?? null,
      })
      if (error !== null) lancar(error)
      // Comunidade aberta entra na hora; fechada devolve 'solicitado' e ainda
      // não há vínculo a fazer.
      if (data === 'ativo') await vincularDisciplinas(grupoId)
      return data
    },
    onSuccess: (_r, v) => {
      invalidar(v.grupoId)
    },
  })
}

export function useResponderConvite(usuarioId: string) {
  const invalidar = useInvalidarComunidades(usuarioId)
  return useMutation({
    mutationFn: async ({ grupoId, aceitar }: { grupoId: string; aceitar: boolean }) => {
      const { data, error } = await supabase.rpc('responder_convite', {
        p_grupo_id: grupoId,
        p_aceitar: aceitar,
      })
      if (error !== null) lancar(error)
      if (data === 'ativo') await vincularDisciplinas(grupoId)
      return data
    },
    onSuccess: (_r, v) => {
      invalidar(v.grupoId)
    },
  })
}

/** A regra do curso que a turma responde por. Tudo anulável: null = não decide. */
export interface RegraDaTurma {
  readonly limite_reprovacao: number | null
  readonly faixa_verde: number | null
  readonly faixa_amarela: number | null
  readonly justificada_conta: boolean | null
}

/**
 * Define a regra do curso para a comunidade inteira.
 *
 * Escrita direta, e não RPC: a policy "comunidade: dono e admin editam" da
 * 0006 já governa o UPDATE em `grupos`, e uma função nova só repetiria a mesma
 * checagem. Mas RLS que recusa não dá erro — atualiza zero linhas em silêncio,
 * e a tela ficaria dizendo "salvo" sem ter salvado nada. Por isso o `select`:
 * é ele que transforma o silêncio numa mensagem.
 */
export function useSalvarRegraDaComunidade(usuarioId: string) {
  const invalidar = useInvalidarComunidades(usuarioId)
  return useMutation({
    mutationFn: async ({ grupoId, regra }: { grupoId: string; regra: RegraDaTurma }) => {
      const { data, error } = await supabase
        .from('grupos')
        .update(regra)
        .eq('id', grupoId)
        .select('id')
      if (error !== null) lancar(error)
      if (data.length === 0) {
        throw new Error('Só quem administra a comunidade pode definir a regra do curso.')
      }
    },
    onSuccess: (_r, v) => {
      invalidar(v.grupoId)
    },
  })
}

/**
 * Vira o semestre da turma.
 *
 * Só define o rótulo e avisa os membros — não apaga falta de ninguém. Quem
 * arquiva é cada um, em Relatórios, com os próprios dados na mão.
 */
export function useVirarSemestre(usuarioId: string) {
  const invalidar = useInvalidarComunidades(usuarioId)
  return useMutation({
    mutationFn: async ({
      grupoId,
      semestre,
      fim,
    }: {
      grupoId: string
      semestre: string
      fim: string | null
    }) => {
      const { data, error } = await supabase.rpc('virar_semestre_da_turma', {
        p_grupo_id: grupoId,
        p_semestre: semestre,
        p_fim: fim,
      })
      if (error !== null) lancar(error)
      return data
    },
    onSuccess: (_r, v) => {
      invalidar(v.grupoId)
    },
  })
}

export function useResponderSolicitacao(usuarioId: string) {
  const invalidar = useInvalidarComunidades(usuarioId)
  return useMutation({
    mutationFn: async ({
      grupoId,
      alvoId,
      aprovar,
    }: {
      grupoId: string
      alvoId: string
      aprovar: boolean
    }) => {
      const { error } = await supabase.rpc('responder_solicitacao', {
        p_grupo_id: grupoId,
        p_usuario_id: alvoId,
        p_aprovar: aprovar,
      })
      if (error !== null) lancar(error)
    },
    onSuccess: (_r, v) => {
      invalidar(v.grupoId)
    },
  })
}

export function useConvidar(usuarioId: string) {
  const invalidar = useInvalidarComunidades(usuarioId)
  return useMutation({
    mutationFn: async ({ grupoId, email }: { grupoId: string; email: string }) => {
      // Responde 'convidado' exista ou não a conta — ver 0007. A tela mostra a
      // mesma mensagem nos dois casos, senão o formulário viraria um
      // confirmador de quais e-mails têm conta.
      const { data, error } = await supabase.rpc('convidar_para_grupo', {
        p_grupo_id: grupoId,
        p_email: email,
      })
      if (error !== null) lancar(error)
      return data
    },
    onSuccess: (_r, v) => {
      invalidar(v.grupoId)
    },
  })
}

export function useRemoverMembro(usuarioId: string) {
  const invalidar = useInvalidarComunidades(usuarioId)
  return useMutation({
    mutationFn: async ({ grupoId, alvoId }: { grupoId: string; alvoId?: string }) => {
      const { error } = await supabase.rpc('remover_membro', {
        p_grupo_id: grupoId,
        p_usuario_id: alvoId ?? null,
      })
      if (error !== null) lancar(error)
    },
    onSuccess: (_r, v) => {
      invalidar(v.grupoId)
    },
  })
}

export function useDefinirPapel(usuarioId: string) {
  const invalidar = useInvalidarComunidades(usuarioId)
  return useMutation({
    mutationFn: async ({
      grupoId,
      alvoId,
      admin,
    }: {
      grupoId: string
      alvoId: string
      admin: boolean
    }) => {
      const { error } = await supabase.rpc('definir_papel', {
        p_grupo_id: grupoId,
        p_usuario_id: alvoId,
        p_admin: admin,
      })
      if (error !== null) lancar(error)
    },
    onSuccess: (_r, v) => {
      invalidar(v.grupoId)
    },
  })
}

export function useTransferirPropriedade(usuarioId: string) {
  const invalidar = useInvalidarComunidades(usuarioId)
  return useMutation({
    mutationFn: async ({ grupoId, novoDono }: { grupoId: string; novoDono: string }) => {
      const { error } = await supabase.rpc('transferir_propriedade', {
        p_grupo_id: grupoId,
        p_novo_dono: novoDono,
      })
      if (error !== null) lancar(error)
    },
    onSuccess: (_r, v) => {
      invalidar(v.grupoId)
    },
  })
}
