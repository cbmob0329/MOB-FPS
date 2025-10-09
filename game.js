// game.js
// メイン：背景スクロール、入力、レンガ障害物、弾と爆発の衝突、描画
import { Player, Explosion, Smoke, ASSETS, GROUND_Y } from './player.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const HUD = {
  rifle: document.getElementById('ammo_rifle'),
  smg: document.getElementById('ammo_smg'),
  gl: document.getElementById('ammo_gl'),
  shot: document.getElementById('ammo_shot'),
  reload: document.getElementById('reloadText'),
};

const W = canvas.width, H = canvas.height;

const world = {
  camX: 0,
  player: new Player(120, GROUND_Y),
  obstacles: [],
  bullets: [],
  effects: [],
  bg: new Image(),
  ready: false,
  spawnBullet(b){ this.bullets.push(b); },
  spawnExplosion(x,y){
    this.effects.push(new Explosion({x,y,r:60,dmg:100}));
    this.effects.push(new Smoke({x,y}));
  },
  updateAmmoHUD(weps){
    HUD.rifle.textContent = weps.rifle.ammo;
    HUD.smg.textContent   = weps.smg.ammo;
    HUD.gl.textContent    = weps.gl.ammo;
    HUD.shot.textContent  = weps.shot.ammo;
  }
};

// 背景
world.bg.src = 'fst1.png';

// 地面
function drawGround() {
  ctx.fillStyle = '#262d3a';
  ctx.fillRect(0, GROUND_Y + 1, W, H - GROUND_Y - 1);
}

// 入力
const input = {
  left:false, right:false, jump:false,
  fire_rifle:false, fire_smg:false, fire_gl:false, fire_shot:false,
};
const KEYMAP = {
  ArrowLeft:'left', ArrowRight:'right', Space:'jump',
  KeyZ:'fire_rifle', KeyX:'fire_smg', KeyC:'fire_gl', KeyV:'fire_shot'
};
window.addEventListener('keydown', (e)=>{
  const k = KEYMAP[e.code]; if (k) { input[k]=true; e.preventDefault(); }
});
window.addEventListener('keyup', (e)=>{
  const k = KEYMAP[e.code]; if (k) { input[k]=false; e.preventDefault(); }
});

// タッチボタン
document.querySelectorAll('button[data-key]').forEach(btn=>{
  const code = btn.getAttribute('data-key');
  const k = KEYMAP[code];
  const on = (v)=>{ input[k]=v; if (code==='Space' && !v) input.jump=false; };
  btn.addEventListener('touchstart', e=>{ on(true); e.preventDefault(); }, {passive:false});
  btn.addEventListener('touchend',   e=>{ on(false); e.preventDefault(); }, {passive:false});
  btn.addEventListener('mousedown',  e=>{ on(true); });
  btn.addEventListener('mouseup',    e=>{ on(false); });
  btn.addEventListener('mouseleave', e=>{ on(false); });
});

// レンガ障害物
class Brick {
  constructor(x) {
    this.x = x; this.y = GROUND_Y - 48; this.w = 64; this.h = 48;
    this.hp = 150; this.dead = false; this.fade = 0; // 0→1
  }
  aabb(){ return {x:this.x, y:this.y, w:this.w, h:this.h}; }
  hit(dmg){
    if (this.dead) return;
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp === 0) { this.dead = true; this.fade = 0.001; }
  }
  step(dt){
    if (this.dead) {
      this.fade += dt * 1.6;
      if (this.fade >= 1.0) this.toRemove = true;
    }
  }
  draw(ctx, camX){
    let key = 'ren1';
    if (this.hp <= 0) key = 'ren4';
    else if (this.hp <= 50) key = 'ren3';
    else if (this.hp <= 100) key = 'ren2';

    const asset = BRICK_ASSET[key];
    const dx = Math.floor(this.x - camX), dy = Math.floor(this.y);
    ctx.save();
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.fade);
    if (asset.ok) ctx.drawImage(asset.img, dx, dy, this.w, this.h);
    else { ctx.fillStyle='#7b4a3b'; ctx.fillRect(dx, dy, this.w, this.h); }
    ctx.restore();
  }
}

const BRICK_ASSET = {
  ren1: { img: new Image(), ok: false },
  ren2: { img: new Image(), ok: false },
  ren3: { img: new Image(), ok: false },
  ren4: { img: new Image(), ok: false },
};
for (const [k, v] of Object.entries(BRICK_ASSET)) {
  v.img.src = `${k}.png`;
  v.img.onload = ()=>{ v.ok = true; };
}

// ランダム配置
function spawnBricks() {
  world.obstacles.length = 0;
  let x = 280;
  for (let i=0;i<10;i++){
    x += 180 + Math.random()*220;
    world.obstacles.push(new Brick(x));
  }
}

// カメラ（プレイヤー中心寄り）
function updateCamera() {
  const target = world.player.x - W*0.38;
  world.camX += (target - world.camX) * 0.12;
  if (world.camX < 0) world.camX = 0;
}

// 背景スクロール描画（タイリング）
function drawBackground() {
  const img = world.bg;
  if (img.complete && img.naturalWidth>0){
    const par = 0.6;
    const scx = Math.floor(world.camX * par);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(W/iw, (GROUND_Y+120)/ih);
    const drawW = iw*scale, drawH = ih*scale;
    let start = - (scx % drawW);
    for (let x = start; x < W; x += drawW) {
      ctx.drawImage(img, x, GROUND_Y - drawH + 120, drawW, drawH);
    }
  } else {
    // フォールバック（画像未用意でも真っ暗回避）
    ctx.fillStyle = '#0a1220'; ctx.fillRect(0,0,W,GROUND_Y);
    ctx.fillStyle = '#0d1930';
    for (let i=0;i<8;i++) ctx.fillRect(i*60, 200 + (i%2)*18, 50, 8);
  }
}

// 弾と障害物の衝突
function rectHit(b, r){
  return b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h;
}
function handleCollisions(){
  // 弾 vs レンガ
  for (const b of world.bullets){
    if (b.dead) continue;
    // 地面衝突（グレネード）
    if (b.kind === 'grenade' && b.y >= GROUND_Y - 6){
      b.dead = true;
      world.spawnExplosion(b.x, GROUND_Y - 12);
      continue;
    }
    for (const ob of world.obstacles){
      if (ob.toRemove) continue;
      if (rectHit(b, ob.aabb())){
        if (b.kind === 'grenade'){
          b.dead = true;
          world.spawnExplosion(b.x, b.y);
        } else {
          ob.hit(b.dmg);
          b.dead = true;
        }
        break;
      }
    }
  }
  // 爆発の範囲ダメージ
  for (const ef of world.effects){
    if (!(ef instanceof Explosion)) continue;
    const r2 = ef.r * ef.r;
    for (const ob of world.obstacles){
      if (ob.toRemove) continue;
      const cx = Math.max(ob.x, Math.min(ef.x, ob.x + ob.w));
      const cy = Math.max(ob.y, Math.min(ef.y, ob.y + ob.h));
      const dx = ef.x - cx, dy = ef.y - cy;
      if (dx*dx + dy*dy <= r2){
        ob.hit(ef.dmg);
      }
    }
  }
}

// メインループ
let last = 0;
function loop(t) {
  const now = t/1000; const dt = Math.min(0.033, now - last || 0.016); last = now;

  // 更新
  world.player.step(dt, input, world);
  world.bullets.forEach(b=>b.step(dt));
  world.effects.forEach(e=>e.step(dt));
  world.obstacles.forEach(o=>o.step(dt));
  handleCollisions();

  // 後処理
  world.bullets = world.bullets.filter(b=>!b.dead);
  world.effects = world.effects.filter(e=>!e.dead);
  world.obstacles = world.obstacles.filter(o=>!o.toRemove);

  // カメラ
  updateCamera();

  // 描画
  ctx.clearRect(0,0,W,H);
  drawBackground();
  drawGround();

  // 障害物
  world.obstacles.forEach(o=>o.draw(ctx, world.camX));

  // プレイヤー（画像未配置でも青い矩形が表示される）
  world.player.draw(ctx, world.camX);

  // 弾/エフェクト
  world.bullets.forEach(b=>b.draw(ctx, world.camX));
  world.effects.forEach(e=>e.draw(ctx, world.camX));

  // リロード表示
  const re = world.player.reload;
  const rtime = Math.max(re.rifle, re.smg, re.gl, re.shot);
  HUD.reload.textContent = rtime>0 ? `RELOAD ${rtime.toFixed(1)}s` : 'READY';

  requestAnimationFrame(loop);
}

// 初期化
function init(){
  // 背景ロード失敗でも動くようにだけonload設定（必須ではない）
  world.bg.onload = ()=>{};
  world.updateAmmoHUD(world.player.weapons);
  spawnBricks();
  requestAnimationFrame(loop);
}
init();
