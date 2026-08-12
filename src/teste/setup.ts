/**
 * Setup do Vitest.
 *
 * O grosso dos testes é sobre src/domain — TypeScript puro, sem DOM, rodando
 * em ambiente node. Só os testes de componente pedem jsdom, e esses declaram
 * `// @vitest-environment jsdom` na primeira linha do arquivo.
 *
 * O subpath /vitest do jest-dom já registra os matchers no expect global;
 * fazer isso em ambiente node é inofensivo (eles só seriam usados com DOM).
 */
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(() => {
    cleanup()
  })
}
