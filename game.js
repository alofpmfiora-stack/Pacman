const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 20;
const COLS = 28;
const ROWS = 31;

// 0: empty, 1: wall, 2: dot, 3: powerup, 4: ghost door
const mapLayout = [
    "1111111111111111111111111111",
    "1222222222222112222222222221",
    "1211112111112112111112111121",
    "1311112111112112111112111131",
    "1211112111112112111112111121",
    "1222222222222222222222222221",
    "1211112112111111112112111121",
    "1211112112111111112112111121",
    "1222222112222112222112222221",
    "1111112111110110111112111111",
    "0000012111110110111112100000",
    "0000012110000000000112100000",
    "0000012110111441110112100000",
    "1111112110100000010112111111",
    "0000002000100000010002000000",
    "1111112110100000010112111111",
    "0000012110111111110112100000",
    "0000012110000000000112100000",
    "0000012110111111110112100000",
    "1111112110111111110112111111",
    "1222222222222112222222222221",
    "1211112111112112111112111121",
    "1211112111112112111112111121",
    "1322112222222002222222112231",
    "1112112112111111112112112111",
    "1112112112111111112112112111",
    "1222222112222112222112222221",
    "1211111111112112111111111121",
    "1211111111112112111111111121",
    "1222222222222222222222222221",
    "1111111111111111111111111111"
];

let map = [];
let dotsTotal = 0;
let score = 0;
let highScore = 0;
let lives = 3;
let currentLevel = 1;
let gameOver = false;
let gameWon = false;
let powerModeTimer = 0;
let floatingTexts = [];

let animationId;
let lastTime = 0;
let sirenFlash = false;
let sirenTimer = 0;

// Entities
let player;
let ghosts = [];

// Input
let nextDir = { x: 0, y: 0 };

const GHOST_COLORS = ['#ff0000', '#ffb8ff', '#00ffff', '#ffb852', '#00ff00'];

function initMap() {
    map = [];
    dotsTotal = 0;
    for (let r = 0; r < ROWS; r++) {
        let row = [];
        for (let c = 0; c < COLS; c++) {
            let val = parseInt(mapLayout[r][c]);
            row.push(val);
            if (val === 2 || val === 3) dotsTotal++;
        }
        map.push(row);
    }
}

class Entity {
    constructor(c, r, speed) {
        this.c = c;
        this.r = r;
        this.x = c * TILE_SIZE + TILE_SIZE / 2;
        this.y = r * TILE_SIZE + TILE_SIZE / 2;
        this.dir = { x: 0, y: 0 };
        this.speed = speed;
        this.targetC = c;
        this.targetR = r;
        this.moving = false;
    }

    updatePosition(dt) {
        if (!this.moving) return;

        let moveDist = this.speed * dt * 60; // 60fps normalization
        let targetX = this.targetC * TILE_SIZE + TILE_SIZE / 2;
        let targetY = this.targetR * TILE_SIZE + TILE_SIZE / 2;

        let dx = targetX - this.x;
        let dy = targetY - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= moveDist) {
            this.x = targetX;
            this.y = targetY;
            this.c = this.targetC;
            this.r = this.targetR;
            this.moving = false;
            
            // Tunneling
            if (this.c <= 0 && this.dir.x === -1) {
                this.c = COLS - 1;
                this.x = this.c * TILE_SIZE + TILE_SIZE / 2;
            } else if (this.c >= COLS - 1 && this.dir.x === 1) {
                this.c = 0;
                this.x = this.c * TILE_SIZE + TILE_SIZE / 2;
            }
        } else {
            this.x += this.dir.x * moveDist;
            this.y += this.dir.y * moveDist;
        }
    }
}

const playerImg = new Image();
playerImg.src = 'assets/viatura.png';

class Player extends Entity {
    constructor() {
        super(14, 23, 2.5);
        this.angle = 0;
    }

    update(dt) {
        if (!this.moving) {
            // Check if we can move in nextDir
            let checkC = this.c + nextDir.x;
            let checkR = this.r + nextDir.y;
            
            let canMoveNext = false;
            let wrapCheckC = (checkC + COLS) % COLS;
            let checkCell = map[checkR] ? map[checkR][wrapCheckC] : undefined;
            if (checkCell !== undefined) {
                if (powerModeTimer > 0) {
                    canMoveNext = true; // Livre circulação
                } else if (checkCell !== 1 && checkCell !== 4) {
                    canMoveNext = true;
                }
            }

            if (canMoveNext && (nextDir.x !== 0 || nextDir.y !== 0)) {
                this.dir = { x: nextDir.x, y: nextDir.y };
                this.targetC = checkC;
                this.targetR = checkR;
                this.moving = true;
                this.angle = Math.atan2(this.dir.y, this.dir.x);
            } else {
                // Keep moving in current dir if possible
                let currCheckC = this.c + this.dir.x;
                let currCheckR = this.r + this.dir.y;
                let wrapCurrCheckC = (currCheckC + COLS) % COLS;
                let currCell = map[currCheckR] ? map[currCheckR][wrapCurrCheckC] : undefined;
                let canMoveCurr = false;
                if (currCell !== undefined) {
                    if (powerModeTimer > 0) {
                        canMoveCurr = true; // Livre circulação
                    } else if (currCell !== 1 && currCell !== 4) {
                        canMoveCurr = true;
                    }
                }
                
                if (canMoveCurr) {
                    this.targetC = currCheckC;
                    this.targetR = currCheckR;
                    this.moving = true;
                } else {
                    this.dir = {x: 0, y: 0};
                }
            }
        }

        let origSpeed = this.speed;
        if (powerModeTimer > 0) {
            this.speed = origSpeed * 1.8; // Aumento de velocidade (turbo)
        }
        this.updatePosition(dt);
        this.speed = origSpeed;

        // Eat dots
        if (!this.moving && map[this.r] && map[this.r][this.c] !== undefined) {
            let cell = map[this.r][this.c];
            if (cell === 2) {
                map[this.r][this.c] = 0;
                score += 10;
                dotsTotal--;
            } else if (cell === 3) {
                map[this.r][this.c] = 0;
                score += 50;
                dotsTotal--;
                powerModeTimer = 8; // 8 seconds of siren power
                ghosts.forEach(g => {
                    if (g.state !== 'eaten') g.state = 'frightened';
                });
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        if (playerImg.complete && playerImg.naturalWidth !== 0) {
            // Se a imagem carregou, desenha a imagem realizada
            // Ajustamos o tamanho para caber no bloco do labirinto (aprox 24x12)
            ctx.drawImage(playerImg, -14, -8, 28, 16);
        } else {
            // Viatura body (Fallback)
            ctx.fillStyle = '#111';
            ctx.fillRect(-8, -6, 16, 12);
            
            ctx.fillStyle = '#eee';
            ctx.fillRect(-6, -4, 12, 8);
        }
        
        // Police lights
        sirenTimer += 0.1;
        if (sirenTimer > 1) {
            sirenFlash = !sirenFlash;
            sirenTimer = 0;
        }

        // Only flash if moving or if in power mode
        let redColor = '#600';
        let blueColor = '#006';
        if (this.dir.x !== 0 || this.dir.y !== 0 || powerModeTimer > 0) {
            redColor = sirenFlash ? '#f00' : '#600';
            blueColor = !sirenFlash ? '#00f' : '#006';
        }

        // Desenhamos a luz da sirene no teto do carro
        ctx.fillStyle = redColor;
        ctx.fillRect(-2, -3, 4, 3);
        ctx.fillStyle = blueColor;
        ctx.fillRect(-2, 0, 4, 3);
        
        if (!playerImg.complete || playerImg.naturalWidth === 0) {
            // headlights (apenas no fallback geométrico para não sobrepor mal na imagem)
            ctx.fillStyle = 'rgba(255, 255, 200, 0.5)';
            ctx.beginPath();
            ctx.moveTo(8, -4);
            ctx.lineTo(24, -12);
            ctx.lineTo(24, 0);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(8, 4);
            ctx.lineTo(24, 0);
            ctx.lineTo(24, 12);
            ctx.fill();
        }

        ctx.restore();
    }
}

class Ghost extends Entity {
    constructor(c, r, color, type) {
        super(c, r, type === 4 ? 2.2 : 2.0); // Fleeing thief is slightly faster
        this.spawnC = c;
        this.spawnR = r;
        this.color = color;
        this.type = type; // 0,1,2,3
        this.state = 'scatter'; // scatter, chase, frightened, eaten
        this.dir = {x: 0, y: -1}; // Start by exiting house if possible
    }

    update(dt) {
        if (!this.moving) {
            let possibleMoves = [];
            let dirs = [{x:0, y:-1}, {x:-1, y:0}, {x:0, y:1}, {x:1, y:0}];
            
            // Prevent reversing
            let reverseDir = {x: -this.dir.x, y: -this.dir.y};

            for (let d of dirs) {
                if (d.x === reverseDir.x && d.y === reverseDir.y && (this.dir.x !== 0 || this.dir.y !== 0)) continue;
                
                let checkC = this.c + d.x;
                let checkR = this.r + d.y;

                if (map[checkR] && map[checkR][checkC] !== undefined) {
                    let cell = map[checkR][checkC];
                    // Ghost house door is 4. Only cross if eaten or initially leaving.
                    if (cell !== 1) {
                         if (cell === 4 && this.state !== 'eaten') {
                             if (this.r > 12) { // inside the house, can leave
                                 possibleMoves.push(d);
                             }
                         } else {
                             possibleMoves.push(d);
                         }
                    }
                }
            }

            if (possibleMoves.length > 0) {
                // AI behavior
                let chosenDir = possibleMoves[0];
                
                if (this.state === 'frightened') {
                    // Random pick
                    chosenDir = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
                } else if (this.state === 'eaten') {
                    // Head to ghost house (c: 13, r: 14)
                    chosenDir = this.getBestMoveTo(possibleMoves, 13, 14);
                    // if arrived
                    if (this.c === 13 || this.c === 14) {
                         if (this.r >= 13 && this.r <= 15) {
                             this.state = 'chase';
                         }
                    }
                } else {
                    // Chase or Scatter Target
                    let targetC, targetR;
                    if (this.type === 4) {
                        // Ladrão Fuga: Always run away
                        targetC = COLS - player.c;
                        targetR = ROWS - player.r;
                        chosenDir = this.getBestMoveTo(possibleMoves, targetC, targetR);
                    } else {
                        if (this.state === 'scatter') {
                            // Four corners
                            if (this.type === 0) { targetC = COLS - 2; targetR = 1; }
                            else if (this.type === 1) { targetC = 1; targetR = 1; }
                            else if (this.type === 2) { targetC = COLS - 2; targetR = ROWS - 2; }
                            else { targetC = 1; targetR = ROWS - 2; }
                        } else { // chase
                            targetC = player.c;
                            targetR = player.r;
                            if (this.type === 1) { 
                                targetC += player.dir.x * 4; targetR += player.dir.y * 4; 
                            }
                            // Add some randomness to others to avoid stacking
                            if (this.type === 2 && Math.random() < 0.5) targetC = COLS - targetC;
                            if (this.type === 3 && Math.random() < 0.2) {
                                chosenDir = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
                            }
                        }
                        if (this.type !== 3 || Math.random() >= 0.2) {
                             chosenDir = this.getBestMoveTo(possibleMoves, targetC, targetR);
                        }
                    }
                }

                this.dir = chosenDir;
                this.targetC = this.c + this.dir.x;
                this.targetR = this.r + this.dir.y;
                this.moving = true;
            } else {
                this.dir = {x: 0, y: 0}; // stuck
            }
        }
        
        let currentSpeed = this.speed;
        if (this.state === 'frightened') currentSpeed = this.speed * 0.6;
        if (this.state === 'eaten') currentSpeed = this.speed * 2.5;

        // Temporarily change speed, then revert
        let originalSpeed = this.speed;
        this.speed = currentSpeed;
        this.updatePosition(dt);
        this.speed = originalSpeed;
    }

    getBestMoveTo(moves, tc, tr) {
        let bestDist = Infinity;
        let bestMove = moves[0];
        
        for (let m of moves) {
            let checkC = this.c + m.x;
            let checkR = this.r + m.y;
            let dc = tc - checkC;
            let dr = tr - checkR;
            let distSq = dc * dc + dr * dr;
            if (distSq < bestDist) {
                bestDist = distSq;
                bestMove = m;
            }
        }
        return bestMove;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        let drawAngle = Math.atan2(this.dir.y, this.dir.x);
        ctx.rotate(drawAngle);

        if (this.state === 'eaten') {
            // Drawn as just eyes/core to return to house
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.fillRect(-2, -2, 4, 4);
        } else {
            // Draw thief car
            let carColor = this.color;
            if (this.state === 'frightened') {
                carColor = sirenFlash ? '#00f' : '#fff';
            }

            // Chassis
            ctx.fillStyle = carColor;
            ctx.fillRect(-7, -5, 14, 10);
            
            // Windows
            ctx.fillStyle = '#111';
            ctx.fillRect(-3, -4, 8, 8);
            
            // Details
            if (this.state !== 'frightened') {
               ctx.fillStyle = '#333';
               ctx.fillRect(-1, -4, 2, 8); // roof line
            }
        }

        ctx.restore();
    }
}

function initGame(keepScore = false) {
    if (animationId) cancelAnimationFrame(animationId);
    initMap();
    player = new Player();
    ghosts = [
        new Ghost(13, 13, GHOST_COLORS[0], 0), // Blinky
        new Ghost(14, 13, GHOST_COLORS[1], 1), // Pinky
        new Ghost(13, 14, GHOST_COLORS[2], 2), // Inky
        new Ghost(14, 14, GHOST_COLORS[3], 3), // Clyde
        new Ghost(13, 11, GHOST_COLORS[4], 4)  // Fleeing Thief (Always runs away, Green)
    ];

    // A cada nível passado, spawna ladrões extras baseados na Dificuldade/Level!
    for(let i = 1; i < currentLevel; i++) {
        let type = i % 4; // Reaproveita os comportamentos de IA (0 a 3)
        ghosts.push(new Ghost(13, 13, GHOST_COLORS[type], type));
    }

    floatingTexts = [];
    if (!keepScore) score = 0;
    updateHUD();
    gameWon = false;
    gameOver = false;
    powerModeTimer = 0;
    nextDir = { x: 0, y: 0 };
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
}

function updateHUD() {
    document.getElementById('score').innerText = score;
    if (score > highScore) {
         highScore = score;
         document.getElementById('high-score').innerText = highScore;
    }
    
    let lifeStr = '';
    for(let i=0; i<lives; i++) lifeStr += '★';
    document.getElementById('lives').innerText = lifeStr || '0';
}

function drawMap() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let val = map[r][c];
            let x = c * TILE_SIZE;
            let y = r * TILE_SIZE;

            if (val === 1) { // Wall
                ctx.fillStyle = '#001a33';
                ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                ctx.strokeStyle = '#00f3ff';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
                
                // Add inner glow for neon effect
                ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)';
                ctx.lineWidth = 2;
                ctx.strokeRect(x+2, y+2, TILE_SIZE-4, TILE_SIZE-4);

            } else if (val === 2) { // Dot / Evidência
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (val === 3) { // Powerup / Giroflex
                if (sirenFlash) {
                    ctx.fillStyle = '#ff003c';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#ff003c';
                } else {
                    ctx.fillStyle = '#00f3ff';
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = '#00f3ff';
                }
                ctx.beginPath();
                ctx.arc(x + TILE_SIZE/2, y + TILE_SIZE/2, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0; // reset
            } else if (val === 4) { // Ghost door
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.fillRect(x, y + TILE_SIZE/2 - 2, TILE_SIZE, 4);
            }
        }
    }
}

function gameLoop(timestamp) {
    if (gameOver || gameWon) return;

    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; // Cap delta time if tab is hidden
    lastTime = timestamp;

    // Power mode timer
    if (powerModeTimer > 0) {
        powerModeTimer -= dt;
        if (powerModeTimer <= 0) {
            ghosts.forEach(g => {
                if (g.state === 'frightened') g.state = 'chase'; // Default back to chase
            });
        }
    }

    // Toggle ghost state occasionally (scatter <-> chase) if not frightened
    // Simplified: always chase to keep it fast-paced, unless frightened or eaten.

    player.update(dt);
    
    // Se o Giroflex desligar e a viatura estiver dentro de um prédio (parede), ocorre o acidente.
    if (powerModeTimer <= 0) {
        let wrapC = (player.c + COLS) % COLS;
        if (map[player.r] && map[player.r][wrapC] === 1) {
            handleDeath();
            return; // Previne que a lógica de colisão do mesmo frame rode novamente
        }
    }

    ghosts.forEach(g => g.update(dt));

    // Collision detection
    for (let i = ghosts.length - 1; i >= 0; i--) {
        let g = ghosts[i];
        let dx = g.x - player.x;
        let dy = g.y - player.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < TILE_SIZE - 2) {
            // Se o poder (Giroflex) está ativo OU é o ladrão de fuga
            if (g.state === 'frightened' || g.type === 4) {
                score += (g.type === 4) ? 500 : 200; // Adds points
                floatingTexts.push({ x: g.x, y: g.y, life: 1.5 });
                ghosts.splice(i, 1); // Remove permanentemente do mapa (prendeu)
            } else {
                 handleDeath();
            }
        }
    }

    // Win condition: Prendeu TODOS os Ladrões!
    if (ghosts.length === 0) {
        gameWon = true;
        document.getElementById('win-screen').classList.add('active');
        document.getElementById('score').innerText = score;
    }

    drawMap();
    player.draw(ctx);
    ghosts.forEach(g => g.draw(ctx));
    
    // Anima e desenha o texto flutuante do "SACO!"
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        let ft = floatingTexts[i];
        ft.y -= dt * 30; // Flutua pra cima
        ft.life -= dt;
        if (ft.life <= 0) {
            floatingTexts.splice(i, 1);
        } else {
            ctx.save();
            ctx.globalAlpha = Math.max(0, ft.life / 1.5);
            ctx.fillStyle = '#ffea00';
            ctx.font = '10px "Press Start 2P"';
            ctx.textAlign = 'center';
            // Algumas fontes/cenarios podem precisar de fallback para o emoji
            ctx.fillText('SACO! 💀', ft.x, ft.y);
            ctx.restore();
        }
    }

    updateHUD();

    if (!gameOver && !gameWon) {
        animationId = requestAnimationFrame(gameLoop);
    }
}

function handleDeath() {
    lives--;
    updateHUD();
    if (lives <= 0) {
        gameOver = true;
        document.getElementById('final-score').innerText = score;
        document.getElementById('game-over-screen').classList.add('active');
    } else {
        // Reset positions
        player.c = 14; player.r = 23;
        player.x = player.c * TILE_SIZE + TILE_SIZE/2;
        player.y = player.r * TILE_SIZE + TILE_SIZE/2;
        player.dir = {x:0, y:0};
        player.moving = false;
        nextDir = {x:0, y:0};

        ghosts.forEach(g => {
            g.c = g.spawnC;
            g.r = g.spawnR;
            g.x = g.c * TILE_SIZE + TILE_SIZE/2;
            g.y = g.r * TILE_SIZE + TILE_SIZE/2;
            g.moving = false;
            g.state = 'chase';
        });
        powerModeTimer = 0;
    }
}

// Controls
window.addEventListener('keydown', (e) => {
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W': nextDir = {x: 0, y: -1}; break;
        case 'ArrowDown':
        case 's':
        case 'S': nextDir = {x: 0, y: 1}; break;
        case 'ArrowLeft':
        case 'a':
        case 'A': nextDir = {x: -1, y: 0}; break;
        case 'ArrowRight':
        case 'd':
        case 'D': nextDir = {x: 1, y: 0}; break;
    }
});

// UI Event Listeners
document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-screen').classList.remove('active');
    lives = 3;
    currentLevel = 1;
    initGame(false);
});

document.getElementById('restart-btn').addEventListener('click', () => {
    document.getElementById('game-over-screen').classList.remove('active');
    lives = 3;
    currentLevel = 1;
    initGame(false);
});

document.getElementById('next-level-btn').addEventListener('click', () => {
    document.getElementById('win-screen').classList.remove('active');
    currentLevel++; // Incrementa o nível!! Aumenta os ladrões!
    initGame(true); // Mantém a pontuação (score) real do player
});
