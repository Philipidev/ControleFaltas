/**
 * Tipos do banco — espelho fiel de supabase/migrations/0001..0005.
 *
 * Escrito à mão no MESMO formato que `supabase gen types typescript` produz,
 * para que a regeneração seja um diff legível e não uma reescrita:
 *
 *     npm run db:types
 *
 * Duas coisas aqui não são óbvias e são de propósito:
 *
 * 1. `faltas.Insert.horas_perdidas` é OPCIONAL. É a §3 da spec expressa em
 *    tipo: o cliente manda disciplina + data, e o trigger trg_falta_horas
 *    preenche as horas a partir da grade. Se este campo fosse obrigatório, o
 *    tipo estaria convidando a UI a inventar um número.
 *
 * 2. `faltas.prazo_justificativa` não existe em Insert nem em Update. É coluna
 *    GENERATED ALWAYS — o banco calcula, ninguém escreve.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          nome: string
          avatar_url: string | null
          emoji: string
          role: Database['public']['Enums']['user_role']
          curso: string | null
          periodo: string | null
          turma: string | null
          onboarding_concluido: boolean
          criado_em: string
          atualizado_em: string
        }
        Insert: {
          id: string
          nome?: string
          avatar_url?: string | null
          emoji?: string
          role?: Database['public']['Enums']['user_role']
          curso?: string | null
          periodo?: string | null
          turma?: string | null
          onboarding_concluido?: boolean
          criado_em?: string
          atualizado_em?: string
        }
        Update: {
          id?: string
          nome?: string
          avatar_url?: string | null
          emoji?: string
          /** Protegido por trg_protege_role: só admin altera. */
          role?: Database['public']['Enums']['user_role']
          curso?: string | null
          periodo?: string | null
          turma?: string | null
          onboarding_concluido?: boolean
          atualizado_em?: string
        }
        Relationships: []
      }

      grupos: {
        Row: {
          id: string
          nome: string
          tipo: Database['public']['Enums']['grupo_tipo']
          /** publica: entra na hora · fechada: aprovação · secreta: só por código. */
          visibilidade: Database['public']['Enums']['visibilidade_grupo']
          instituicao: string | null
          descricao: string | null
          emoji: string
          arquivada: boolean
          curso: string | null
          periodo: string | null
          turma: string | null
          codigo_convite: string
          criado_por: string | null
          criado_em: string
          /**
           * 0013 — a regra do curso, para todas as disciplinas vinculadas a
           * esta comunidade. NULL significa "não decido isto": a cascata
           * segue para a configuração pessoal e daí para o padrão.
           */
          limite_reprovacao: number | null
          faixa_verde: number | null
          faixa_amarela: number | null
          justificada_conta: boolean | null
          /** 0014 — o período letivo corrente, ex: '2026.2'. NULL = a turma não diz. */
          semestre: string | null
          fim_do_semestre: string | null
        }
        Insert: {
          id?: string
          nome: string
          tipo?: Database['public']['Enums']['grupo_tipo']
          visibilidade?: Database['public']['Enums']['visibilidade_grupo']
          instituicao?: string | null
          descricao?: string | null
          emoji?: string
          arquivada?: boolean
          curso?: string | null
          periodo?: string | null
          turma?: string | null
          codigo_convite?: string
          criado_por?: string | null
          criado_em?: string
          limite_reprovacao?: number | null
          faixa_verde?: number | null
          faixa_amarela?: number | null
          justificada_conta?: boolean | null
          semestre?: string | null
          fim_do_semestre?: string | null
        }
        Update: {
          nome?: string
          tipo?: Database['public']['Enums']['grupo_tipo']
          visibilidade?: Database['public']['Enums']['visibilidade_grupo']
          instituicao?: string | null
          descricao?: string | null
          emoji?: string
          arquivada?: boolean
          curso?: string | null
          periodo?: string | null
          turma?: string | null
          codigo_convite?: string
          criado_por?: string | null
          limite_reprovacao?: number | null
          faixa_verde?: number | null
          faixa_amarela?: number | null
          justificada_conta?: boolean | null
          semestre?: string | null
          fim_do_semestre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'grupos_criado_por_fkey'
            columns: ['criado_por']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      grupo_membros: {
        Row: {
          grupo_id: string
          usuario_id: string
          /** 'dono' | 'admin' | 'membro' */
          papel: string
          /**
           * SÓ 'ativo' conta como membro. Ver o cabeçalho de
           * 0006_comunidades.sql: um pendente que conte como membro vaza a
           * lista de membros, os perfis e o ranking.
           */
          status: Database['public']['Enums']['status_membro']
          convidado_por: string | null
          /** Texto que a pessoa escreveu ao solicitar acesso. */
          mensagem: string | null
          respondido_em: string | null
          entrou_em: string
        }
        /**
         * INSERT e UPDATE estão FECHADOS por RLS — não há policy para eles.
         * Toda transição de status passa pelas RPCs de 0007. Os tipos abaixo
         * existem só para o seed, que roda com a secret key.
         */
        Insert: {
          grupo_id: string
          usuario_id: string
          papel?: string
          status?: Database['public']['Enums']['status_membro']
          convidado_por?: string | null
          mensagem?: string | null
          entrou_em?: string
        }
        Update: {
          papel?: string
          status?: Database['public']['Enums']['status_membro']
          respondido_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'grupo_membros_grupo_id_fkey'
            columns: ['grupo_id']
            referencedRelation: 'grupos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'grupo_membros_usuario_id_fkey'
            columns: ['usuario_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      disciplinas: {
        Row: {
          id: string
          nome: string
          codigo: string | null
          curso: string
          periodo: string
          turma: string | null
          semestre: string
          carga_horaria_total: number
          cor: string
          criado_por: string | null
          personalizada: boolean
          ativa: boolean
          criado_em: string
          atualizado_em: string
          /**
           * 0013 — o nível mais específico da regra do curso. NULL = herda da
           * comunidade. Preenchido só quando esta disciplina foge da regra
           * geral (estágio, por exemplo).
           */
          limite_reprovacao: number | null
          justificada_conta: boolean | null
        }
        Insert: {
          id?: string
          nome: string
          codigo?: string | null
          curso: string
          periodo: string
          turma?: string | null
          semestre: string
          carga_horaria_total: number
          cor?: string
          criado_por?: string | null
          personalizada?: boolean
          ativa?: boolean
          limite_reprovacao?: number | null
          justificada_conta?: boolean | null
        }
        Update: {
          nome?: string
          codigo?: string | null
          curso?: string
          periodo?: string
          turma?: string | null
          semestre?: string
          carga_horaria_total?: number
          cor?: string
          ativa?: boolean
          limite_reprovacao?: number | null
          justificada_conta?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: 'disciplinas_criado_por_fkey'
            columns: ['criado_por']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      disciplina_grade: {
        Row: {
          id: string
          disciplina_id: string
          /** Convenção EXTRACT(DOW) do Postgres: 0=domingo … 6=sábado. */
          dia_semana: number
          horas: number
          /** 'HH:MM:SS'. Null = horário desconhecido; só a exportação usa. */
          hora_inicio: string | null
        }
        Insert: {
          id?: string
          disciplina_id: string
          dia_semana: number
          horas: number
          hora_inicio?: string | null
        }
        Update: {
          dia_semana?: number
          horas?: number
          hora_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'disciplina_grade_disciplina_id_fkey'
            columns: ['disciplina_id']
            referencedRelation: 'disciplinas'
            referencedColumns: ['id']
          },
        ]
      }

      matriculas: {
        Row: {
          id: string
          usuario_id: string
          disciplina_id: string
          grupo_id: string | null
          ativa: boolean
          criado_em: string
        }
        Insert: {
          id?: string
          usuario_id: string
          disciplina_id: string
          grupo_id?: string | null
          ativa?: boolean
        }
        Update: {
          grupo_id?: string | null
          ativa?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'matriculas_disciplina_id_fkey'
            columns: ['disciplina_id']
            referencedRelation: 'disciplinas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'matriculas_grupo_id_fkey'
            columns: ['grupo_id']
            referencedRelation: 'grupos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'matriculas_usuario_id_fkey'
            columns: ['usuario_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      faltas: {
        Row: {
          id: string
          usuario_id: string
          disciplina_id: string
          /** date no formato ISO 'YYYY-MM-DD' (sem fuso — é um dia de aula). */
          data: string
          horas_perdidas: number
          justificada: boolean
          data_envio_atestado: string | null
          anexo_path: string | null
          observacao: string | null
          horas_manuais: boolean
          criado_em: string
          atualizado_em: string
          /** GENERATED: data + 7 dias. Só leitura. */
          prazo_justificativa: string
        }
        Insert: {
          id?: string
          usuario_id: string
          disciplina_id: string
          data: string
          /**
           * §3 — deixe de fora. O trigger preenche a partir da grade semanal.
           * Só informe junto com `horas_manuais: true` (reposição/aula extra).
           */
          horas_perdidas?: number
          justificada?: boolean
          data_envio_atestado?: string | null
          anexo_path?: string | null
          observacao?: string | null
          horas_manuais?: boolean
        }
        Update: {
          data?: string
          horas_perdidas?: number
          /** §7.1 — o banco recusa se já passou de data + 7 dias. */
          justificada?: boolean
          data_envio_atestado?: string | null
          anexo_path?: string | null
          observacao?: string | null
          horas_manuais?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'faltas_disciplina_id_fkey'
            columns: ['disciplina_id']
            referencedRelation: 'disciplinas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'faltas_usuario_id_fkey'
            columns: ['usuario_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      configuracoes: {
        Row: {
          usuario_id: string
          limite_reprovacao: number
          faixa_verde: number
          faixa_amarela: number
          justificada_conta: boolean
          justificada_quebra_streak: boolean
          tema: string
          modo: string
          densidade: string
          notificacoes: Json
          atualizado_em: string
        }
        Insert: {
          usuario_id: string
          limite_reprovacao?: number
          faixa_verde?: number
          faixa_amarela?: number
          justificada_conta?: boolean
          justificada_quebra_streak?: boolean
          tema?: string
          modo?: string
          densidade?: string
          notificacoes?: Json
        }
        Update: {
          limite_reprovacao?: number
          faixa_verde?: number
          faixa_amarela?: number
          justificada_conta?: boolean
          justificada_quebra_streak?: boolean
          tema?: string
          modo?: string
          densidade?: string
          notificacoes?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'configuracoes_usuario_id_fkey'
            columns: ['usuario_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      notificacoes: {
        Row: {
          id: string
          usuario_id: string
          tipo: Database['public']['Enums']['notificacao_tipo']
          titulo: string
          corpo: string
          disciplina_id: string | null
          dados: Json
          lida: boolean
          criado_em: string
        }
        Insert: {
          id?: string
          usuario_id: string
          tipo: Database['public']['Enums']['notificacao_tipo']
          titulo: string
          corpo?: string
          disciplina_id?: string | null
          dados?: Json
          lida?: boolean
        }
        Update: {
          lida?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'notificacoes_disciplina_id_fkey'
            columns: ['disciplina_id']
            referencedRelation: 'disciplinas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notificacoes_usuario_id_fkey'
            columns: ['usuario_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }

      /** §Comunidades — convite feito antes de a pessoa ter conta. */
      grupo_convites_email: {
        Row: {
          id: string
          grupo_id: string
          email: string
          convidado_por: string | null
          criado_em: string
        }
        Insert: {
          id?: string
          grupo_id: string
          email: string
          convidado_por?: string | null
        }
        Update: Record<string, never>
        Relationships: [
          {
            foreignKeyName: 'grupo_convites_email_grupo_id_fkey'
            columns: ['grupo_id']
            referencedRelation: 'grupos'
            referencedColumns: ['id']
          },
        ]
      }

      historico_semestres: {
        Row: {
          id: string
          usuario_id: string
          semestre: string
          snapshot: Json
          arquivado_em: string
        }
        Insert: {
          id?: string
          usuario_id: string
          semestre: string
          snapshot: Json
        }
        Update: {
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'historico_semestres_usuario_id_fkey'
            columns: ['usuario_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }

    Views: {
      /**
       * §7.2/§8 — tudo que o dashboard precisa, já calculado.
       * security_invoker = true: o RLS de `faltas` vale dentro da view, então
       * ela já vem filtrada no usuário logado.
       */
      v_disciplina_status: {
        Row: {
          usuario_id: string
          disciplina_id: string
          nome: string
          cor: string
          curso: string
          periodo: string
          turma: string | null
          semestre: string
          personalizada: boolean
          carga_horaria_total: number
          grupo_id: string | null
          total_faltado: number
          total_justificado: number
          qtd_faltas: number
          qtd_justificadas: number
          /** 0..1 — multiplique por 100 para exibir. */
          percentual: number
          horas_limite: number
          horas_restantes: number
          status: Database['public']['Enums']['status_risco']
          /** 0013 — qual nível da cascata decidiu o limite desta disciplina. */
          origem_do_limite: 'disciplina' | 'comunidade' | 'usuario' | 'padrao'
        }
        Relationships: []
      }
    }

    Functions: {
      /**
       * §5 — devolve APENAS a colocação. Nenhum percentual, hora ou faixa.
       * Retorna vazio se o grupo tiver menos de 3 membros.
       */
      get_group_ranking: {
        Args: { p_grupo_id: string; p_disciplina_id?: string | null }
        Returns: {
          usuario_id: string
          nome: string
          avatar_url: string | null
          emoji: string
          posicao: number
          eh_voce: boolean
        }[]
      }

      /** §6 — "quantas faltas na semana, em quais disciplinas". */
      get_resumo_semanal: {
        Args: { p_referencia?: string }
        Returns: {
          inicio_semana: string
          fim_semana: string
          total_faltas: number
          total_horas: number
          disciplinas: Json
        }[]
      }

      entrar_no_grupo: {
        Args: { p_codigo: string }
        Returns: string
      }

      // ---- Comunidades ------------------------------------------------------
      // Toda transição de status vive aqui: grupo_membros não aceita INSERT
      // nem UPDATE do cliente.

      criar_comunidade: {
        Args: {
          p_nome: string
          p_visibilidade?: Database['public']['Enums']['visibilidade_grupo']
          p_instituicao?: string | null
          p_curso?: string | null
          p_periodo?: string | null
          p_turma?: string | null
          p_descricao?: string | null
          p_emoji?: string | null
        }
        Returns: string
      }

      /** Catálogo. Nunca devolve comunidade secreta, nem nada vindo de faltas. */
      buscar_comunidades: {
        Args: { p_termo?: string; p_limite?: number }
        Returns: {
          id: string
          nome: string
          emoji: string
          instituicao: string | null
          curso: string | null
          periodo: string | null
          turma: string | null
          descricao: string | null
          visibilidade: Database['public']['Enums']['visibilidade_grupo']
          membros: number
          meu_status: Database['public']['Enums']['status_membro'] | null
          meu_papel: string | null
        }[]
      }

      solicitar_acesso: {
        Args: { p_grupo_id: string; p_mensagem?: string | null }
        Returns: Database['public']['Enums']['status_membro']
      }

      responder_solicitacao: {
        Args: { p_grupo_id: string; p_usuario_id: string; p_aprovar: boolean }
        Returns: Database['public']['Enums']['status_membro']
      }

      /** Responde 'convidado' exista ou não a conta — ver 0007. */
      convidar_para_grupo: {
        Args: { p_grupo_id: string; p_email: string }
        Returns: string
      }

      responder_convite: {
        Args: { p_grupo_id: string; p_aceitar: boolean }
        Returns: Database['public']['Enums']['status_membro']
      }

      remover_membro: {
        Args: { p_grupo_id: string; p_usuario_id?: string | null }
        Returns: undefined
      }

      transferir_propriedade: {
        Args: { p_grupo_id: string; p_novo_dono: string }
        Returns: undefined
      }

      definir_papel: {
        Args: { p_grupo_id: string; p_usuario_id: string; p_admin: boolean }
        Returns: undefined
      }

      vincular_disciplinas_ao_grupo: {
        Args: { p_grupo_id: string }
        Returns: number
      }

      /** 0014 — define o semestre da turma e avisa os membros. Devolve quantos. */
      virar_semestre_da_turma: {
        Args: { p_grupo_id: string; p_semestre: string; p_fim?: string | null }
        Returns: number
      }

      contar_pendencias: {
        Args: Record<string, never>
        Returns: { convites: number; solicitacoes: number }[]
      }

      eh_admin_do_grupo: {
        Args: { p_grupo_id: string }
        Returns: boolean
      }

      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }

      eh_membro_do_grupo: {
        Args: { p_grupo_id: string }
        Returns: boolean
      }

      compartilha_grupo: {
        Args: { p_outro: string }
        Returns: boolean
      }
    }

    Enums: {
      user_role: 'aluno' | 'admin'
      grupo_tipo: 'turma' | 'amigos'
      /** 'reprovado' é adição ao spec: acima do limite não é risco, é fato. */
      status_risco: 'verde' | 'amarelo' | 'vermelho' | 'reprovado'
      /** Só 'ativo' conta como membro em qualquer lugar do sistema. */
      status_membro: 'ativo' | 'convidado' | 'solicitado' | 'recusado'
      visibilidade_grupo: 'publica' | 'fechada' | 'secreta'
      notificacao_tipo:
        | 'faixa_alterada'
        | 'aviso_preventivo'
        | 'resumo_semanal'
        | 'prazo_atestado'
        | 'streak'
        | 'convite_grupo'
        | 'solicitacao_grupo'
        | 'resposta_grupo'
        | 'virada_semestre'
    }

    CompositeTypes: Record<string, never>
  }
}

// ---------------------------------------------------------------------------
// Atalhos usados pelo resto do app
// ---------------------------------------------------------------------------
type PublicSchema = Database['public']

export type Tabelas<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row']

export type Insercao<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert']

export type Atualizacao<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update']

export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]

export type StatusRisco = Enums<'status_risco'>
export type PapelUsuario = Enums<'user_role'>
export type TipoGrupo = Enums<'grupo_tipo'>
export type TipoNotificacao = Enums<'notificacao_tipo'>
export type StatusMembro = Enums<'status_membro'>
export type VisibilidadeGrupo = Enums<'visibilidade_grupo'>

export type LinhaProfile = Tabelas<'profiles'>
export type LinhaDisciplina = Tabelas<'disciplinas'>
export type LinhaGrade = Tabelas<'disciplina_grade'>
export type LinhaMatricula = Tabelas<'matriculas'>
export type LinhaFalta = Tabelas<'faltas'>
export type LinhaConfiguracoes = Tabelas<'configuracoes'>
export type LinhaNotificacao = Tabelas<'notificacoes'>
export type LinhaGrupo = Tabelas<'grupos'>
export type LinhaGrupoMembro = Tabelas<'grupo_membros'>

export type ItemCatalogo =
  PublicSchema['Functions']['buscar_comunidades']['Returns'][number]
export type Pendencias =
  PublicSchema['Functions']['contar_pendencias']['Returns'][number]

export type DisciplinaStatus = PublicSchema['Views']['v_disciplina_status']['Row']
export type ItemRanking = PublicSchema['Functions']['get_group_ranking']['Returns'][number]
export type ResumoSemanal = PublicSchema['Functions']['get_resumo_semanal']['Returns'][number]
