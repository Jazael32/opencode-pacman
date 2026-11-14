# SPEC 02 — Power pellets y modo frightened

> **Estado:** Aprovado
> **Depende de:** SPEC 01
> **Fecha:** 2026-11-13
> **Objetivo:** Cuatro power pellets en las esquinas del laberinto; al comer uno, los fantasmas se vuelven comibles (azules), huyen, parpadean blanco/azul al agotarse el efecto y vuelven a la pen como ojos cuando Pacman se los come.

## Alcance

**Dentro:**

- Leyenda del laberinto (`src/js/maze.js`): nuevo carácter `o` = power pellet (valor 4). Se colocan 4 en las **esquinas del arcade** (esquinas interiores): `(1,3)`, `(26,3)`, `(1,23)`, `(26,23)`, sustituyendo dots existentes. Se mantienen dimensiones y simetría vertical.
- Puntaje del pellet: **50** (el dot sigue valiendo 10). `dotsRemaining` cuenta dots y pellets; comer los 4 + todos los dots sigue ganando la partida.
- Modo frightened **global y superpuesto** al ciclo scatter/chase:
  - Al comer un pellet: `frightTimer = 360` frames (~6 s, arcade nivel 1) y `ghostChain = 0`. Los fantasmas activos invierten su dirección (como el arcade).
  - Si se come otro pellet durante el fright: se reinicia el timer y la cadena.
  - Mientras `frightTimer > 0`, el `modeTimer` del ciclo scatter/chase queda **pausado**; al terminar el fright se reanuda intacto.
- Fantasmas frightened (`src/js/game.js`): velocidad `0.05` (1/20 celda/frame, divisor exacto) y en los cruces eligen **dirección aleatoria** válida (sin reversa, salvo callejón).
- Comer fantasma (fright activo, fantasma no `eaten`): puntaje encadenado del arcade **200 → 400 → 800 → 1600** (se duplica por cada fantasma comido con el mismo pellet; reinicia con el pellet siguiente). El fantasma pasa a fase `eaten` (ojos).
- Retorno de ojos: fase `eaten` navega voraz (euclídea², mismo mecanismo del scatter) hacia `(13,11)`, luego fase `entering` baja por la puerta hasta `(13,14)`, y revive a fase `pen` con `releaseDelay = 0` (vuelve a salir de inmediato). Ojos a velocidad `0.2` (1/5 celda/frame, divisor exacto) y no colisionan con Pacman ni son comibles.
- Render (`src/js/render.js`):
  - Pellet: círculo grande (radio ~6, muy mayor que el dot) que **parpadea visible/invisible cada ~15 frames**, como el arcade.
  - Fantasma frightened: cuerpo **azul** `#2121de` con ojos blancos; en los últimos **120 frames** (~2 s) alterna cuerpo **azul ↔ blanco** cada 15 frames.
  - Fantasmas `eaten`/`entering`: se dibujan **solo los ojos**, sin cuerpo.
- `resetPositions` (tras perder vida): limpia `frightTimer` y `ghostChain`, restaura velocidades y rearma pen + escalonado como siempre.

**Fuera de alcance (futuras specs):**

- Duración de fright decreciente por nivel (no hay niveles).
- Puntaje flotante en pantalla al comer fantasma.
- Efectos del fright sobre el estado global (modo "eaten" congelando el ciclo scatter/chase del arcade real).
- Sonidos.
- La pen lenta del arcade o velocidad extra de Pacman durante el fright.

## Modelo de datos

```js
// maze.js — leyenda ampliada
//   '#' pared(1) · '.' dot(2) · ' ' transitable(0) · '-' puerta pen(3) · 'o' pellet(4)

// game.js — constantes nuevas
const FRIGHT_FRAMES = 360;   // ~6 s a ~60 fps
const FRIGHT_FLASH_AT = 120; // últimos ~2 s: parpadeo azul/blanco
const FRIGHT_SPEED = 0.05;   // 1/20 celda/frame
const EYES_SPEED = 0.2;      // 1/5 celda/frame

// game.js — estado nuevo global y por fantasma
game: {
  frightTimer: 0,   // frames restantes de fright; 0 = modo normal
  ghostChain: 0,    // fantasmas comidos con el pellet actual (0..3)
}
ghost: {
  phase: 'pen' | 'leaving' | 'active' | 'eaten' | 'entering',
  // speed cambia entre 0.1 (normal), 0.05 (fright) y 0.2 (ojos)
}
```

Convenciones: coordenadas en celdas, tiempos en frames (~60 fps), velocidades que dividen 1 celda en pasos exactos (restricción de `aligned()`).

## Plan de implementación

1. **`src/js/maze.js`**: añadir `o` a `parseTile` (→ 4) y sustituir el `.` por `o` en las 4 celdas esquina. Verificar 31 strings de 28 chars y simetría.
2. **`src/js/game.js` — conteo y estado**: `dotsRemaining` cuenta `2` y `4`; `createGame` añade `frightTimer: 0` y `ghostChain: 0`.
3. **`src/js/game.js` — comer pellet** en `movePacman`: celda 4 → `score += 50`, `dotsRemaining--`, `frightTimer = FRIGHT_FRAMES`, `ghostChain = 0`, invertir dirección de los fantasmas activos.
4. **`src/js/game.js` — fright** en `update`: decrementar `frightTimer`; mientras sea > 0, no decrementar `modeTimer` (pausa del ciclo scatter/chase). `decideGhost`: con fright activo y fase `active`, elegir dirección aleatoria válida; velocidades por fase (`active` fright → `0.05`).
5. **`src/js/game.js` — comer fantasma y ojos**: en el chequeo de colisiones, fright activo + fantasma no `eaten`/`entering` → `score += 200 << ghostChain`, `ghostChain++`, fase `eaten`, velocidad `EYES_SPEED`. Nueva `moveEaten` (voraz a `(13,11)`) y secuencia `entering` (bajar por la puerta hasta `(13,14)`, luego `pen` con `releaseDelay = 0`).
6. **`src/js/game.js` — reinicios**: `resetPositions` limpia fright y restaura velocidades/fases.
7. **`src/js/render.js`**: `drawDots` dibuja también las celdas 4 (parpadeo por frame); `drawGhost` con variantes frightened (azul, flash azul/blanco) y ojos sin cuerpo.

## Criterios de aceptación

- [ ] La consola no muestra errores al abrir `src/index.html`.
- [ ] El maze conserva 31 strings de 28 chars, simetría vertical y extremos del túnel abiertos.
- [ ] Se ven 4 pellets grandes parpadeando en las esquinas interiores `(1,3)`, `(26,3)`, `(1,23)`, `(26,23)`; cada uno vale 50 puntos.
- [ ] Al comer un pellet los fantasmas activos invierten dirección y se ponen azules.
- [ ] Fantasmas frightened huyen y no matan a Pacman al contacto; comérselos da 200/400/800/1600 según la cadena.
- [ ] El fantasma comido vuelve como ojos, cruza la puerta, revive en la pen y vuelve a salir.
- [ ] En los últimos ~2 s de fright los fantasmas parpadean azul/blanco; al agotarse vuelven a su color y comportamiento.
- [ ] El ciclo scatter/chase no pierde tiempo durante el fright (se reanuda donde estaba).
- [ ] Perder una vida limpia el fright y repite el escalonado de la pen igual que al inicio.
- [ ] La partida se gana solo tras comer dots y pellets (279 ítems: 275 dots + 4 pellets), no solo los dots.

## Decisiones

- **Sí:** posiciones del arcade `(1,3)`, `(26,3)`, `(1,23)`, `(26,23)` en vez de las esquinas extremas del mapa. Son las del nivel 1 original y cumplen "cuatro esquinas" (interiores).
- **Sí:** cadena 200/400/800/1600. Es el puntaje arcade; trivial de expresar con `200 << ghostChain`.
- **Sí:** fright de 6 s con parpadeo en los últimos 2 s (arcade nivel 1).
- **Sí:** `modeTimer` pausado durante el fright. Alternativa (reloj global sin pausa) haría que un pellet al final del chase "robara" el periodo; la pausa es lo más fiel al arcade.
- **Sí:** movimiento aleatorio de los frightened (como el arcade: giro aleatorio en cada cruce), no huida directa. Con steering voraz hacia la celda más lejana de Pacman quedaría demasiado predecible.
- **Sí:** velocidades `0.05` (fright) y `0.2` (ojos): ambas dividen 1 celda en pasos exactos, respetando `aligned()` sin tocarla.
- **Sí:** retorno como ojos con fases nuevas `eaten`/`entering` (SPEC 01 lo dejaba fuera: "no hay muerte de fantasma sin frightened"; ahora la hay).
- **Sí:** pellets parpadean visible/invisible cada ~15 frames, como el arcade (los dots no).
- **Sí:** el laberinto heredado de SPEC 01 tiene 276 dots (275 útiles + celda inicial de Pacman), no los 240 del arcade: el total de ítems para ganar es **279** (275 dots + 4 pellets), no 244. Se corrige el criterio de aceptación en consecuencia; recortar el laberinto al dot exacto del arcade queda fuera de alcance.
- **No:** niveles ni fright decreciente por nivel: no hay sistema de niveles aún.
- **No:** puntaje flotante (el número sobre el fantasma comido): cosmético del arcade, va aparte.
- **No:** extra speed de Pacman durante el fright: no aporta verificablemente y toca la restricción de velocidades.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El steering voraz de los ojos podría ciclar antes de llegar a la puerta | Ya se probó en SPEC 01 con euclídea² (los 4 alcanzan su esquina); los ojos van 4 veces más rápido y el objetivo es fijo. Si cicla, se amarra con objetivo intermedio. |
| Cambiar `speed` por fase puede desincronizar el snapping con `aligned()` | Solo se usan `0.1`, `0.05` y `0.2`: los tres dividen 1 celda en pasos exactos. Los cambios se aplican alineando primero el fantasma (mismo punto de corte que las demás transiciones de fase). |
| Pellet comido a la vez que Pacman pierde vida | El chequeo de colisiones va después de mover a Pacman: si muere, `resetPositions` limpia el fright; el pellet ya comido no se devuelve (igual que el arcade). |
| Un fantasma `eaten` revive dentro de la pen mientras otro está en `leaving` | `moveLeaving` ya funciona por fantasma (secuencia col 13 → subir); el revive usa `releaseDelay = 0` e idéntica secuencia, sin colisión entre fantasmas (nunca la hubo). |

## Lo que **no** está en esta spec

- Niveles y fright decreciente.
- Puntaje flotante al comer fantasma.
- Sonidos.

Cada uno de esos, si llega, va en su propia spec.
