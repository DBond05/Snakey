 (() => {
      "use strict";
      // ----------------------------//
      // ---------- Canvas ----------//
      // ----------------------------//
      const canvas = document.getElementById("c");
      const ctx = canvas.getContext("2d");

      function resize() {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.floor(window.innerWidth * dpr);
        canvas.height = Math.floor(window.innerHeight * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
      }
      window.addEventListener("resize", resize, { passive: true });
      resize();
      // ----------------------------//
      // ---------- HUD -------------//
      // ----------------------------//
      const scoreEl = document.getElementById("score");
      const msgEl = document.getElementById("msg");

      // -----------------------------//
      // ---------- Helpers ----------//
      // -----------------------------//
      const TAU = Math.PI * 2;

      const rand = (a, b) => a + Math.random() * (b - a);
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

      function len(x, y) { return Math.hypot(x, y); }
      function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

      // Keep angle changes smooth (shortest direction around circle)
      function angleLerp(current, target, maxStep) {
        let diff = ((target - current + Math.PI) % (TAU)) - Math.PI;
        diff = clamp(diff, -maxStep, maxStep);
        return current + diff;
      }

      // color 
      function colorFromT(t) {
        // Hue range: tail → head
        //full rainbow
        const hueStart = 0;
        const hueEnd = 360;

        const hue = hueStart + (hueEnd - hueStart) * t;

        const saturation = 85; // %
        const lightness = 62; // %

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      }

      function enemyColorFromT(t, hueShift) {
        // reuse your color scheme but shift hues per enemy
        const hueStart = 10 + hueShift;
        const hueEnd = 330 + hueShift;
        const hue = hueStart + (hueEnd - hueStart) * t;
        return `hsl(${hue}, 85%, 60%)`;
      }

      function makeEnemySnake() {
        const s = {
          head: { x: rand(0, WORLD.w), y: rand(0, WORLD.h), a: rand(0, TAU) },
          radius: ENEMIES.radius,
          baseSpeed: ENEMIES.baseSpeed,
          boostSpeed: ENEMIES.boostSpeed,
          turnRate: ENEMIES.turnRate,
          segmentSpacing: ENEMIES.segmentSpacing,
          lengthPx: rand(ENEMIES.minLengthPx, ENEMIES.minLengthPx + 400),
          minLengthPx: ENEMIES.minLengthPx,
          maxLengthPx: ENEMIES.maxLengthPx,
          trail: [],
          body: [],
          // AI state
          wanderA: rand(0, TAU),
          wanderTimer: rand(0.8, 2.2),
          // color theme shift so enemies differ
          hueShift: rand(-80, 80),
        };

        // seed trail behind head
        for (let i = 0; i < 40; i++) {
          s.trail.push({
            x: s.head.x - Math.cos(s.head.a) * i * s.segmentSpacing,
            y: s.head.y - Math.sin(s.head.a) * i * s.segmentSpacing
          });
        }
        rebuildEnemyBodyFromTrail(s);
        return s;
      }

      function spawnEnemies() {
        enemies.length = 0;
        for (let i = 0; i < ENEMIES.count; i++) enemies.push(makeEnemySnake());
      }

      function headHitsBody(headX, headY, headR, bodyPoints, skipFromEnd, bodyR) {
        // skipFromEnd prevents instant “neck” collisions
        const limit = Math.max(0, bodyPoints.length - skipFromEnd);
        const rr = (headR + bodyR) * (headR + bodyR);

        for (let i = 0; i < limit; i++) {
          const p = bodyPoints[i];
          const dx = headX - p.x;
          const dy = headY - p.y;
          if (dx * dx + dy * dy <= rr) return true;
        }
        return false;
      }


      function circleHit(ax, ay, ar, bx, by, br) {
        const dx = ax - bx, dy = ay - by;
        const rr = ar + br;
        return (dx * dx + dy * dy) <= rr * rr;
      }

      function dropFoodFromBody(bodyPoints, everyN = 10, pelletsPerPoint = 2, spread = 22) {
        for (let i = 0; i < bodyPoints.length; i += everyN) {
          const p = bodyPoints[i];
          spawnFoodAt(p.x, p.y, pelletsPerPoint, spread);
        }
      }


      // ----------------------------//
      // ---------- World -----------//
      // ----------------------------//
      const WORLD = {
        w: 5200,
        h: 5200,
      };

      function wrapToWorld(p) {
        // "Torus world" wrap-around feels nice and avoids edges.
        if (p.x < 0) p.x += WORLD.w;
        if (p.x >= WORLD.w) p.x -= WORLD.w;
        if (p.y < 0) p.y += WORLD.h;
        if (p.y >= WORLD.h) p.y -= WORLD.h;
      }

      // ----------------------------//
      // ---------- Input -----------//
      // ----------------------------//
      const input = {
        pointerActive: false,
        pointerX: 0,
        pointerY: 0,
        boost: false,
        // For touch steering: store start and current so drag defines direction
        touchStartX: 0,
        touchStartY: 0,
        touchCurX: 0,
        touchCurY: 0,
        hasTouchDrag: false,
      };

      function setPointerFromEvent(e) {
        const rect = canvas.getBoundingClientRect();
        input.pointerX = (e.clientX - rect.left);
        input.pointerY = (e.clientY - rect.top);
      }

      window.addEventListener("pointerdown", (e) => {
        input.pointerActive = true;
        setPointerFromEvent(e);

        // If touch/pen, enable drag-based steering (more natural on mobile)
        if (e.pointerType !== "mouse") {
          const rect = canvas.getBoundingClientRect();
          input.touchStartX = e.clientX - rect.left;
          input.touchStartY = e.clientY - rect.top;
          input.touchCurX = input.touchStartX;
          input.touchCurY = input.touchStartY;
          input.hasTouchDrag = true;
        }
      }, { passive: true });

      window.addEventListener("pointermove", (e) => {
        setPointerFromEvent(e);
        if (input.pointerActive && e.pointerType !== "mouse") {
          const rect = canvas.getBoundingClientRect();
          input.touchCurX = e.clientX - rect.left;
          input.touchCurY = e.clientY - rect.top;
        }
      }, { passive: true });

      window.addEventListener("pointerup", () => {
        input.pointerActive = false;
        input.hasTouchDrag = false;
      }, { passive: true });

      window.addEventListener("keydown", (e) => {
        if (e.key === "Shift" || e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
          input.boost = true;
        }
        if (e.key === "r" || e.key === "R") restart();
      });

      window.addEventListener("keyup", (e) => {
        if (e.key === "Shift" || e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
          input.boost = false;
        }
      });
      // --------------------------//
      //--------Enemy Snakes-------//
      // --------------------------//
      const ENEMIES = {
        count: 10,
        radius: 12,
        baseSpeed: 150,
        boostSpeed: 215,
        turnRate: 3.8,
        segmentSpacing: 10,
        minLengthPx: 240,
        maxLengthPx: 2600,
      };

      const enemies = [];

      //build enemy snakes
      function pushTrailPointFor(s, x, y) {
        const t = s.trail;
        const last = t[t.length - 1];
        if (!last) { t.push({ x, y }); return; }

        const dx = x - last.x, dy = y - last.y;
        const d = Math.hypot(dx, dy);
        if (d < s.segmentSpacing) return;

        const steps = Math.floor(d / s.segmentSpacing);
        const nx = dx / d, ny = dy / d;

        for (let i = 1; i <= steps; i++) {
          t.push({
            x: last.x + nx * s.segmentSpacing * i,
            y: last.y + ny * s.segmentSpacing * i
          });
        }
      }

      function trimTrailToLengthPxFor(s) {
        const maxPoints = Math.ceil(s.lengthPx / s.segmentSpacing);
        if (s.trail.length > maxPoints) {
          s.trail.splice(0, s.trail.length - maxPoints);
        }
      }

      function rebuildEnemyBodyFromTrail(s) {
        s.body.length = 0;
        for (let i = 0; i < s.trail.length; i++) s.body.push(s.trail[i]);
        const last = s.body[s.body.length - 1];
        if (!last || last.x !== s.head.x || last.y !== s.head.y) {
          s.body.push({ x: s.head.x, y: s.head.y });
        }
      }

      // ------------------------//
      //----- Enemy Snake AI-----//
      // ------------------------//
      function findNearestFood(x, y, maxDist = 900) {
        let best = null;
        let bestD2 = maxDist * maxDist;
        for (const f of FOOD.items) {
          const dx = f.x - x, dy = f.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) { bestD2 = d2; best = f; }
        }
        return best;
      }

      function dangerAhead(s, angle, lookDist) {
        // sample a point in front of the head; see if it overlaps body points
        const px = s.head.x + Math.cos(angle) * lookDist;
        const py = s.head.y + Math.sin(angle) * lookDist;

        // avoid own body (skip neck)
        const skip = 30;
        const r = s.radius * 0.9;
        for (let i = 0; i < s.body.length - skip; i++) {
          const b = s.body[i];
          const dx = px - b.x, dy = py - b.y;
          if (dx * dx + dy * dy < (r * r)) return true;
        }

        // avoid player body too (optional but makes them smarter)
        const playerSkip = 28;
        const pr = snake.radius * 0.9;
        for (let i = 0; i < snake.body.length - playerSkip; i++) {
          const b = snake.body[i];
          const dx = px - b.x, dy = py - b.y;
          if (dx * dx + dy * dy < (pr * pr)) return true;
        }

        // avoid other enemies
        for (const e of enemies) {
          if (e === s) continue;
          const eSkip = 26;
          const er = e.radius * 0.9;
          for (let i = 0; i < e.body.length - eSkip; i++) {
            const b = e.body[i];
            const dx = px - b.x, dy = py - b.y;
            if (dx * dx + dy * dy < (er * er)) return true;
          }
        }

        return false;
      }

      function chooseEnemyAngle(s, dt) {
        // 1) food target (local)
        const food = findNearestFood(s.head.x, s.head.y, 1100);

        // 2) wander if no food
        if (!food) {
          s.wanderTimer -= dt;
          if (s.wanderTimer <= 0) {
            s.wanderTimer = rand(0.8, 2.2);
            s.wanderA = s.head.a + rand(-1.2, 1.2);
          }
        }

        let target = food ? Math.atan2(food.y - s.head.y, food.x - s.head.x) : s.wanderA;

        // 3) collision avoidance via “sensor rays”
        // Test forward, left, right and pick safest (prefer target direction if safe)
        const look1 = s.radius * 2.6;
        const look2 = s.radius * 4.2;

        const candidates = [
          target,
          target + 0.55,
          target - 0.55,
          target + 1.05,
          target - 1.05,
        ];

        // Choose first that is safe at both look distances
        for (const a of candidates) {
          if (!dangerAhead(s, a, look1) && !dangerAhead(s, a, look2)) {
            return a;
          }
        }

        // If all are dangerous, turn hard away from current heading
        return s.head.a + rand(-1.8, 1.8);
      }

      function updateEnemies(dt) {
        for (let idx = 0; idx < enemies.length; idx++) {
          const e = enemies[idx];

          const targetA = chooseEnemyAngle(e, dt);

          // smooth turning
          e.head.a = angleLerp(e.head.a, targetA, e.turnRate * dt);

          // mild boost sometimes when long (optional)
          const boosting = (e.lengthPx > 700 && Math.random() < 0.015);
          const speed = boosting ? e.boostSpeed : e.baseSpeed;

          // move
          e.head.x += Math.cos(e.head.a) * speed * dt;
          e.head.y += Math.sin(e.head.a) * speed * dt;
          wrapToWorld(e.head);

          // trail/body
          pushTrailPointFor(e, e.head.x, e.head.y);
          trimTrailToLengthPxFor(e);
          rebuildEnemyBodyFromTrail(e);

          // eat food
          for (let i = FOOD.items.length - 1; i >= 0; i--) {
            const f = FOOD.items[i];
            if (circleHit(e.head.x, e.head.y, e.radius, f.x, f.y, f.r)) {
              FOOD.items.splice(i, 1);
              const gain = 14 + f.r * 6;
              e.lengthPx = clamp(e.lengthPx + gain, e.minLengthPx, e.maxLengthPx);
              //spawnFoodAt(f.x, f.y, 1, 40);
            }
          }


          // ENEMY DEATH COLLISION RULES


          // A) Enemy hits itself
          const selfHit = headHitsBody(
            e.head.x, e.head.y, e.radius * 0.85,
            e.body,
            12,               // skip near head
            e.radius * 0.80
          );

          if (selfHit) {
            dropFoodFromBody(e.body, 9, 2, 26);
            enemies[idx] = makeEnemySnake();
            continue;
          }

          // B) Enemy head hits PLAYER body => enemy dies
          const hitPlayer = headHitsBody(
            e.head.x, e.head.y, e.radius * 0.90,
            snake.body,
            28,
            snake.radius * 0.85
          );

          if (hitPlayer) {
            dropFoodFromBody(e.body, 9, 2, 26);
            enemies[idx] = makeEnemySnake(); // respawn this enemy
            continue;
          }
        }
      }


      // ----------------------------//
      // ---------- Player Snake ----//
      // ----------------------------//
      const snake = {
        head: { x: WORLD.w / 2, y: WORLD.h / 2, a: 0 },
        radius: 12,
        baseSpeed: 170,       // px/sec
        boostSpeed: 260,
        turnRate: 4.8,        // rad/sec max turn
        segmentSpacing: 10,   // px between sampled points (controls smoothness)
        lengthPx: 320,        // desired trail length in pixels
        minLengthPx: 220,
        maxLengthPx: 5000,
        trail: [],            // sampled points behind head
        // derived body points (for rendering & collision)
        body: [],
      };

      function initSnake() {
        snake.head.x = WORLD.w / 2 + rand(-200, 200);
        snake.head.y = WORLD.h / 2 + rand(-200, 200);
        snake.head.a = rand(0, TAU);
        snake.lengthPx = 320;
        snake.trail.length = 0;
        snake.body.length = 0;

        // Seed trail with a few points behind head
        for (let i = 0; i < 40; i++) {
          snake.trail.push({
            x: snake.head.x - Math.cos(snake.head.a) * i * snake.segmentSpacing,
            y: snake.head.y - Math.sin(snake.head.a) * i * snake.segmentSpacing
          });
        }
      }

      // --------------------------//
      // ---------- Food ----------//
      // --------------------------//
      const FOOD = {
        count: 150,
        minR: 3,
        maxR: 7,
        items: []
      };

      function spawnFood(n = FOOD.count) {
        FOOD.items.length = 0;
        for (let i = 0; i < n; i++) {
          FOOD.items.push({
            x: rand(0, WORLD.w),
            y: rand(0, WORLD.h),
            r: rand(FOOD.minR, FOOD.maxR),
            // not specifying colors; we'll render by size/alpha variation
            v: rand(0.5, 1.0),
          });
        }
      }

      function spawnFoodAt(x, y, n = 1, spread = 55) {
        for (let i = 0; i < n; i++) {
          FOOD.items.push({
            x: (x + rand(-spread, spread) + WORLD.w) % WORLD.w,
            y: (y + rand(-spread, spread) + WORLD.h) % WORLD.h,
            r: rand(FOOD.minR, FOOD.maxR),
            v: rand(0.5, 1.0)
          });
        }
      }

      // ----------------------------//
      // ---------- Camera ----------//
      // ----------------------------//
      const cam = { x: 0, y: 0, zoom: 1 };

      function updateCamera(dt) {
        // Subtle zoom out as you grow
        const targetZoom = clamp(1.0 - (snake.lengthPx - 320) / 9000, 0.58, 1.0);
        cam.zoom += (targetZoom - cam.zoom) * (1 - Math.pow(0.001, dt)); // smooth-ish
        cam.x = snake.head.x;
        cam.y = snake.head.y;
      }


      // --------------------------------//
      // ---------- Game State ----------//
      // --------------------------------//
      let score = 0;
      let dead = false;

      function gameOver() {
        dead = true;
        msgEl.style.display = "flex";
        msgEl.innerHTML = `<h1>Game Over<br><small>Press <b>R</b> to restart</small> </h1>`;
        // Drop food along the body
        const dropEvery = 14;
        for (let i = 0; i < snake.body.length; i += dropEvery) {
          const p = snake.body[i];
          spawnFoodAt(p.x, p.y, 1, 20);
        }
      }

      function restart() {
        dead = false;
        score = 0;
        scoreEl.textContent = String(score);
        msgEl.style.display = "none";
        initSnake();
        spawnEnemies();
        spawnFood();
      }


      // -------------------------------------------------//
      // ---------- Trail + Body reconstruction ----------//
      // -------------------------------------------------//
      function pushTrailPoint(x, y) {
        const t = snake.trail;
        const last = t[t.length - 1];
        if (!last) { t.push({ x, y }); return; }

        const dx = x - last.x, dy = y - last.y;
        const d = Math.hypot(dx, dy);
        if (d < snake.segmentSpacing) return;

        // Add points spaced by segmentSpacing to keep consistent
        const steps = Math.floor(d / snake.segmentSpacing);
        const nx = dx / d, ny = dy / d;
        for (let i = 1; i <= steps; i++) {
          t.push({
            x: last.x + nx * snake.segmentSpacing * i,
            y: last.y + ny * snake.segmentSpacing * i
          });
        }
      }

      function trimTrailToLengthPx() {
        // Trail points are spaced ~segmentSpacing, so we keep enough points
        const maxPoints = Math.ceil(snake.lengthPx / snake.segmentSpacing);
        if (snake.trail.length > maxPoints) {
          snake.trail.splice(0, snake.trail.length - maxPoints);
        }
      }

      function rebuildBodyFromTrail() {
        // body points = a downsample of trail (every k points), plus head
        const t = snake.trail;
        const body = snake.body;
        body.length = 0;

        // Keep body points about segmentSpacing apart visually; use trail directly
        // Ensure head is last trail point; render from tail to head.
        for (let i = 0; i < t.length; i++) body.push(t[i]);

        // Ensure head point present at end
        const last = body[body.length - 1];
        if (!last || last.x !== snake.head.x || last.y !== snake.head.y) {
          body.push({ x: snake.head.x, y: snake.head.y });
        }
      }


      // ----------------------------//
      // ---------- Update ----------//
      // ----------------------------//
      function update(dt) {
        if (dead) return;

        // Determine desired direction
        let targetAngle = snake.head.a;

        const screenCx = window.innerWidth / 2;
        const screenCy = window.innerHeight / 2;

        if (input.pointerActive) {
          let dx, dy;

          if (input.hasTouchDrag) {
            // Direction = drag vector
            dx = input.touchCurX - input.touchStartX;
            dy = input.touchCurY - input.touchStartY;
            if (Math.hypot(dx, dy) < 6) {
              // tiny drag: keep heading
              dx = Math.cos(snake.head.a);
              dy = Math.sin(snake.head.a);
            }
          } else {
            // Mouse: pointer position relative to screen center
            dx = input.pointerX - screenCx;
            dy = input.pointerY - screenCy;
          }

          targetAngle = Math.atan2(dy, dx);
        }

        // Smooth turn
        const maxTurn = snake.turnRate * dt;
        snake.head.a = angleLerp(snake.head.a, targetAngle, maxTurn);

        // Move head
        const speed = input.boost ? snake.boostSpeed : snake.baseSpeed;
        snake.head.x += Math.cos(snake.head.a) * speed * dt;
        snake.head.y += Math.sin(snake.head.a) * speed * dt;
        wrapToWorld(snake.head);

        // Trail sampling
        pushTrailPoint(snake.head.x, snake.head.y);
        trimTrailToLengthPx();
        rebuildBodyFromTrail();

        // Eat food
        const hr = snake.radius;
        for (let i = FOOD.items.length - 1; i >= 0; i--) {
          const f = FOOD.items[i];
          if (circleHit(snake.head.x, snake.head.y, hr, f.x, f.y, f.r)) {
            FOOD.items.splice(i, 1);
            // Grow: larger pellets = more growth
            const gain = 18 + f.r * 7;
            snake.lengthPx = clamp(snake.lengthPx + gain, snake.minLengthPx, snake.maxLengthPx);
            score += Math.round(gain);
            scoreEl.textContent = String(score);
            // Keep food density
            //spawnFoodAt(f.x, f.y, 2, 45);
          }
        }

        // Self-collision: check head vs body excluding nearby points
        // Skip the most recent points (neck) so you don't instantly collide.
        const body = snake.body;
        const skip = 10; // tune: more skip = more forgiving
        const collisionR = snake.radius * 0.82;

        for (let i = 0; i < body.length - skip; i++) {
          const p = body[i];
          if (circleHit(snake.head.x, snake.head.y, collisionR, p.x, p.y, collisionR * 0.92)) {
            gameOver();
            break;
          }
        }

        // --- PLAYER vs ENEMY BODY ---
        for (const e of enemies) {
          const hitEnemy = headHitsBody(
            snake.head.x, snake.head.y, snake.radius * 0.88,
            e.body,
            26,
            e.radius * 0.82
          );

          if (hitEnemy) {
            gameOver();
            break;
          }
        }

        // Respawn food if it gets low
        if (FOOD.items.length < FOOD.count * 0.92) {
          spawnFoodAt(rand(0, WORLD.w), rand(0, WORLD.h), 10, 900);
        }


        updateCamera(dt);
        updateEnemies(dt);
      }

      // ----------------------------//
      // ---------- Render ----------//
      // ----------------------------//
      function drawBackground() {
        // Base
        ctx.fillStyle = "#070a10";
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

        // Subtle star/speck noise (deterministic-ish each frame based on camera)
        // (cheap effect: a few tiny dots)
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#00ffff";
        const specks = 100;
        // Use camera position to "anchor" specks so they don't feel like static
        const seedX = Math.floor(cam.x * 0.03);
        const seedY = Math.floor(cam.y * 0.03);
        for (let i = 0; i < specks; i++) {
          const x = (i * 73 + seedX * 19) % window.innerWidth;
          const y = (i * 131 + seedY * 23) % window.innerHeight;
          const r = (i % 3 === 0) ? 1.2 : 0.8;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, TAU);
          ctx.fill();
        }
        ctx.restore();

        // Grid (softer + thicker major lines)
        const minor = 90;
        const major = minor * 5;

        const left = cam.x - (window.innerWidth / (2 * cam.zoom));
        const top = cam.y - (window.innerHeight / (2 * cam.zoom));
        const w = window.innerWidth / cam.zoom;
        const h = window.innerHeight / cam.zoom;

        const startMinorX = Math.floor(left / minor) * minor;
        const startMinorY = Math.floor(top / minor) * minor;
        const startMajorX = Math.floor(left / major) * major;
        const startMajorY = Math.floor(top / major) * major;

        ctx.save();
        // world-space drawing begins after transform, so we draw grid in world space:
        ctx.translate(window.innerWidth / 2, window.innerHeight / 2);
        ctx.scale(cam.zoom, cam.zoom);
        ctx.translate(-cam.x, -cam.y);

        // Minor lines
        ctx.globalAlpha = 0.10;
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#9fb0c8";
        ctx.beginPath();
        for (let x = startMinorX; x < left + w + minor; x += minor) {
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + h + minor);
        }
        for (let y = startMinorY; y < top + h + minor; y += minor) {
          ctx.moveTo(left, y);
          ctx.lineTo(left + w + minor, y);
        }
        ctx.stroke();

        // Major lines
        ctx.globalAlpha = 0.16;
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#cfe0ff";
        ctx.beginPath();
        for (let x = startMajorX; x < left + w + major; x += major) {
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + h + major);
        }
        for (let y = startMajorY; y < top + h + major; y += major) {
          ctx.moveTo(left, y);
          ctx.lineTo(left + w + major, y);
        }
        ctx.stroke();

        ctx.restore();

        // Vignette (screen-space)
        const g = ctx.createRadialGradient(
          window.innerWidth / 2, window.innerHeight / 2, Math.min(window.innerWidth, window.innerHeight) * 0.1,
          window.innerWidth / 2, window.innerHeight / 2, Math.max(window.innerWidth, window.innerHeight) * 0.75
        );
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      }


      function worldToScreenTransform() {
        // Center camera on screen and scale by zoom
        ctx.translate(window.innerWidth / 2, window.innerHeight / 2);
        ctx.scale(cam.zoom, cam.zoom);

        // Move world so cam position is at origin
        ctx.translate(-cam.x, -cam.y);
      }

      function drawFood() {

        for (const f of FOOD.items) {
          //creates a number from f size
          const t = (f.r - FOOD.minR) / (FOOD.maxR - FOOD.minR);
          //uses f energy 
          //const t = f.v;
          const color = colorFromT(t);
          // glow
          ctx.save();
          ctx.globalAlpha = 0.1 * f.v;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r * 2.6, 0, TAU);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.restore();

          // core
          ctx.save();
          ctx.globalAlpha = 0.90 * f.v;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, TAU);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.restore();

          // tiny highlight
          ctx.save();
          ctx.globalAlpha = 0.55 * f.v;
          ctx.beginPath();
          ctx.arc(f.x - f.r * 0.25, f.y - f.r * 0.25, Math.max(1, f.r * 0.35), 0, TAU);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.restore();
        }
      }

      function drawEnemy(e) {
        const body = e.body;
        if (body.length < 2) return;

        const maxR = e.radius;
        const minR = Math.max(4, e.radius * 0.45);

        // glow
        ctx.save();
        ctx.globalAlpha = 0.18;
        for (let i = 0; i < body.length; i++) {
          const t = i / (body.length - 1);
          const r = minR + (maxR - minR) * (t * t);
          const p = body[i];
          ctx.fillStyle = enemyColorFromT(t, e.hueShift);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 1.25, 0, TAU);
          ctx.fill();
        }
        ctx.restore();

        // main
        for (let i = 0; i < body.length; i++) {
          const t = i / (body.length - 1);
          const r = minR + (maxR - minR) * (t * t);
          const p = body[i];
          const color = enemyColorFromT(t, e.hueShift);

          ctx.save();
          ctx.globalAlpha = 0.98;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.restore();
        }

        // head
        const hx = e.head.x, hy = e.head.y;
        ctx.save();
        ctx.beginPath();
        ctx.arc(hx, hy, e.radius * 1.05, 0, TAU);
        ctx.fillStyle = enemyColorFromT(1, e.hueShift);
        ctx.fill();
        ctx.restore();
      }

      function drawEnemies() {
        for (const e of enemies) drawEnemy(e);
      }


      function drawSnake() {
        const body = snake.body;
        if (body.length < 2) return;

        const maxR = snake.radius;
        const minR = Math.max(4, snake.radius * 0.45);

        // Body: glow underlay
        ctx.save();
        ctx.globalAlpha = 0.22;

        for (let i = 0; i < body.length; i++) {
          const t = i / (body.length - 1);
          const r = minR + (maxR - minR) * (t * t);
          const p = body[i];
          const color = colorFromT(t);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.fill();
        }
        ctx.restore();

        // Body: main dots with subtle shading
        for (let i = 0; i < body.length; i++) {
          const t = i / (body.length - 1);
          const r = minR + (maxR - minR) * (t * t);
          const p = body[i];

          // base
          ctx.save();
          ctx.globalAlpha = 0.98;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.fillStyle = colorFromT(t);
          ctx.fill();
          ctx.restore();

          // shadow (lower-right)
          ctx.save();
          ctx.globalAlpha = 0.10;
          ctx.beginPath();
          ctx.arc(p.x + r * 0.18, p.y + r * 0.18, r * 0.92, 0, TAU);
          ctx.fillStyle = "#000000";
          ctx.fill();
          ctx.restore();

          // highlight (upper-left)
          ctx.save();
          ctx.globalAlpha = 0.20;
          ctx.beginPath();
          ctx.arc(p.x - r * 0.22, p.y - r * 0.22, Math.max(1, r * 0.45), 0, TAU);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.restore();
        }

        // Head
        const hx = snake.head.x, hy = snake.head.y;

        ctx.save();
        ctx.globalAlpha = 0.02;
        ctx.beginPath();
        ctx.arc(hx, hy, snake.radius * 2.2, 0, TAU);
        ctx.fillStyle = "#d7e6ff";
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(hx, hy, snake.radius * 1.08, 0, TAU);
        ctx.fillStyle = colorFromT(1);
        ctx.fill();

        // Eyes
        const eyeOffset = snake.radius * 0.55;
        const eyeR = snake.radius * 0.18;
        const ax = Math.cos(snake.head.a), ay = Math.sin(snake.head.a);
        const px = -ay, py = ax;

        const ex1 = hx + ax * eyeOffset + px * (eyeOffset * 0.5);
        const ey1 = hy + ay * eyeOffset + py * (eyeOffset * 0.5);
        const ex2 = hx + ax * eyeOffset - px * (eyeOffset * 0.5);
        const ey2 = hy + ay * eyeOffset - py * (eyeOffset * 0.5);

        ctx.fillStyle = "#070a10";
        ctx.beginPath(); ctx.arc(ex1, ey1, eyeR, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2, ey2, eyeR, 0, TAU); ctx.fill();

        // Tiny eye shines
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath(); ctx.arc(ex1 - eyeR * 0.25, ey1 - eyeR * 0.25, Math.max(1, eyeR * 0.35), 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(ex2 - eyeR * 0.25, ey2 - eyeR * 0.25, Math.max(1, eyeR * 0.35), 0, TAU); ctx.fill();

        ctx.restore();
      }


      function drawBoundsHint() {
        // Optional: faint world bounds
        ctx.save();
        ctx.globalAlpha = 0.10;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, WORLD.w, WORLD.h);
        ctx.restore();
      }

      function drawTouchJoystick() {
        if (!input.pointerActive || !input.hasTouchDrag) return;

        const x0 = input.touchStartX;
        const y0 = input.touchStartY;
        const x1 = input.touchCurX;
        const y1 = input.touchCurY;

        // draw in screen space, so reset transform
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(x0, y0, 34, 0, TAU);
        ctx.strokeStyle = "#d7e6ff";
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x1, y1, 12, 0, TAU);
        ctx.fillStyle = "#d7e6ff";
        ctx.fill();

        ctx.restore();
      }

      function render() {
        drawBackground();

        ctx.save();
        worldToScreenTransform();

        drawFood();
        drawEnemies();
        drawSnake();
        // drawBoundsHint(); // uncomment if you want to visualize the world box

        ctx.restore();

        drawTouchJoystick();
      }
      // -----------------------------//
      // ---------- Main Loop --------//
      // -----------------------------//
      let last = performance.now();
      function frame(now) {
        const dt = Math.min(0.033, (now - last) / 1000); // cap for stability
        last = now;

        update(dt);
        render();

        requestAnimationFrame(frame);
      }

      // ----------------------------//
      // ---------- Start -----------//
      // ----------------------------//
      restart();
      requestAnimationFrame(frame);

    })();