// ==========================================
// 1. CANVAS SETUP & CONFIGURATION
// ==========================================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Snappier Arcade Physics
const GRAVITY = 0.6;
const FLOOR = canvas.height - 80;

// Dynamic Platforms Array
let platforms = [];


// ==========================================
// 2. GAME STATE & ENTITIES
// ==========================================

const keys = {};
let jumpPressed = false;
let dropThroughTimer = 0;

let bullets = [];
let enemyBullets = [];
let enemies = [];

// Spawners (@ normalized 60 FPS units)
let enemySpawnTimer = 180;
let eliteSpawnTimer = 720;

let lives = 5;
let score = 0;
let highScore = 0;
let nextLifeScore = 5000;
let isGameOver = false;

let gameOverTimer = 0;

// Invincibility tracked in absolute milliseconds for rock-solid timing
let invincibilityTimerMs = 0;
let lastTime = 0;

// Main Player Object
let player = {
    x: 50,
    y: FLOOR,
    vx: 0,
    vy: 0,
    width: 30,
    height: 60,
    canFire: true,
    facing: "right"
};


// ==========================================
// 3. INPUT LISTENERS
// ==========================================

document.addEventListener("keydown", (e) => {
    if (e.key === " " && isGameOver) {
        if (gameOverTimer <= 0) {
            isGameOver = false;
            lives = 5;
            score = 0;
            nextLifeScore = 5000;
            player.x = 50;
            player.y = FLOOR;
            player.vx = 0;
            player.vy = 0;
            invincibilityTimerMs = 0;
            generatePlatforms();
        }
        return;
    }

    keys[e.key] = true;
});

document.addEventListener("keyup", (e) => {
    keys[e.key] = false;
});


// ==========================================
// 4. MAIN GAME LOOP FUNCTIONS
// ==========================================

function isColliding(a, b) {
    return a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
}

function addScore(points) {
    score += points;

    if (score > highScore) {
        highScore = score;
    }

    while (score >= nextLifeScore) {
        lives++;
        nextLifeScore += 5000;
    }
}

function playerHit() {
    if (invincibilityTimerMs > 0) return;

    lives--;
    if (lives <= 0) {
        isGameOver = true;
        gameOverTimer = 120;
        return;
    }

    player.x = 50;
    player.y = FLOOR;
    player.vx = 0;
    player.vy = 0;
    invincibilityTimerMs = 3000; // Exactly 3000ms (3 seconds)
}

function loop(timestamp) {
    if (!lastTime) lastTime = timestamp;

    // Exact delta time in milliseconds
    let dtMs = timestamp - lastTime;
    let dtSec = dtMs / 1000;
    lastTime = timestamp;

    if (dtSec > 0.1) dtSec = 0.1;

    let dtScale = dtSec * 60;

    update(dtScale, dtMs);
    draw();
    requestAnimationFrame(loop);
}

function update(dtScale, dtMs) {

    if (isGameOver) {
        if (gameOverTimer > 0) {
            gameOverTimer -= dtScale;
        }
        return;
    }

    // Precise millisecond decay
    if (invincibilityTimerMs > 0) {
        invincibilityTimerMs -= dtMs;
        if (invincibilityTimerMs <= 0) {
            invincibilityTimerMs = 0;
        }
    }

    // --- 1. Horizontal Input & Movement ---
    if (keys["ArrowLeft"]) {
        player.vx = -8;
        player.facing = "left";
    } else if (keys["ArrowRight"]) {
        player.vx = 8;
        player.facing = "right";
    } else {
        player.vx = 0;
    }

    // --- 2. Physics Updates ---
    player.vy += GRAVITY * dtScale;
    player.x += player.vx * dtScale;
    player.y += player.vy * dtScale;

    // --- 3. Screen Wrapping ---
    if (player.x > canvas.width) {
        player.x = -player.width;
    }
    if (player.x < -player.width) {
        player.x = canvas.width;
    }

    // --- 4. Player Bullet Updates ---
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        b.x += b.vx * dtScale;

        if (b.x > canvas.width || b.x < 0) {
            bullets.splice(i, 1);
            continue;
        }

        for (let j = enemies.length - 1; j >= 0; j--) {
            const e = enemies[j];
            if (isColliding(b, e)) {
                bullets.splice(i, 1);
                e.hp--;

                if (e.hp <= 0) {
                    let pointReward = 50;
                    if (e.type === "red") pointReward = 100;
                    if (e.type === "green") pointReward = 500;

                    addScore(pointReward);
                    enemies.splice(j, 1);
                }
                break;
            }
        }
    }

    // --- 5. Enemy AI & Movement ---
    enemies.forEach(enemy => {
        enemy.vy += GRAVITY * dtScale;
        enemy.y += enemy.vy * dtScale;
        enemy.x += enemy.vx * dtScale;

        let onPlatform = false;
        if (enemy.dropTimer <= 0) {
            platforms.forEach(p => {
                const enemyBottom = enemy.y + enemy.height;
                const falling = enemy.vy > 0;
                const withinHorizontal = (enemy.x + enemy.width > p.x) && (enemy.x < p.x + p.width);
                const crossingPlatform = enemyBottom >= p.y && enemyBottom <= p.y + enemy.vy * dtScale + 6;

                if (falling && withinHorizontal && crossingPlatform) {
                    enemy.y = p.y - enemy.height;
                    enemy.vy = 0;
                    enemy.platform = p;
                    onPlatform = true;
                }
            });
        } else {
            enemy.dropTimer -= dtScale;
        }

        if (enemy.y + enemy.height >= FLOOR + 60) {
            enemy.y = FLOOR + 60 - enemy.height;
            enemy.vy = 0;
            onPlatform = true;
        }

        if (enemy.x <= enemy.platform.x || enemy.x + enemy.width >= enemy.platform.x + enemy.platform.width) {
            enemy.vx *= -1;
        }

        if (enemy.type === "red" || enemy.type === "green") {
            enemy.shootTimer -= dtScale;
            if (enemy.shootTimer <= 0) {
                fireEnemyBurst(enemy);
                enemy.shootTimer = enemy.type === "green" ? getRandomInt(90, 150) : 120;
            }
        }

        if (enemy.type === "blue" || enemy.type === "green") {
            enemy.jumpTimer -= dtScale;
            if (enemy.jumpTimer <= 0 && onPlatform) {
                if (Math.random() < 0.5) {
                    enemy.vy = -15;
                } else if (enemy.platform.y < 780) {
                    enemy.dropTimer = 15;
                }
                enemy.jumpTimer = enemy.type === "green" ? getRandomInt(80, 150) : getRandomInt(90, 180);
            }
        }

        if (isColliding(player, enemy)) {
            playerHit();
        }
    });

    // --- 6. Enemy Bullets Update ---
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const eb = enemyBullets[i];
        eb.x += eb.vx * dtScale;

        if (eb.x > canvas.width || eb.x < 0) {
            enemyBullets.splice(i, 1);
            continue;
        }

        if (isColliding(player, eb)) {
            enemyBullets.splice(i, 1);
            playerHit();
        }
    }

    // --- 7. Platform Collisions ---
    if (keys["ArrowDown"] && dropThroughTimer <= 0) {
        dropThroughTimer = 10;
    }

    if (dropThroughTimer > 0) {
        dropThroughTimer -= dtScale;
    }

    let onPlatform = false;

    if (dropThroughTimer <= 0) {
        platforms.forEach(p => {
            if (p.y >= 780) return;

            const playerBottom = player.y + player.height;
            const platformTop = p.y;
            const playerRight = player.x + player.width;
            const playerLeft = player.x;
            const platformRight = p.x + p.width;
            const platformLeft = p.x;

            const falling = player.vy > 0;
            const withinHorizontal = playerRight > platformLeft && playerLeft < platformRight;
            const crossingPlatform = playerBottom >= platformTop && playerBottom <= platformTop + player.vy * dtScale + 6;

            if (falling && withinHorizontal && crossingPlatform) {
                player.y = platformTop - player.height;
                player.vy = 0;
                onPlatform = true;
            }
        });
    }

    // --- 8. Floor Collision ---
    if (player.y > FLOOR) {
        player.y = FLOOR;
        player.vy = 0;
        onPlatform = true;
    }

    // --- 9. Input Checks ---
    if (keys["ArrowUp"]) {
        if (!jumpPressed && onPlatform) {
            player.vy = -16;
        }
        jumpPressed = true;
    } else {
        jumpPressed = false;
    }

    if (keys[" "]) {
        fireBullet();
    }

    // --- 10. Spawners ---
    enemySpawnTimer -= dtScale;
    if (enemySpawnTimer <= 0) {
        if (enemies.length < 12) {
            spawnEnemySafely();
        }
        enemySpawnTimer = getRandomInt(120, 480);
    }

    eliteSpawnTimer -= dtScale;
    if (eliteSpawnTimer <= 0) {
        if (enemies.length < 12) {
            spawnEnemySafely("green");
        }
        eliteSpawnTimer = 720;
    }
}

// Render Step
function draw() {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (isGameOver) {
        const formattedScore = String(score).padStart(6, '0');

        ctx.textAlign = "center";
        ctx.fillStyle = "#A76F6F";
        ctx.font = "32px 'C64Pro', monospace";
        ctx.fillText("Game Over!", canvas.width / 2, canvas.height / 2 - 60);

        ctx.fillStyle = "#CBCC7C";
        ctx.font = "20px 'C64Pro', monospace";
        ctx.fillText(`Score: ${formattedScore}`, canvas.width / 2, canvas.height / 2);

        ctx.font = "16px 'C64Pro', monospace";
        if (gameOverTimer > 0) {
            ctx.fillStyle = "#4E4E4E";
            ctx.fillText("Wait...", canvas.width / 2, canvas.height / 2 + 60);
        } else {
            ctx.fillStyle = "#9FDB9F";
            ctx.fillText("Hit Space to Retry!", canvas.width / 2, canvas.height / 2 + 60);
        }

        return;
    }

    // FIXED: Clean millisecond flash check + explicit color assignment prevents color shifts
    let showPlayer = true;
    if (invincibilityTimerMs > 0) {
        // Toggles visibility every 100ms smoothly across any FPS
        showPlayer = Math.floor(invincibilityTimerMs / 100) % 2 === 0;
    }

    if (showPlayer) {
        ctx.fillStyle = "#9FDB9F"; // Explicit light green fill
        ctx.fillRect(player.x, player.y, player.width, player.height);
    }

    // Platforms
    ctx.fillStyle = "#4E4E4E";
    platforms.forEach(p => {
        ctx.fillRect(p.x, p.y, p.width, p.height);
    });

    // Enemies
    enemies.forEach(e => {
        if (e.type === "red") ctx.fillStyle = "#753D3D";
        else if (e.type === "blue") ctx.fillStyle = "#7D4488";
        else if (e.type === "green") ctx.fillStyle = "#9FDB9F";

        ctx.fillRect(e.x, e.y, e.width, e.height);
    });

    // Bullets
    ctx.fillStyle = "#CBCC7C";
    bullets.forEach(b => {
        ctx.fillRect(b.x, b.y, b.width, b.height * 1.4);
    });

    // Enemy Bullets
    ctx.fillStyle = "#7C552F";
    enemyBullets.forEach(eb => {
        ctx.fillRect(eb.x, eb.y, eb.width, eb.height * 1.4);
    });

    // HUD
    ctx.font = "16px 'C64Pro', monospace";

    ctx.fillStyle = "#9FDB9F";
    ctx.textAlign = "left";
    ctx.fillText(`LIVES: ${lives}`, 20, 35);

    ctx.fillStyle = "#CBCC7C";
    ctx.textAlign = "center";
    const formattedScore = String(score).padStart(6, '0');
    ctx.fillText(`SCORE: ${formattedScore}`, canvas.width / 2, 35);

    ctx.fillStyle = "#70A4B2";
    ctx.textAlign = "right";
    const formattedHigh = String(highScore).padStart(6, '0');
    ctx.fillText(`HIGH: ${formattedHigh}`, canvas.width - 20, 35);
}


// ==========================================
// 5. HELPER / ACTION FUNCTIONS
// ==========================================

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function spawnEnemyOnPlatform(platform, forcedType = null) {
    const type = forcedType || (Math.random() < 0.5 ? "red" : "blue");

    const enemyWidth = type === "green" ? 60 : 30;
    const enemyHeight = 60;

    let speed = 2.5;
    if (type === "red") speed = 1.5;

    const enemy = {
        x: platform.x + (platform.width / 2) - (enemyWidth / 2),
        y: platform.y - enemyHeight,
        width: enemyWidth,
        height: enemyHeight,
        vx: speed,
        vy: 0,
        platform: platform,
        type: type,
        hp: type === "green" ? 5 : 1,

        shootTimer: type === "green" ? getRandomInt(90, 150) : getRandomInt(60, 120),
        jumpTimer: type === "green" ? getRandomInt(80, 150) : getRandomInt(90, 180),
        dropTimer: 0
    };
    enemies.push(enemy);
}

function generatePlatforms() {
    platforms = [];
    enemies = [];
    enemyBullets = [];
    enemySpawnTimer = getRandomInt(120, 480);
    eliteSpawnTimer = 720;

    platforms.push({ x: 0, y: 780, width: 1280, height: 20 });

    const totalPlatforms = getRandomInt(6, 10);
    const tiers = [200, 350, 500, 650];
    const MIN_WIDTH = 100;
    const MAX_WIDTH = 800;
    const MIN_HORIZONTAL_GAP = 120;
    const tierPlatforms = { 0: [], 1: [], 2: [], 3: [] };

    function tryPlacePlatform(tierIndex) {
        const width = getRandomInt(MIN_WIDTH, MAX_WIDTH);

        for (let attempt = 0; attempt < 20; attempt++) {
            const x = getRandomInt(20, canvas.width - width - 20);

            const overlaps = tierPlatforms[tierIndex].some(existing => {
                return (x < existing.x + existing.width + MIN_HORIZONTAL_GAP) &&
                    (x + width + MIN_HORIZONTAL_GAP > existing.x);
            });

            if (!overlaps) {
                const newPlatform = { x, y: tiers[tierIndex], width, height: 20 };
                platforms.push(newPlatform);
                tierPlatforms[tierIndex].push(newPlatform);

                if (Math.random() < 0.5) {
                    spawnEnemyOnPlatform(newPlatform);
                }

                return true;
            }
        }
        return false;
    }

    for (let t = 0; t < tiers.length; t++) {
        tryPlacePlatform(t);
    }

    let remaining = totalPlatforms - tiers.length;
    let attempts = 0;

    while (remaining > 0 && attempts < 30) {
        const randomTier = getRandomInt(0, tiers.length - 1);
        if (tryPlacePlatform(randomTier)) {
            remaining--;
        }
        attempts++;
    }
}

function fireBullet() {
    if (!player.canFire) return;

    player.canFire = false;
    setTimeout(() => player.canFire = true, 120);

    const speed = player.facing === "right" ? 14 : -14;

    const bullet = {
        x: player.facing === "right" ? player.x + player.width : player.x - 10,
        y: player.y + player.height / 2,
        vx: speed,
        width: 10,
        height: 4
    };

    bullets.push(bullet);
}

function fireEnemyBurst(enemy) {
    const direction = enemy.vx > 0 ? 8 : -8;

    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            if (enemies.includes(enemy)) {
                enemyBullets.push({
                    x: direction > 0 ? enemy.x + enemy.width : enemy.x - 8,
                    y: enemy.y + (enemy.height / 3),
                    vx: direction,
                    width: 8,
                    height: 4
                });
            }
        }, i * 80);
    }
}

function spawnEnemySafely(forcedType = null) {
    const MIN_DISTANCE = 350;

    const validPlatforms = platforms.filter(p => {
        if (p.y >= 780) return false;

        const platformCenterX = p.x + (p.width / 2);
        const platformCenterY = p.y;
        const playerCenterX = player.x + (player.width / 2);
        const playerCenterY = player.y + (player.height / 2);

        const distance = Math.hypot(platformCenterX - playerCenterX, platformCenterY - playerCenterY);
        return distance >= MIN_DISTANCE;
    });

    if (validPlatforms.length > 0) {
        const targetPlatform = validPlatforms[getRandomInt(0, validPlatforms.length - 1)];
        spawnEnemyOnPlatform(targetPlatform, forcedType);
    }
}


// ==========================================
// 6. INITIALIZATION
// ==========================================

document.fonts.ready.then(() => {
    generatePlatforms();
    requestAnimationFrame(loop);
});