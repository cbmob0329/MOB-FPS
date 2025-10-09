// player.js
// プレイヤー本体と武器挙動（弾/リロード/アニメ）を担当

export class Asset {
  constructor(src) {
    this.img = new Image();
    this.img.src = src;
    this.ok = false;
    this.img.onload = () => { this.ok = true; };
  }
  draw(ctx, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (this.ok) ctx.drawImage(this.img, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  drawFull(ctx, dx, dy, dw, dh) {
    if (this.ok) ctx.drawImage(this.img, dx, dy, dw, dh);
  }
}

export const ASSETS = {
  // プレイヤー
  fp: new Asset('fp.png'),
  fp1: new Asset('fp1.png'),
  fp2: new Asset('fp2.png'),
  fp3: new Asset('fp3.png'),
  fp4: new Asset('fp4.png'),
  fp5: new Asset('fp5.png'),
  // 武器アイコン/本体（任意表示）
  ta1: new Asset('TA1.png'),
  ta2: new Asset('TA2.png'),
  ta3: new Asset('TA3.png'),
  ta4: new Asset('TA4.png'),
  // 爆発/煙
  explosion: new Asset('moe.png'),
  smoke: new Asset('moku.png'),
};

export const GROUND_Y = 600; // 地面ライン（Canvas内Y）

export class Timer {
  constructor() { this.t = 0; }
  step(dt) { this.t += dt; }
  ready(interval) { if (this.t >= interval) { this.t = 0; return true; } return false; }
}

export class Bullet {
  constructor({ x, y, vx, vy = 0, life = 0.9, dmg = 8, kind = 'rifle', size = 4 }) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.t = 0; this.dmg = dmg; this.kind = kind; this.size = size;
    this.dead = false;
  }
  step(dt) {
    this.t += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.kind === 'grenade') {
      this.vy += 980 * dt * 0.5; // 簡易重力
    }
    if (this.t >= this.life) this.dead = true;
  }
  draw(ctx, camX) {
    ctx.save();
    ctx.fillStyle = '#d7f0ff';
    switch (this.kind) {
      case 'rifle':
      case 'smg':
        ctx.fillRect(Math.floor(this.x - camX), Math.floor(this.y), this.size, this.size);
        break;
      case 'shot':
        ctx.fillRect(Math.floor(this.x - camX), Math.floor(this.y), this.size, this.size);
        break;
      case 'grenade':
        ctx.fillStyle = '#a2c0ff';
        ctx.beginPath();
        ctx.arc(Math.floor(this.x - camX), Math.floor(this.y), this.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
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
    this.x = x; this.y = y; // 座標（左下基準で描画時は補正）
    this.vx = 0; this.vy = 0;
    this.w = 48; this.h = 64;
    this.onGround = false;
    this.face = 1; // 1:右
    // アニメ
    this.anim = 'idle'; // idle, move, shoot
    this.frameTimer = 0;
    this.frameIdx = 0;

    // 武器状態
    this.weapons = {
      rifle: { dmg: 12, rate: 0.28, ammoMax: 8, ammo: 8, reload: 2.3, speed: 960, range: 1.6 },
      smg:   { dmg: 8,  rate: 0.12, ammoMax:12, ammo:12, reload: 2.0, speed: 820, range: 1.1 },
      gl:    { dmg: 50, rate: 0.7,  ammoMax: 3, ammo: 3, reload: 5.0, speed: 520, range: 1.2 },
      shot:  { dmg: 15, rate: 0.18, ammoMax: 9, ammo: 9, reload: 3.0, speed: 760, range: 0.45 },
    };
    this.cool = { rifle: new Timer(), smg: new Timer(), gl: new Timer(), shot: new Timer() };
    this.reload = { rifle:0, smg:0, gl:0, shot:0 }; // 残り秒。>0ならリロード中
    this.jumpPower = -560;
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
    if (input.jump && this.onGround) {
      this.vy = this.jumpPower;
      this.onGround = false;
    }

    // 重力
    this.vy += 1200 * dt;
    // 位置更新
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 地面判定
    if (this.y >= GROUND_Y) {
      this.y = GROUND_Y; this.vy = 0; this.onGround = true;
    }

    // アニメ
    if (Math.abs(this.vx) > 1) this.anim = 'move';
    else this.anim = 'idle';
    this.frameTimer += dt;
    if (this.anim === 'move' && this.frameTimer > 0.12) {
      this.frameTimer = 0; this.frameIdx = (this.frameIdx + 1) % 3;
    }

    // クールダウン/リロード
    for (const k of Object.keys(this.cool)) this.cool[k].step(dt);
    for (const k of Object.keys(this.reload)) this.reload[k] = Math.max(0, this.reload[k] - dt);

    // 射撃入力
    if (input.fire_rifle) this.tryFire('rifle', world);
    if (input.fire_smg)   this.tryFire('smg', world);
    if (input.fire_gl)    this.tryFire('gl', world);
    if (input.fire_shot)  this.tryFire('shot', world);
  }

  tryFire(kind, world) {
    const w = this.weapons[kind];
    const cd = this.cool[kind];
    if (this.reload[kind] > 0) return; // リロード中
    if (w.ammo <= 0) { // 自動リロード
      this.reload[kind] = w.reload; w.ammo = w.ammoMax; return;
    }
    if (!cd.ready(w.rate)) return;

    // 発射
    const dir = this.face;
    const muzzleX = this.x + dir * 26;
    const muzzleY = this.getFeetY() - this.h + 24;

    switch (kind) {
      case 'rifle': {
        world.spawnBullet(new Bullet({
          x: muzzleX, y: muzzleY, vx: dir * w.speed, life: w.range, dmg: w.dmg, kind:'rifle', size:3.5
        }));
        break;
      }
      case 'smg': {
        // 少しばらつき
        const spread = (Math.random()-0.5) * 28;
        world.spawnBullet(new Bullet({
          x: muzzleX, y: muzzleY + spread*0.02, vx: dir * w.speed, life: w.range, dmg: w.dmg, kind:'smg', size:3
        }));
        break;
      }
      case 'gl': {
        // 放物線（上方向に初速）
        const vy = -420 + (Math.random()-0.5)*40;
        world.spawnBullet(new Bullet({
          x: muzzleX, y: muzzleY, vx: dir * w.speed*0.6, vy, life: w.range+0.3, dmg: w.dmg, kind:'grenade', size:5.5
        }));
        break;
      }
      case 'shot': {
        // 3ペレット、短命
        for (let i=0;i<3;i++){
          const ang = (Math.random()-0.5)*0.18; // ばらけ
          const vx = Math.cos(ang) * w.speed * dir;
          const vy = Math.sin(ang) * w.speed * 0.1;
          world.spawnBullet(new Bullet({
            x: muzzleX, y: muzzleY, vx, vy, life: w.range, dmg: w.dmg, kind:'shot', size:3.8
          }));
        }
        break;
      }
    }
    w.ammo--;
    this.anim = 'shoot';
    this.frameIdx = 0;
    this.frameTimer = 0;

    // HUD更新
    world.updateAmmoHUD(this.weapons);
  }

  draw(ctx, camX) {
    // 向き
    ctx.save();
    ctx.translate(Math.floor(this.x - camX), Math.floor(this.getDrawY()));
    if (this.face < 0) { ctx.scale(-1,1); ctx.translate(-this.w,0); }

    // アニメ画像選択
    let sprite = ASSETS.fp;
    if (this.anim === 'shoot') sprite = (this.frameTimer < 0.08) ? ASSETS.fp4 : ASSETS.fp5;
    else if (this.anim === 'move') {
      sprite = [ASSETS.fp1, ASSETS.fp2, ASSETS.fp3][this.frameIdx] || ASSETS.fp1;
    }

    if (sprite.ok) sprite.drawFull(ctx, 0, 0, this.w, this.h);
    else {
      // 代替矩形
      ctx.fillStyle = '#66f';
      ctx.fillRect(0, 0, this.w, this.h);
    }

    ctx.restore();
  }
}
