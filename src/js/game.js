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
  blinky: { x: 13, y: 14 }, // centrado bajo la puerta: sale en 32 frames exactos
  pinky:  { x: 14, y: 14 }, // se centra en la col 13 mientras espera
  inky:   { x: 12, y: 14 },
  clyde:  { x: 15, y: 14 },
};

// Ciclo de modos global por tiempo: 7 s scatter -> 20 s chase, repetido.
const SCATTER_FRAMES = 420;  // ~7 s
const CHASE_FRAMES = 1200;   // ~20 s

// Fright (modo comible) global: duracion y ventana de parpadeo (frames ~60 fps).
const FRIGHT_FRAMES = 360;   // ~6 s (nivel 1 arcade)
const FRIGHT_FLASH_AT = 120; // ultimos ~2 s: parpadeo azul/blanco
const FRIGHT_SPEED = 0.05;   // 1/20 celda/frame (divide 1 en pasos exactos)
const EYES_SPEED = 0.2;      // 1/5 celda/frame (divide 1 en pasos exactos)

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let items = 0;
  for ( const row of grid ) for ( const v of row ) if ( v === 2 || v === 4 ) items++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    dotsRemaining: items,
    grid,
    // Fright global: frames restantes del efecto (0 = modo normal) y cadena de
    // fantasmas comidos con el pellet actual (0..3).
    frightTimer: 0,
    ghostChain: 0,
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
//   ghost:  bloqueado por pared (1) y tambien por la puerta (3): solo se cruza
//           saliendo de la pen (moveLeaving no usa canMove), asi los fantasmas
//           activos no reentran a la pen.
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 ) return true;
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
    // Comer dot o pellet. El pellet activa el fright global: reinicia el timer
    // y la cadena, e invierte la direccion de los fantasmas activos (arcade).
    const cell = grid[ p.y ][ p.x ];
    if ( cell === 2 || cell === 4 ) {
      grid[ p.y ][ p.x ] = 0;
      game.score += cell === 4 ? 50 : 10;
      game.dotsRemaining--;
      if ( cell === 4 ) {
        game.frightTimer = FRIGHT_FRAMES;
        game.ghostChain = 0;
        for ( const g of game.ghosts ) {
          if ( g.phase === 'active' ) g.dir = OPPOSITE[ g.dir ];
        }
      }
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

// Velocidad del fantasma segun fase y estado de fright. Los cambios de
// velocidad solo se aplican en celda alineada (moveGhost rearma g.speed en
// cada cruce) para no desincronizar el snapping de aligned(): mezclar pasos
// de 0.1 y 0.05 a mitad de celda puede saltarse el centro exacto.
function ghostSpeed( game, g ) {
  if ( g.phase === 'active' ) {
    return game.frightTimer > 0 ? FRIGHT_SPEED : GHOST_SPEED;
  }
  return GHOST_SPEED;
}

// Voraz euclidea^2 entre choices hacia target (compartido por scatter/chase
// y por los ojos; Manhattan empata en el tunel y cicla a los fantasmas).
function greedyDir( grid, g, choices, target ) {
  let best = choices[ 0 ];
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const nx = g.x + d.x;
    const ny = g.y + d.y;
    const dist = ( nx - target.x ) * ( nx - target.x ) + ( ny - target.y ) * ( ny - target.y );
    if ( dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  return best;
}

function decideGhost( game, g ) {
  const grid = game.grid;

  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ '' + OPPOSITE[ g.dir ] ];

  // Fright: direccion aleatoria valida en cada cruce (sin reversa salvo
  // callejon), como el arcade.
  if ( game.frightTimer > 0 ) {
    g.dir = choices[ Math.floor( Math.random() * choices.length ) ];
    return;
  }

  // Steering voraz por distancia euclidea al cuadrado hacia el objetivo.
  // En scatter todos apuntan a su esquina.
  const t = game.ghostMode === 'scatter' ? SCATTER_TARGETS[ g.kind ] : chaseTarget( game, g );
  g.dir = greedyDir( grid, g, choices, t );
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    g.speed = ghostSpeed( game, g ); // cambio de velocidad solo en celda
    decideGhost( game, g );
    if ( !canMove( grid, g.x, g.y, g.dir, 'ghost' ) ) return;
  }

  const d = DIRS[ g.dir ];
  g.x += d.x * g.speed;
  g.y += d.y * g.speed;
  wrapTunnel( g, width );
}

// Rebote vertical corto dentro de la pen (y entre 13.5 y 14.5, interior ' ').
function bounceInPen( g ) {
  const d = DIRS[ g.dir ]; // solo 'up' o 'down'
  g.y += d.y * g.speed;
  if ( g.dir === 'up' && g.y <= 13.5 ) {
    g.y = 13.5;
    g.dir = 'down';
  } else if ( g.dir === 'down' && g.y >= 14.5 ) {
    g.y = 14.5;
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

// --- Ojos (fase eaten) y retorno a la pen (fase entering) ---

// Celda sobre la puerta, destino de los ojos.
const EYES_TARGET = { x: 13, y: 11 };
// Fondo de la pen: donde revive el fantasma comido.
const ENTER_TARGET = { x: 13, y: 14 };
// Multiplo comun de 0.05/0.1/0.2: los ojos avanzan en sub-pasos de 0.05 para
// que el cambio a EYES_SPEED a mitad de celda (la colision no espera al
// cruce) nunca salte un centro de celda y desincronice aligned().
const EYES_SUBSTEP = 0.05; // EYES_SPEED 0.2 = 4 sub-pasos por frame

// Decision voraz de los ojos hacia la celda sobre la puerta (mismo mecanismo
// euclidea^2 del scatter, con objetivo fijo).
function decideEaten( game, g ) {
  const grid = game.grid;
  const options = Object.keys( DIRS ).filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, 'ghost' )
  );
  const choices = options.length ? options : [ '' + OPPOSITE[ g.dir ] ];
  g.dir = greedyDir( grid, g, choices, EYES_TARGET );
}

function moveEaten( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  for ( let i = 0; i < 4; i++ ) {
    if ( aligned( g.x ) && aligned( g.y ) ) {
      g.x = Math.round( g.x );
      g.y = Math.round( g.y );
      // Llego a la puerta: pasa a entrar en la pen.
      if ( g.x === EYES_TARGET.x && g.y === EYES_TARGET.y ) {
        g.phase = 'entering';
        g.dir = 'down';
        return;
      }
      decideEaten( game, g );
      if ( !canMove( grid, g.x, g.y, g.dir, 'ghost' ) ) return;
    }
    const d = DIRS[ g.dir ];
    g.x += d.x * EYES_SUBSTEP;
    g.y += d.y * EYES_SUBSTEP;
    wrapTunnel( g, width );
  }
}

// Entrada a la pen por la puerta: bajar desde (13,11) hasta (13,14). Al
// llegar revive en la pen con releaseDelay 0 (vuelve a salir de inmediato).
function moveEntering( g ) {
  const dy = ENTER_TARGET.y - g.y;
  if ( Math.abs( dy ) > 1e-3 ) {
    g.dir = 'down';
    g.y += Math.sign( dy ) * Math.min( g.speed, Math.abs( dy ) );
    return;
  }
  g.y = ENTER_TARGET.y;
  g.phase = 'pen';
  g.releaseDelay = 0;
  g.dir = 'up';           // rebote/salida igual que el resto
  g.speed = GHOST_SPEED;  // deja la velocidad de ojos
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  // Los 4 fantasmas vuelven a la pen y el escalonado se repite igual que al
  // inicio (blinky primero, luego 2 s entre cada uno). El ciclo de modos
  // tambien se rearma: scatter 7 s -> chase 20 s. Se limpia el fright (timer,
  // cadena y velocidades: un fantasma comido no revive como ojos).
  game.ghosts.forEach( ( g ) => {
    const ps = PEN_STARTS[ g.kind ];
    g.x = ps.x;
    g.y = ps.y;
    g.dir = 'up';
    g.phase = 'pen';
    g.releaseDelay = RELEASE_DELAYS[ g.kind ];
    g.speed = GHOST_SPEED;
  } );
  game.frightTimer = 0;
  game.ghostChain = 0;
  game.ghostMode = 'scatter';
  game.modeTimer = SCATTER_FRAMES;
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

function update( game ) {
  movePacman( game );

  // Modo global: al agotar el timer, alternar scatter/chase e invertir la
  // direccion de los fantasmas activos. Durante el fright el timer del ciclo
  // queda pausado: al terminar se reanuda donde estaba (arcade).
  if ( game.frightTimer > 0 ) {
    game.frightTimer--;
  } else {
    game.modeTimer--;
    if ( game.modeTimer <= 0 ) {
      game.ghostMode = game.ghostMode === 'scatter' ? 'chase' : 'scatter';
      game.modeTimer = game.ghostMode === 'scatter' ? SCATTER_FRAMES : CHASE_FRAMES;
      for ( const g of game.ghosts ) {
        if ( g.phase === 'active' ) g.dir = OPPOSITE[ g.dir ];
      }
    }
  }

  for ( const g of game.ghosts ) {
    if ( g.phase === 'pen' ) {
      // Cuenta su retardo: mientras espera se centra en la col 13 y rebota.
      // Al llegar a 0 se normaliza al centro (y=14) y pasa a 'leaving', de
      // modo que la salida tarda exactamente delay+32 frames y el escalonado
      // queda en 2 s exactos entre cada uno.
      if ( g.releaseDelay > 0 ) {
        g.releaseDelay--;
        const dxc = LEAVE_COL - g.x;
        if ( Math.abs( dxc ) > 1e-3 ) {
          g.dir = dxc > 0 ? 'right' : 'left';
          g.x += Math.sign( dxc ) * Math.min( g.speed, Math.abs( dxc ) );
        } else {
          bounceInPen( g );
        }
      } else {
        g.y = 14;
        g.dir = 'up';
        g.phase = 'leaving';
      }
    } else if ( g.phase === 'leaving' ) {
      moveLeaving( g );
    } else if ( g.phase === 'eaten' ) {
      moveEaten( game, g );
    } else if ( g.phase === 'entering' ) {
      moveEntering( g );
    } else {
      moveGhost( game, g );
    }
  }

  for ( const g of game.ghosts ) {
    if ( !collides( game.pacman, g ) ) continue;
    // Ojos (y pen/leaving): no colisionan con Pacman ni son comibles.
    if ( g.phase !== 'active' ) continue;
    if ( game.frightTimer > 0 ) {
      // Comer fantasma: puntaje encadenado del arcade 200/400/800/1600
      // (se reinicia con cada pellet). El fantasma pasa a ojos.
      game.score += 200 << game.ghostChain;
      game.ghostChain++;
      g.phase = 'eaten';
      g.speed = EYES_SPEED;
    } else {
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
window.FRIGHT_FLASH_AT = FRIGHT_FLASH_AT; // la usa render.js para el flash
