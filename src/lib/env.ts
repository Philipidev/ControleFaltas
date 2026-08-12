import { z } from 'zod'

/**
 * Variáveis de ambiente validadas na carga do módulo.
 *
 * O app não explode se o Supabase ainda não estiver configurado: `configurado`
 * fica false e a UI mostra uma tela de setup explicando o que falta. Vale mais
 * que uma tela branca com erro de rede no console — especialmente enquanto o
 * projeto Supabase ainda está sendo criado.
 */
const esquema = z.object({
  VITE_SUPABASE_URL: z.url().optional().or(z.literal('')),
  VITE_SUPABASE_ANON_KEY: z.string().optional(),
})

const bruto = esquema.safeParse(import.meta.env)

const url = bruto.success ? (bruto.data.VITE_SUPABASE_URL ?? '') : ''
const anonKey = bruto.success ? (bruto.data.VITE_SUPABASE_ANON_KEY ?? '') : ''

export const env = {
  supabaseUrl: url,
  supabaseAnonKey: anonKey,
  /** true quando as duas variáveis existem e a URL é válida. */
  configurado: url.length > 0 && anonKey.length > 0,
  /** Erros de formato, para a tela de setup dizer o que exatamente está errado. */
  problemas: bruto.success
    ? []
    : bruto.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
} as const
