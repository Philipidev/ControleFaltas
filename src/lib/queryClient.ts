import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Faltas mudam quando a pessoa marca uma, não sozinhas. Um minuto de
      // frescor evita refetch a cada troca de tela sem deixar dado velho.
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: (tentativas, erro) => {
        // Erro de permissão não melhora tentando de novo.
        const msg = erro instanceof Error ? erro.message : ''
        if (msg.includes('permissão') || msg.includes('Não autenticado')) return false
        return tentativas < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})
