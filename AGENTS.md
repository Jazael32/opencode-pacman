# AGENTS.md

Pac-Man MVP en vanilla JS (HTML + CSS + canvas). Sin build, sin npm, sin tests: correr abriendo `src/index.html` en el navegador (o un static server apuntando a `src/`).

## Arquitectura

Cuatro scripts sueltos cargados en orden estricto por `src/index.html` (maze → game → render → main). **No usan ES modules**: se comunican vía globals de `window` (`MAZE`, `TUNNEL_ROW`, `PACMAN_START`, `GHOST_STARTS`, `DIRS`, `createGame`, `update`, `draw`). No añadir `type="module"` ni `import` sin migrar todo el acoplamiento a la vez.

- `maze.js` — datos: laberinto, posiciones iniciales.
- `game.js` — estado y reglas (`createGame`, `update`).
- `render.js` — dibujo (`draw`, usa `game.grid`, **no** `MAZE`).
- `main.js` — bucle `requestAnimationFrame`, teclado y overlays.

## Restricciones que no se ven a simple vista

- **Laberinto**: `MAZE_STR` son exactamente 31 strings de 28 chars. Leyenda: `#` pared(1), `.` dot(2), ` ` transitable(0), `-` puerta de la pen(3, fantasmas sí pasan, Pacman no). Al editar el maze: mantener dimensiones, simetría vertical y que el túnel de la fila 14 tenga los extremos abiertos. `MAZE` es pristino — `createGame` lo copia a `game.grid`; nunca mutar `MAZE` directamente.
- **Movimiento**: la lógica de `aligned()` asume velocidades que dividen 1 celda en pasos exactos (`PACMAN_SPEED = 0.125`, `GHOST_SPEED = 0.1`). Cambiar las velocidades rompe el snapping a celdas y el flujo por el túnel (`wrapTunnel`).
- **Canvas**: `TILE = 20` en `render.js`; el canvas de `index.html` (560×620) está acoplado a `28×31 celdas × TILE`.

## Convenciones

- Todo el proyecto (comentarios, UI, README) está en **español** — mantener el idioma en cambios nuevos.
- README: el proyecto es un ejercicio de **Spec Driven Development**; los cambios de comportamiento se especifican antes de implementarse.
