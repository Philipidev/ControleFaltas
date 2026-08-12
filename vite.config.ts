import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// Build 100% estático: `vite build` gera arquivos que sobem em qualquer CDN.
// Não há processo de servidor — o backend é o Supabase hospedado.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // §7.4: o "widget" possível na web — ícone instalável, atalhos no
      // long-press e badge numérico. Configurado por completo na Fase 7.
      manifest: {
        name: 'Controle de Faltas',
        short_name: 'Faltas',
        description:
          'Registre faltas por disciplina, veja o risco de reprovação e compare presença com a turma.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0b12',
        theme_color: '#f97316',
        categories: ['education', 'productivity'],
        icons: [
          { src: '/icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icone-mascara.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Marcar falta',
            short_name: 'Marcar',
            description: 'Registrar uma falta agora',
            url: '/faltas/nova',
          },
          {
            name: 'Meu risco',
            short_name: 'Risco',
            description: 'Ver o semáforo das disciplinas',
            url: '/',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // service worker fora do dev: evita cache atrapalhando o HMR
        enabled: false,
      },
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  server: {
    port: 5173,
    open: false,
  },

  build: {
    target: 'es2022',
    sourcemap: true,
  },

  test: {
    // O domínio (src/domain) é TypeScript puro, sem React e sem rede:
    // roda em ambiente node. Os testes de componente pedem jsdom e declaram
    // `// @vitest-environment jsdom` no topo do arquivo.
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/teste/setup.ts'],
  },
})
