// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS, SCATTER_TARGETS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame

// Salida escalonada de la pen por tiempo (frames a ~60 fps): 2 s entre cada uno.
// Blinky no sale por tiempo al iniciar (ya esta fuera), pero tras perder una
// vida vuelve a la pen y sale primero (delay 0).
const RELEASE_DELAYS = { blinky: 0, pinky: 120, inky: 240, clyde: 360 };

// Posiciones dentro de la pen (interior cols 11-16, filas 13-15) para el
// rearme tras perder una vida: los 4 fantasmas vuelven a la pen.
const PEN_STARTS = {
  blinky: { x: 14, y: 14 },
  pinky:  { x: 13, y: 14 },
  inky:   { x: 12, y: 14 },
  clyde:  { x: 15, y: 14 },
};

// Ciclo de modos global por tiempo: 7 s scatter -> 20 s chase, repetido.
const SCATTER_FRAMES = 420;  // ~7 s
const CHASE_FRAMES = 1200;   // ~20 s

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: dots,
    grid,
    ghostMode: 'scatter',
    modeTimer: SCATTER_FRAMES,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( g ) => ( {
      x: g.x,
      y: g.y,
      // Blinky mira a la izquierda al inicio (arriba tiene pared); el resto,
      // dentro de la pen, mira arriba para el rebote.
      dir: g.kind === 'blinky' ? 'left' : 'up',
      speed: GHOST_SPEED,
      kind: g.kind,
      phase: g.kind === 'blinky' ? 'active' : 'pen',
      releaseDelay: RELEASE_DELAYS[ g.kind ],
    } ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado solo por pared (1)
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 && actor === 'pacman' ) return true;
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot.
    if ( grid[ p.y ][ p.x ] === 2 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += 10;
      game.dotsRemaining--;
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

// Celda objetivo de cada fantasma segun su personalidad (modo chase).
function chaseTarget( game, g ) {
  const p = game.pacman;
  const px = Math.round( p.x );
  const py = Math.round( p.y );

  if ( g.kind === 'blinky' ) {
    // Agresivo: apunta a la celda de Pacman.
    return { x: px, y: py };
  }

  if ( g.kind === 'pinky' ) {
    // Corta el paso: 4 celdas delante de Pacman segun su direccion actual.
    const d = DIRS[ p.dir ];
    return { x: px + 4 * d.x, y: py + 4 * d.y };
  }

  if ( g.kind === 'inky' ) {
    // Flanqueo: punto 2 celdas delante de Pacman; se duplica el vector desde
    // blinky hasta ese punto (posicion de blinky tal cual, este o no en la pen).
    const d = DIRS[ p.dir ];
    const ax = px + 2 * d.x;
    const ay = py + 2 * d.y;
    const b = game.ghosts.find( ( o ) => o.kind === 'blinky' );
    const bx = Math.round( b ? b.x : px );
    const by = Math.round( b ? b.y : py );
    return { x: 2 * ax - bx, y: 2 * ay - by };
  }

  // clyde: persigue a distancia (>8 celdas Manhattan); cerca, huye a su esquina.
  const dist = Math.abs( Math.round( g.x ) - px ) + Math.abs( Math.round( g.y ) - py );
  if ( dist > 8 ) return { x: px, y: py };
  return SCATTER_TARGETS[ g.kind ];
}

function decideGhost( game, g ) {
  const grid = game.grid;

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ '' + OPPOSITE[ g.dir ] ];

  // Steering voraz por distancia Manhattan hacia el objetivo, igual que el
  // hunter original. En scatter todos apuntan a su esquina.
  const t = game.ghostMode === 'scatter' ? SCATTER_TARGETS[ g.kind ] : chaseTarget( game, g );
  let best = choices[ 0 ];
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const nx = g.x + d.x;
    const ny = g.y + d.y;
    const dist = Math.abs( nx - t.x ) + Math.abs( ny - t.y );
    if ( dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  g.dir = best;
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    decideGhost( game, g );
    if ( !canMove( grid, g.x, g.y, g.dir, 'ghost' ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

// Rebote vertical dentro de la pen entre las filas 13 y 15 (interior ' ').
function bounceInPen( g ) {
  const d = DIRS[ g.dir ]; // solo 'up' o 'down'
  g.y += d.y * g.speed;
  if ( g.dir === 'up' && g.y <= 13 ) {
    g.y = 13;
    g.dir = 'down';
  } else if ( g.dir === 'down' && g.y >= 15 ) {
    g.y = 15;
    g.dir = 'up';
  }
}

// Secuencia de salida de la pen: centrarse en la columna 13 y subir por la
// puerta (fila 12) hasta la fila 11. Al llegar, el fantasma queda activo.
const LEAVE_COL = 13;
const LEAVE_ROW = 11;

function moveLeaving( g ) {
  const dx = LEAVE_COL - g.x;
  if ( Math.abs( dx ) > 1e-3 ) {
    g.dir = dx > 0 ? 'right' : 'left';
    g.x += Math.sign( dx ) * Math.min( g.speed, Math.abs( dx ) );
    return;
  }
  g.x = LEAVE_COL;
  const dy = LEAVE_ROW - g.y;
  if ( Math.abs( dy ) > 1e-3 ) {
    g.dir = 'up';
    g.y += Math.sign( dy ) * Math.min( g.speed, Math.abs( dy ) );
    return;
  }
  g.y = LEAVE_ROW;
  g.dir = 'left'; // sale mirando a la izquierda, como en el arcade
  g.phase = 'active';
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  // Los 4 fantasmas vuelven a la pen y el escalonado se repite igual que al
  // inicio (blinky primero, luego 2 s entre cada uno). El ciclo de modos
  // tambien se rearma: scatter 7 s -> chase 20 s.
  game.ghosts.forEach( ( g ) => {
    const ps = PEN_STARTS[ g.kind ];
    g.x = ps.x;
    g.y = ps.y;
    g.dir = 'up';
    g.phase = 'pen';
    g.releaseDelay = RELEASE_DELAYS[ g.kind ];
  } );
  game.ghostMode = 'scatter';
  game.modeTimer = SCATTER_FRAMES;
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  movePacman( game );

  // Modo global: al agotar el timer, alternar scatter/chase e invertir la
  // direccion de los fantasmas activos.
  game.modeTimer--;
  if ( game.modeTimer <= 0 ) {
    game.ghostMode = game.ghostMode === 'scatter' ? 'chase' : 'scatter';
    game.modeTimer = game.ghostMode === 'scatter' ? SCATTER_FRAMES : CHASE_FRAMES;
    for ( const g of game.ghosts ) {
      if ( g.phase === 'active' ) g.dir = OPPOSITE[ g.dir ];
    }
  }

  for ( const g of game.ghosts ) {
    if ( g.phase === 'pen' ) {
      // Rebota y cuenta su retardo; al llegar a 0 pasa a 'leaving'.
      if ( g.releaseDelay > 0 ) {
        g.releaseDelay--;
        bounceInPen( g );
      } else {
        g.phase = 'leaving';
      }
    } else if ( g.phase === 'leaving' ) {
      moveLeaving( g );
    } else {
      moveGhost( game, g );
    }
  }

  for ( const g of game.ghosts ) {
    if ( collides( game.pacman, g ) ) {
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
