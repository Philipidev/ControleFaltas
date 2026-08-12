import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/types/database.ts'
import { env } from './env.ts'

export type ClienteSupabase = SupabaseClient<Database>

/**
 * Client único do app, tipado com o schema de src/types/database.ts.
 *
 * Nenhuma tela importa este módulo direto — tudo passa por src/data/. Isso
 * mantém o acesso a dados num lugar só e deixa os componentes testáveis sem
 * rede.
 *
 * A anon key vai para o bundle e isso é esperado: quem protege os dados são as
 * policies RLS da migration 0003, não o segredo da chave.
 */
export const supabase: ClienteSupabase = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'cf:auth',
    },
    global: {
      headers: { 'x-application-name': 'controle-faltas' },
    },
  },
)

/**
 * Traduz erros do Postgres para o que o usuário precisa ler.
 *
 * As mensagens de RAISE EXCEPTION das migrations já vêm em português e são
 * boas — o trabalho aqui é não deixar vazar jargão de banco quando o erro é
 * de constraint.
 */
export function mensagemDeErro(erro: unknown): string {
  if (typeof erro !== 'object' || erro === null) {
    return 'Algo deu errado. Tente de novo.'
  }

  const e = erro as { code?: string; message?: string; details?: string }
  const msg = e.message ?? ''

  // 23505 = unique_violation → única que pode estourar no fluxo normal
  if (e.code === '23505') {
    if (msg.includes('faltas_usuario_id_disciplina_id_data_key')) {
      return 'Você já registrou uma falta nessa disciplina nesse dia.'
    }
    return 'Esse registro já existe.'
  }

  if (e.code === '42501') {
    return msg || 'Você não tem permissão para isso.'
  }

  // P0001 = RAISE EXCEPTION dos nossos triggers: mensagem já é para humano
  if (e.code === 'P0001' && msg) {
    return msg
  }

  return msg || 'Algo deu errado. Tente de novo.'
}
