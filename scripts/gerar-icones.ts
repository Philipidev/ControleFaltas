/**
 * Gera os PNGs do ícone do app a partir da mesma geometria dos SVGs.
 *
 *   npm run icones
 *
 * Por que existe: o iOS **só aceita PNG** em `apple-touch-icon`. Enquanto o
 * link apontava para SVG, o iPhone punha um ícone genérico na tela de início —
 * e o SVG do manifest, embora o Chrome aceite, não serve para splash screen
 * nem para todo launcher Android.
 *
 * Escrito em Node puro (só `node:zlib`) em vez de usar sharp/canvas: a forma
 * são quatro retângulos arredondados, o rasterizador cabe em cem linhas, e
 * assim o ícone é reproduzível em qualquer máquina — sem binário nativo, sem
 * abrir navegador. O antialiasing vem de supersampling 4×4 por pixel.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

// ---------------------------------------------------------------------------
// Geometria — os mesmos números de public/icone.svg, em viewBox 512×512
// ---------------------------------------------------------------------------

interface Retangulo {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly r: number
  readonly cor: readonly [number, number, number]
  readonly alfa: number
}

const BRANCO = [255, 255, 255] as const

/** Ícone normal: fundo em degradê laranja + medidor. */
const NORMAL: readonly Retangulo[] = [
  { x: 88, y: 228, w: 336, h: 56, r: 28, cor: BRANCO, alfa: 0.32 }, // trilha
  { x: 88, y: 228, w: 212, h: 56, r: 28, cor: BRANCO, alfa: 1 }, // preenchimento
  { x: 348, y: 212, w: 10, h: 88, r: 5, cor: BRANCO, alfa: 0.85 }, // marca do limite
]

/**
 * Versão maskable: o Android recorta em círculo, squircle ou gota, comendo até
 * 20% de cada borda. O fundo sangra até a borda e o desenho fica na zona
 * segura central.
 */
const MASCARA: readonly Retangulo[] = [
  { x: 128, y: 236, w: 256, h: 40, r: 20, cor: BRANCO, alfa: 0.34 },
  { x: 128, y: 236, w: 160, h: 40, r: 20, cor: BRANCO, alfa: 1 },
  { x: 320, y: 224, w: 9, h: 64, r: 4.5, cor: BRANCO, alfa: 0.85 },
]

const LARANJA_CLARO = [251, 146, 60] as const // #fb923c
const LARANJA_ESCURO = [234, 88, 12] as const // #ea580c

/** Distância com sinal até um retângulo arredondado. Negativa = dentro. */
function distancia(px: number, py: number, r: Retangulo): number {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const qx = Math.abs(px - cx) - (r.w / 2 - r.r)
  const qy = Math.abs(py - cy) - (r.h / 2 - r.r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r.r
}

const AMOSTRAS = 4 // 4×4 subamostras por pixel

interface Variante {
  readonly arquivo: string
  readonly tamanho: number
  /**
   * Raio do fundo. 0 faz o fundo sangrar até a borda, para quando é o próprio
   * sistema que recorta o ícone (maskable do Android, squircle do iOS).
   */
  readonly raioFundo: number
  readonly formas: readonly Retangulo[]
  /** Fundo chapado em vez do degradê. */
  readonly chapado: boolean
}

function desenhar(v: Variante): Buffer {
  const { tamanho } = v
  const escala = 512 / tamanho
  const pixels = Buffer.alloc(tamanho * tamanho * 4)

  const fundo: Retangulo = {
    x: 0,
    y: 0,
    w: 512,
    h: 512,
    r: v.raioFundo,
    cor: LARANJA_ESCURO,
    alfa: 1,
  }
  const formas = v.formas
  const maskable = v.chapado

  for (let py = 0; py < tamanho; py += 1) {
    for (let px = 0; px < tamanho; px += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < AMOSTRAS; sy += 1) {
        for (let sx = 0; sx < AMOSTRAS; sx += 1) {
          // centro da subamostra, em coordenadas do viewBox
          const vx = (px + (sx + 0.5) / AMOSTRAS) * escala
          const vy = (py + (sy + 0.5) / AMOSTRAS) * escala

          let cr = 0
          let cg = 0
          let cb = 0
          let ca = 0

          if (distancia(vx, vy, fundo) < 0) {
            if (maskable) {
              cr = LARANJA_ESCURO[0]
              cg = LARANJA_ESCURO[1]
              cb = LARANJA_ESCURO[2]
            } else {
              // degradê vertical claro → escuro
              const t = vy / 512
              cr = LARANJA_CLARO[0] + (LARANJA_ESCURO[0] - LARANJA_CLARO[0]) * t
              cg = LARANJA_CLARO[1] + (LARANJA_ESCURO[1] - LARANJA_CLARO[1]) * t
              cb = LARANJA_CLARO[2] + (LARANJA_ESCURO[2] - LARANJA_CLARO[2]) * t
            }
            ca = 1
          }

          // Formas por cima, compostas em ordem (source-over)
          for (const forma of formas) {
            if (distancia(vx, vy, forma) < 0) {
              cr = cr * (1 - forma.alfa) + forma.cor[0] * forma.alfa
              cg = cg * (1 - forma.alfa) + forma.cor[1] * forma.alfa
              cb = cb * (1 - forma.alfa) + forma.cor[2] * forma.alfa
              ca = ca * (1 - forma.alfa) + forma.alfa
            }
          }

          r += cr
          g += cg
          b += cb
          a += ca
        }
      }

      const n = AMOSTRAS * AMOSTRAS
      const i = (py * tamanho + px) * 4
      pixels[i] = Math.round(r / n)
      pixels[i + 1] = Math.round(g / n)
      pixels[i + 2] = Math.round(b / n)
      pixels[i + 3] = Math.round((a / n) * 255)
    }
  }

  return pixels
}

// ---------------------------------------------------------------------------
// Escrita do PNG
// ---------------------------------------------------------------------------

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const byte of buf) c = (TABELA_CRC[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function bloco(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4)
  tamanho.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([tamanho, corpo, crc])
}

function paraPng(tamanho: number, pixels: Buffer): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tamanho, 0)
  ihdr.writeUInt32BE(tamanho, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  // Cada linha leva um byte de filtro (0 = nenhum) antes dos pixels.
  const linhas = Buffer.alloc(tamanho * (tamanho * 4 + 1))
  for (let y = 0; y < tamanho; y += 1) {
    const origem = y * tamanho * 4
    const destino = y * (tamanho * 4 + 1)
    linhas[destino] = 0
    pixels.copy(linhas, destino + 1, origem, origem + tamanho * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------

const SAIDAS: readonly Variante[] = [
  {
    // 180 é o tamanho que o iOS usa no apple-touch-icon desde o iPhone 6 Plus.
    //
    // raioFundo 0 e não 128: o iOS aplica o próprio squircle por cima. Se o
    // PNG já viesse arredondado, os cantos transparentes cairiam DENTRO da
    // máscara do sistema — e o iOS compõe transparência sobre preto, deixando
    // quatro lascas escuras na borda do ícone. Quadrado e opaco, o recorte
    // fica só com o sistema.
    arquivo: 'public/apple-touch-icon.png',
    tamanho: 180,
    raioFundo: 0,
    formas: NORMAL,
    chapado: false,
  },
  {
    arquivo: 'public/icone-192.png',
    tamanho: 192,
    raioFundo: 128,
    formas: NORMAL,
    chapado: false,
  },
  {
    arquivo: 'public/icone-512.png',
    tamanho: 512,
    raioFundo: 128,
    formas: NORMAL,
    chapado: false,
  },
  {
    // Nome em português para casar com icone-mascara.svg — e, sobretudo, com o
    // que o manifest em vite.config.ts referencia. Divergir aqui deixaria o
    // manifest apontando para um arquivo que este script não regenera.
    arquivo: 'public/icone-mascara-512.png',
    tamanho: 512,
    raioFundo: 0,
    formas: MASCARA,
    chapado: true,
  },
]

for (const s of SAIDAS) {
  const png = paraPng(s.tamanho, desenhar(s))
  writeFileSync(s.arquivo, png)
  console.log(`${s.arquivo.padEnd(34)} ${String(s.tamanho)}px  ${String(png.length)} bytes`)
}

console.log('\nÍcones gerados.')
