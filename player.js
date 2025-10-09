// player.js
// プレイヤー本体と武器挙動（弾/リロード/アニメ）

export class Asset {
  constructor(src) {
    this.img = new Image();
    this.img.src = src;
    this.ok = false;
    this.img.onload = () => { this.ok = true; };
  }
  drawFull(ctx, dx, dy, dw, dh) { if (this.ok) ctx.drawImage(this.img, dx, dy, dw, dh); }
}

export const ASSETS = {
  // プレイヤー
  fp: new Asset('fp.png'),
  fp1: new Asset('fp1.png'),
  fp2: new Asset('fp2.png'),
  fp3: new Asset('fp3.png'),
  fp4: new Asset('fp4.png'),
  fp5: new Asset('fp5.png'),
  // 弾の見た目（各武器の弾画像）
  ta1: new Asset('TA1.png'), // ライフル弾
  ta2: new Asset('TA2.png'), // マシンガン弾
  ta3: new Asset('TA3.png'), // グレネード弾
  ta4: new Asset('TA4.png'), // ショットガン弾（ペレット）
  // エフェクト
  explosion: new Asset('moe.png'),
  smoke: new Asset('moku.png'),
};

export const GROUND_Y = 460; // キャンバス高さ560px中の地面ライン

export class Timer {
  constructor() { this.t = 0; }
  step(dt) { this.t += dt; }
  ready(interval) { if (this.t >= interval) { this.t = 0; return true; } return false; }
}

export class Bullet {
  constructor({ x, y, vx, vy = 0, life = 0.9, dmg = 8, kind = 'rifle' }) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.t = 0; this.dmg = dmg; this.kind = kind;
    this.dead = false;
    this.trail = []; // トレーサー（控えめ）
  }
  step(dt) {
    this.t += dt;
    this.trail.push({x:this.x, y:this.y});
    if (this.trail.length > 5) this.trail.shift();

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.kind === 'grenade') this.vy += 980 * dt * 0.5; // 簡易重力
    if (this.t >= this.life) this.dead = true;
  }
  draw(ctx, camX) {
    const sx = Math.floor(this.x - camX), sy = Math.floor(this.y);

    // 1) 細いトレーサー（控えめ・画像の邪魔をしない）
    if (this.trail.length >= 2) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.floor(this.trail[0].x - camX), Math.floor(this.trail[0].y));
      for (let i=1;i<this.trail.length;i++){
        ctx.lineTo(Math.floor(this.trail[i].x - camX), Math.floor(this.trail[i].y));
      }
      ctx.strokeStyle = (this.kind==='grenade') ? '#fff59d' : '#e3f2fd';
      ctx.stroke();
      ctx.restore();
    }

    // 2) 画像で弾を描画（無ければフォールバックの点）
    let img = null, w = 10, h = 10; // 基本「小さめ」
    switch (this.kind) {
      case 'rifle': img = ASSETS.ta1; w = h = 10; break;          // ライフル：小粒
      case 'smg':   img = ASSETS.ta2; w = h = 10; break;          // マシンガン：小粒
      case 'shot':  img = ASSETS.ta4; w = h = 9;  break;          // ショットガン：さらに小粒
      case 'grenade': img = ASSETS.ta3; w = h = 16; break;        // グレ：他より大きめ
    }

    if (img && img.ok) {
      // 弾画像をセンター合わせで描画
      ctx.drawImage(img.img, sx - (w>>1), sy - (h>>1), w, h);
    } else {
      // フォールバック（点）
      ctx.save();
      ctx.fillStyle = (this.kind==='grenade') ? '#fff59d' : '#bbdefb';
      const r = (this.kind==='grenade') ? 4 : 2.5;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  }
}

export class Explosion {
  constructor({ x, y, r = 60, dmg = 100, life = 0.35 }) {
    this.x = x; this.y = y; this.r = r; this.dmg = dmg; this.life = life; this.t = 0; this.dead = false;
  }
  step(dt) { this.t += dt; if (this.t >= this.life) this.dead = true; }
  draw(ctx, camX) {
    const alpha = 1 - (this.t / this.life);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (ASSETS.explosion.ok) {
      ASSETS.explosion.drawFull(ctx, this.x - this.r - camX, this.y - this.r, this.r * 2, this.r * 2);
    } else {
      ctx.fillStyle = 'orange';
      ctx.beginPath();
      ctx.arc(this.x - camX, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export class Smoke {
  constructor({ x, y, life = 0.6 }) {
    this.x = x; this.y = y; this.life = life; this.t = 0; this.dead = false;
  }
  step(dt) { this.t += dt; if (this.t >= this.life) this.dead = true; }
  draw(ctx, camX) {
    const alpha = 1 - (this.t / this.life);
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    if (ASSETS.smoke.ok) {
      ASSETS.smoke.drawFull(ctx, this.x - 30 - camX, this.y - 30, 60, 60);
    } else {
      ctx.fillStyle = '#9aa7b1';
      ctx.beginPath();
      ctx.arc(this.x - camX, this.y - 15, 18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.w = 48; this.h = 64;
    this.onGround = false;
    this.face = 1; // 1:右向き

    this.anim = 'idle'; // idle, move, shoot
    this.frameTimer = 0;
    this.frameIdx = 0;

    // —— 武器（指定値で統一）——
    this.weapons = {
      rifle: { dmg:12, rate:0.50, ammoMax:8,  ammo:8,  reload:2.3, speed:960, range:2.4 }, // 長い
      smg:   { dmg:8,  rate:0.15, ammoMax:12, ammo:12, reload:2.0, speed:820, range:1.2 }, // 普通
      gl:    { dmg:50, rate:1.00, ammoMax:3,  ammo:3,  reload:5.0, speed:520, range:0.6 }, // 短い
      shot:  { dmg:15, rate:0.25, ammoMax:9,  ammo:9,  reload:3.0, speed:760, range:0.35 },// とても短い
    };
    this.cool = { rifle: new Timer(), smg: new Timer(), gl: new Timer(), shot: new Timer() };
    this.reload = { rifle:0, smg:0, gl:0, shot:0 };
    this.jumpPower = -520;
    this.moveSpeed = 220;
  }

  getFeetY(){ return this.y; }
  getDrawY(){ return this.y - this.h; }

  step(dt, input, world) {
    // 横移動
    this.vx = 0;
    if (input.left) this.vx = -this.moveSpeed;
    if (input.right) this.vx = this.moveSpeed;
    if (this.vx !== 0) this.face = Math.sign(this.vx);

    // ジャンプ
    if (input.jump && this.onGround) { this.vy = this.jumpPower; this.onGround = false; }

    // 重力
    this.vy += 1200 * dt;

    // 位置更新
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 地面
    if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; this.onGround = true; }

    // アニメ
    this.anim = (Math.abs(this.vx) > 1) ? 'move' : 'idle';
    this.frameTimer += dt;
    if (this.anim === 'move' && this.frameTimer > 0.12) {
      this.frameTimer = 0; this.frameIdx = (this.frameIdx + 1) % 3;
    }

    // CD/リロード
    for (const k of Object.keys(this.cool)) this.cool[k].step(dt);
    for (const k of Object.keys(this.reload)) this.reload[k] = Math.max(0, this.reload[k] - dt);

    // 射撃
    if (input.fire_rifle) this.tryFire('rifle', world);
    if (input.fire_smg)   this.tryFire('smg', world);
    if (input.fire_gl)    this.tryFire('gl', world);
    if (input.fire_shot)  this.tryFire('shot', world);
  }

  tryFire(kind, world) {
    const w = this.weapons[kind];
    const cd = this.cool[kind];
    if (this.reload[kind] > 0) return;
    if (w.ammo <= 0) { this.reload[kind] = w.reload; w.ammo = w.ammoMax; return; }
    if (!cd.ready(w.rate)) return;

    const dir = this.face;
    const muzzleX = this.x + dir * 26;
    const muzzleY = this.getFeetY() - this.h + 24;

    switch (kind) {
      case 'rifle': {
        world.spawnBullet(new Bullet({
          x: muzzleX, y: muzzleY, vx: dir * w.speed, life: w.range, dmg: w.dmg, kind:'rifle'
        }));
        break;
      }
      case 'smg': {
        // 少しだけ上下にバラす
        const spread = (Math.random()-0.5) * 20;
        world.spawnBullet(new Bullet({
          x: muzzleX, y: muzzleY + spread*0.02, vx: dir * w.speed, life: w.range, dmg: w.dmg, kind:'smg'
        }));
        break;
      }
      case 'gl': {
        // 放物線
        const vy = -420 + (Math.random()-0.5)*40;
        world.spawnBullet(new Bullet({
          x: muzzleX, y: muzzleY, vx: dir * w.speed*0.6, vy, life: w.range, dmg: w.dmg, kind:'grenade'
        }));
        break;
      }
      case 'shot': {
        // 3ペレット（とても短い距離）
        for (let i=0;i<3;i++){
          const ang = (Math.random()-0.5)*0.22; // 拡散
          const vx = Math.cos(ang) * w.speed * dir;
          const vy = Math.sin(ang) * w.speed * 0.12;
          world.spawnBullet(new Bullet({
            x: muzzleX, y: muzzleY, vx, vy, life: w.range, dmg: w.dmg, kind:'shot'
          }));
        }
        break;
      }
    }
    w.ammo--;
    this.anim = 'shoot';
    this.frameIdx = 0;
    this.frameTimer = 0;
    world.updateAmmoHUD(this.weapons);
  }

  draw(ctx, camX) {
    ctx.save();
    ctx.translate(Math.floor(this.x - camX), Math.floor(this.getDrawY()));
    if (this.face < 0) { ctx.scale(-1,1); ctx.translate(-this.w,0); }

    let sprite = ASSETS.fp;
    if (this.anim === 'shoot') sprite = (this.frameTimer < 0.08) ? ASSETS.fp4 : ASSETS.fp5;
    else if (this.anim === 'move') sprite = [ASSETS.fp1, ASSETS.fp2, ASSETS.fp3][this.frameIdx] || ASSETS.fp1;

    if (sprite.ok) sprite.drawFull(ctx, 0, 0, this.w, this.h);
    else { ctx.fillStyle = '#3aa0ff'; ctx.fillRect(0, 0, this.w, this.h); }
    ctx.restore();
  }
}
