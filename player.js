// player.js
// 弾は各武器の画像(TA1~4.png)。銃口オフセットから発射、グレは必ず落ちる弾道。

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
  // 弾の見た目
  ta1: new Asset('TA1.png'), // ライフル
  ta2: new Asset('TA2.png'), // マシンガン
  ta3: new Asset('TA3.png'), // グレネード
  ta4: new Asset('TA4.png'), // ショットガン
  // エフェクト
  explosion: new Asset('moe.png'),
  smoke: new Asset('moku.png'),
};

// 物理は内部解像度前提（canvas: 420x560）
export const GROUND_Y = 460; // 地面ライン（キャンバス座標）

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
    this.trail = []; // 控えめトレーサー
  }
  step(dt) {
    this.t += dt;
    this.trail.push({x:this.x, y:this.y});
    if (this.trail.length > 5) this.trail.shift();
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // グレはしっかり落ちる（重力強め）
    if (this.kind === 'grenade') {
      this.vy += 980 * dt;   // 強めの重力
    }
    if (this.t >= this.life) this.dead = true;
  }
  draw(ctx, camX) {
    const sx = Math.floor(this.x - camX), sy = Math.floor(this.y);

    // トレーサー：画像の邪魔をしない薄さ
    if (this.trail.length >= 2) {
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.floor(this.trail[0].x - camX), Math.floor(this.trail[0].y));
      for (let i=1;i<this.trail.length;i++){
        ctx.lineTo(Math.floor(this.trail[i].x - camX), Math.floor(this.trail[i].y));
      }
      ctx.strokeStyle = (this.kind==='grenade') ? '#fff59d' : '#e3f2fd';
      ctx.stroke();
      ctx.restore();
    }

    // 弾画像（なければ点）
    let img = null, w = 10, h = 10;
    switch (this.kind) {
      case 'rifle':   img = ASSETS.ta1; w = h = 10; break;
      case 'smg':     img = ASSETS.ta2; w = h = 10; break;
      case 'shot':    img = ASSETS.ta4; w = h = 9;  break;
      case 'grenade': img = ASSETS.ta3; w = h = 16; break;
    }
    if (img && img.ok) ctx.drawImage(img.img, sx - (w>>1), sy - (h>>1), w, h);
    else {
      ctx.save();
      ctx.fillStyle = (this.kind==='grenade') ? '#fff59d' : '#bbdefb';
      const r = (this.kind==='grenade') ? 4 : 2.5;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }
}

// マズルフラッシュ（発射瞬間の閃光）
export class MuzzleFlash {
  constructor({ x, y, dir = 1, life = 0.08 }) {
    this.x = x; this.y = y; this.dir = dir; this.life = life; this.t = 0; this.dead = false;
  }
  s
