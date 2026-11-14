# SPEC 01 — Cuatro fantasmas con personalidades clásicas

> **Estado:** Implementado
> **Depende de:** (ninguno - spec inicial)
> **Fecha:** 2026-11-13
> **Objetivo:** Cuatro fantasmas con las personalidades clásicas del arcade (Blinky persigue agresivamente a Pacman), con alternancia chase/scatter y salida escalonada de la pen.

## Alcance

**Dentro:**

- Ampliar `GHOST_STARTS` (`src/js/maze.js`) de 2 a 4 fantasmas con `kind`: `blinky`, `pinky`, `inky`, `clyde` (reemplazan a los `hunter`/`random` actuales).
- Añadir `SCATTER_TARGETS` en `src/js/maze.js`: una esquina del laberinto por fantasma.
- IA diferenciada por `kind` en `decideGhost` (`src/js/game.js`):
  - **blinky** (agresivo): apunta a la celda de Pacman.
  - **pinky**: apunta 4 celdas delante de Pacman según su dirección actual.
  - **inky**: punto flanqueado — vector desde blinky hasta 2 celdas delante de Pacman, duplicado.
  - **clyde**: si dista >8 celdas (Manhattan) de Pacman, persigue como blinky; si está a ≤8, apunta a su esquina scatter.
- Modo global de fantasmas con alternancia por tiempo: ciclo repetido de **7 s scatter → 20 s chase**. Al cambiar de modo, cada fantasma activo invierte su dirección.
- Salida escalonada de la pen por tiempo: **blinky inicia fuera de la pen** (sobre la puerta); pinky, inky y clyde salen con 2 s de diferencia entre cada uno.
- Máquina de estados por fantasma: `pen` (rebota arriba/abajo dentro de la pen) → `leaving` (secuencia de salida: centrarse en la columna 13 y subir por la puerta) → `active` (IA normal).
- Render (`src/js/render.js`): color fijo por `kind` — blinky rojo `#ff0000`, pinky rosa `#ffb8ff`, inky cian `#00ffff`, clyde naranja `#ffb852`.
- `resetPositions` rearma la pen y los retardos de salida tras perder una vida.

**Fuera de alcance (futuras specs):**

- Modo frightened (fantasmas comibles) y power pellets.
- Cambios de modo por dots comidos (solo tiempo, sin los "dot counters" del arcade).
- Velocidades distintas entre fantasmas o por zona (túnel lento del arcade).
- Fantasmas regresando a la pen como ojos (no hay muerte de fantasma sin frightened).

## Modelo de datos

```js
// maze.js — reemplaza las 2 entradas actuales
const GHOST_STARTS = [
  { x: 13, y: 11, kind: 'blinky' }, // fuera de la pen, junto a la puerta
  { x: 13, y: 14, kind: 'pinky' },  // dentro de la pen (interior cols 11-16, filas 13-15)
  { x: 12, y: 14, kind: 'inky' },
  { x: 15, y: 14, kind: 'clyde' },
];
const SCATTER_TARGETS = {
  blinky: { x: 26, y: 1 },  // esquina sup. derecha
  pinky:  { x: 1,  y: 1 },  // esquina sup. izquierda
  inky:   { x: 26, y: 29 }, // esquina inf. derecha
  clyde:  { x: 1,  y: 29 }, // esquina inf. izquierda
};

// game.js — estado nuevo por ghost y global
ghost: {
  x, y, dir, speed: 0.1, kind,
  phase: 'pen' | 'leaving' | 'active',
  releaseDelay: 0 | 120 | 240 | 360, // frames (~2 s a 60 fps)
}
game: {
  ghostMode: 'scatter' | 'chase',
  modeTimer: 420 | 1200, // frames restantes del modo actual
}
```

Convenciones: coordenadas en celdas, origen arriba-izquierda. Retardos y periodos en frames (asumiendo ~60 fps de `requestAnimationFrame`).

## Plan de implementación

1. **`src/js/maze.js`**: reemplazar `GHOST_STARTS` por las 4 entradas y añadir `SCATTER_TARGETS` (exportado a `window`). El juego sigue corriendo: los 4 fantasmas se mueven con la IA aleatoria existente.
2. **`src/js/game.js`** — pen y salida: añadir `phase` y `releaseDelay` por fantasma; rebote vertical dentro de la pen mientras `pen`; secuencia `leaving` (align a col 13, subir hasta fila 11); al llegar, `phase = 'active'`. Manual: blinky activo de inmediato; los otros 3 salen escalonados.
3. **`src/js/game.js`** — personalidades: reescribir `decideGhost` con los 4 objetivos de chase (blinky/pinky/inky/clyde) usando steering voraz por distancia euclídea al cuadrado (como el arcade; Manhattan empata en el túnel y cicla a los fantasmas). Inky usa la posición de blinky tal cual (aunque esté en la pen). Manual: cada fantasma corta el paso de forma distinta.
4. **`src/js/game.js`** — modos: `ghostMode` + `modeTimer` en `createGame`; en scatter cada fantasma apunta a su `SCATTER_TARGETS`; al agotar el timer, alternar modo e invertir dirección de los activos. Incluir rearme en `resetPositions`.
5. **`src/js/render.js`**: `GHOST_COLORS` pasa de índice a `kind` (mapa fijo por fantasma).

## Criterios de aceptación

- [x] La consola no muestra errores al abrir `src/index.html`.
- [x] Se ven 4 fantasmas simultáneos con colores fijos: rojo, rosa, cian y naranja.
- [x] Blinky está activo apenas inicia la partida; pinky, inky y clyde salen de la pen escalonados (~2 s entre cada uno).
- [x] En modo scatter los 4 se dirigen a su esquina; en modo chase aplican su personalidad.
- [x] Pinky corta el paso por delante de Pacman, no sigue su estela.
- [x] El rumbo de inky cambia si blinky se mueve (flanqueo), no solo si se mueve Pacman.
- [x] Clyde huye a su esquina al acercarse a ≤8 celdas de Pacman y persigue a distancia mayor.
- [x] Ningún fantasma invierte dirección salvo en callejón, cambio de modo o salida de la pen.
- [x] Perder una vida devuelve los 4 fantasmas a la pen y el escalonado se repite igual que al inicio.
- [x] Ningún fantasma atraviesa paredes; solo cruzan la puerta (valor 3).
- [x] Tras reiniciar una partida terminada (won/lost), la configuración de fantasmas es idéntica.

## Decisiones

- **Sí:** personalidades clásicas del arcade. Probadas, diferenciadas y verificables a simple vista.
- **Sí:** ciclo fijo 7 s scatter / 20 s chase repetido. El arcade encadena periodos decrecientes (7-20-7-20-5-20-5-∞); se simplifica a ciclo constante.
- **Sí:** blinky inicia fuera de la pen (como el arcade); el resto sale por tiempo, no por dots.
- **Sí:** velocidad uniforme `GHOST_SPEED = 0.1` respeta la restricción de `aligned()` sin tocarla.
- **Sí (enmienda durante la verificación):** steering voraz por **distancia euclídea al cuadrado** en vez de Manhattan. Con Manhattan, los empates del túnel y de la puerta meten a los fantasmas en ciclos (pinky loop túnel/fila 11, inky loop pen↔puerta) y no llegan a su esquina scatter; el arcade real usa euclídea al cuadrado. Verificado: con euclídea los 4 alcanzan su esquina.
- **Sí (enmienda durante la verificación):** la puerta (3) bloquea también a los fantasmas activos; solo se cruza saliendo de la pen. Sin esto, los activos reentran a la pen (120 cruces en 9000 frames) e inky se cicla dentro.
- **Sí (enmienda durante la verificación):** pen con rebote corto (y entre 13.5 y 14.5), centrado en la col 13 durante la espera y normalización a y=14 al expirar el retardo. Así la salida tarda exactamente `delay+32` frames y el escalonado es de 2 s exactos (pinky/inky/clyde), al inicio y tras perder vida.
- **Sí:** temporización por frames (~60 fps). Coherente con el resto del juego, que ya es frame-based.
- **No:** frightened/power pellets. Requiere ítems nuevos en el maze; merece su propia spec.
- **No:** reproducir los bugs históricos de pinky/inky (overflow al mirar arriba). Se especifica la intención original.
- **No:** túnel lento ni velocidades por fantasma. Rompería el snapping si no se eligen pasos exactos, y no aporta a la diferenciación.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `requestAnimationFrame` no garantiza 60 fps (pantallas 120/144 Hz acelerarían ciclos y salidas) | Aceptado para el MVP: todo el juego ya es frame-based. Si se corrige, será global en otra spec. |
| Cuatro IA voraces pueden acorralar a Pacman en el nivel 1 | La alternancia scatter obliga a los 4 a retirarse periódicamente. |
| Inky depende de blinky; con blinky en la pen el flanqueo se degrada | Se usa la posición de blinky tal cual; el caso dura <2 s al inicio de cada vida. |

## Lo que **no** está en esta spec

- Frightened y power pellets.
- Cambios de modo por dots comidos.
- Velocidades distintas por fantasma o por zona (túnel lento).

Cada uno de esos, si llega, va en su propia spec.
