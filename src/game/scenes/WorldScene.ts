/**
 * WorldScene — 마을과 농장을 모두 그리는 메인 게임 장면.
 * 공간(space)이 바뀌면 장면을 재시작하며, 표시할 지도/농장은 스토어에서 읽습니다.
 */
import Phaser from 'phaser';
import { CROP_MAP, formatDuration } from '@/config/crops';
import { GAME_CONFIG, farmOwnerOf, houseOwnerOf, isFarmSpace } from '@/config/game';
import { bestRod, FERT_MAP, FISH_MAP, FURN_MAP } from '@/config/shop';
import { dayPhase } from '@/config/night';
import { Beggars } from '../systems/Beggars';
import { FRUIT_COOLDOWN_SEC, FRUIT_NAMES, FRUIT_REWARD, WATER, type FruitKind } from '@/config/fruit';
import { growthInfo, STAGE_LABELS } from '@/features/economy/rules';
import { inputLocked, serverNow, useGame } from '@/stores/gameStore';
import type { Direction, EmoteKind, MovePacket, PresenceInfo } from '@/types';
import { renderGround, T, TS } from '../art/tiles';
import { bus } from '../bus';
import { Avatar } from '../entities/Avatar';
import { buildFarm, plotCenter } from '../maps/farm';
import { buildHouse } from '../maps/house';
import { HouseLayer } from '../systems/HouseLayer';
import type { GameMap, Interactable, Rect } from '../maps/types';
import { buildVillage } from '../maps/village';
import { FarmLayer } from '../systems/FarmLayer';
import { Overlay } from '../systems/Overlay';
import { registerArt } from '../systems/textures';

const FEET_W = 10;
/** 접속자 목록에서 빠져도 이 시간 동안은 캐릭터를 유지. 진짜로 떠날 때는 '작별 신호'로 바로 지움 */
const PEER_GRACE_MS = 45_000;
const FEET_H = 6;

export interface WorldInit { arrival?: 'start' | 'gate' | 'farm' | 'house' }

export class WorldScene extends Phaser.Scene {
  private map!: GameMap;
  private world!: Phaser.GameObjects.Layer;
  private overlay!: Overlay;
  private me!: Avatar;
  private others = new Map<string, Avatar>();
  private colliders: Rect[] = [];
  private farmLayer: FarmLayer | null = null;
  private cursor: Phaser.GameObjects.Image | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private unsubs: (() => void)[] = [];
  private lastSend = 0;
  private lastSent = { x: 0, y: 0, dir: 'down' as Direction, moving: false, vx: 0, vy: 0 };
  /** 이번 프레임의 실제 이동 속도 (걷기 속도 기준 -1..1) */
  private vel = { x: 0, y: 0 };
  private movedDist = 0;
  private tutorialMovedSent = false;
  private interactTarget: Interactable | null = null;
  private plotTarget: { x: number; y: number } | null = null;
  private insideTrigger: string | null = null;
  /** 벤치에 앉기 직전 위치 (일어날 때 돌아갈 자리) */
  private standSpot: { x: number; y: number } | null = null;
  /** 접속자 목록에서 빠진 시각 (잠깐의 연결 흔들림으로 캐릭터가 깜빡이지 않도록 유예) */
  private missingSince = new Map<string, number>();
  private peerSweepTimer = 0;
  /** 과일 나무 (딸 수 있으면 열매가 보이고, 딴 뒤 30분은 열매 없는 모습) */
  private fruitTrees: { id: string; fruit: FruitKind; img: Phaser.GameObjects.Image; marker: Phaser.GameObjects.Image }[] = [];
  private fruitInteractables: Interactable[] = [];
  private fruitTimer = 0;
  /** 속도 정보 없는 이동 패킷(= 예전 버전 화면)을 마지막으로 받은 시각 */
  private legacyPeerSeen = -Infinity;
  private hoverTimer = 0;
  private arrival: WorldInit['arrival'] = 'start';
  private ambientTimer = 0;
  private vignette: Phaser.GameObjects.Image | null = null;
  /** 집 안 가구 */
  private houseLayer: HouseLayer | null = null;
  /** 가구를 놓을 칸 (E 로 놓기) */
  private ghostTile: { x: number; y: number } | null = null;
  private lastPointerMove = -Infinity;
  private lastKeyMove = -Infinity;
  /** 낚시: 찌 / 낚싯줄 / 느낌표 */
  private fishSpot: { x: number; y: number } | null = null;
  private bobber: Phaser.GameObjects.Image | null = null;
  private fishLine: Phaser.GameObjects.Graphics | null = null;
  private exclaimIcon: Phaser.GameObjects.Image | null = null;
  /** 낮/밤: 어둠 + 가로등 불빛 + 내 주변 불빛 */
  private nightShade: Phaser.GameObjects.Rectangle | null = null;
  private glows: Phaser.GameObjects.Image[] = [];
  private myGlow: Phaser.GameObjects.Image | null = null;
  private wasNight: boolean | null = null;
  /** 밤의 마을 거지 */
  private beggars: Beggars | null = null;

  constructor() { super('world'); }

  init(data: WorldInit) {
    this.arrival = data?.arrival ?? 'start';
    this.others = new Map();
    this.missingSince = new Map();
    this.fruitTrees = [];
    this.fruitInteractables = [];
    this.colliders = [];
    this.unsubs = [];
    this.farmLayer = null;
    this.houseLayer = null;
    this.ghostTile = null;
    this.bobber = null;
    this.fishLine = null;
    this.exclaimIcon = null;
    this.fishSpot = null;
    this.nightShade = null;
    this.glows = [];
    this.myGlow = null;
    this.wasNight = null;
    this.beggars = null;
    this.cursor = null;
    this.insideTrigger = null;
    this.tutorialMovedSent = false;
    this.movedDist = 0;
  }

  create() {
    const st = useGame.getState();
    const isFarm = isFarmSpace(st.space);
    const inHouse = !!houseOwnerOf(st.space) && !!st.viewHouse;
    this.map = inHouse ? buildHouse(st.viewHouse!.w, st.viewHouse!.h) : isFarm ? buildFarm() : buildVillage();
    registerArt(this);

    this.world = this.add.layer();
    const groundKey = this.map.id === 'house' ? `ground_house_${this.map.w}x${this.map.h}` : `ground_${this.map.id}`;
    if (!this.textures.exists(groundKey)) this.textures.addCanvas(groundKey, renderGround(this.map.tiles, this.map.w, this.map.h));
    this.world.add(this.add.image(0, 0, groundKey).setOrigin(0, 0).setDepth(-10000));

    // 지도 오브젝트
    for (const o of this.map.objects) {
      const depth = o.depth !== undefined ? -900 + o.depth * 10 : o.y;
      const obj = o.anim
        ? this.add.sprite(o.x, o.y, o.key, 0).play(`${o.key}_play`)
        : this.add.image(o.x, o.y, o.key);
      obj.setOrigin(0.5, 1).setDepth(depth).setFlipX(!!o.flipX);
      this.world.add(obj);
      if (o.collide) {
        const dy = o.collide.dy ?? 0;
        this.colliders.push({ x: o.x - o.collide.w / 2, y: o.y - dy - o.collide.h, w: o.collide.w, h: o.collide.h });
      }
      if (o.fruitId && o.fruit && obj instanceof Phaser.GameObjects.Image) {
        // "딸 수 있어요" 열매 표시 (통통 튀는 아이콘)
        const marker = this.add.image(o.x, o.y - 44, `fruit_marker_${o.fruit}`).setOrigin(0.5, 1).setDepth(o.y + 1);
        this.world.add(marker);
        this.tweens.add({ targets: marker, y: o.y - 48, yoyo: true, repeat: -1, duration: 650, ease: 'Sine.easeInOut', delay: Math.random() * 600 });
        this.fruitTrees.push({ id: o.fruitId, fruit: o.fruit, img: obj, marker });
        // 마을 나무는 누구나, 농장 나무는 농장 주인만 딸 수 있음 (나무 둘레 어디서든)
        const canPick = !isFarm || farmOwnerOf(st.space) === st.profile?.id;
        if (canPick) this.fruitInteractables.push({ id: o.fruitId, kind: 'fruit', x: o.x, y: o.y - 4, r: 30, prompt: '' });
      }
    }
    this.colliders.push(...this.map.walls);
    this.refreshFruit();

    this.overlay = new Overlay(this);
    for (const l of this.map.labels) this.overlay.addLabel(l.x, l.y, l.text, l.style);

    // 농장
    if (isFarm && st.viewFarm) {
      this.farmLayer = new FarmLayer(this, (o) => this.world.add(o));
      this.farmLayer.setFarm(st.viewFarm);
      this.overlay.addLabel(288, 336, `${st.viewFarm.ownerNickname}의 농장`, 'banner');
      this.cursor = this.add.image(0, 0, 'plot_cursor').setDepth(-400).setVisible(false);
      this.world.add(this.cursor);
      this.tweens.add({ targets: this.cursor, alpha: { from: 1, to: 0.55 }, yoyo: true, repeat: -1, duration: 600 });
    }

    // 집 안
    if (inHouse) {
      this.houseLayer = new HouseLayer(this, (o) => this.world.add(o));
      this.houseLayer.setHouse(st.viewHouse!);
      this.overlay.addLabel((this.map.w * TS) / 2, 13, `${st.viewHouse!.ownerNickname}의 집`, 'banner');
    }

    // 내 캐릭터
    const profile = st.profile!;
    let spawn = { ...this.map.spawn };
    if (!isFarm && !inHouse && this.arrival === 'gate') spawn = { x: 448, y: 606 };
    if (isFarm && this.arrival === 'house') spawn = { x: 96, y: 154 }; // 집에서 나오면 집 앞
    if (!inHouse) {
      spawn.x += Math.round((Math.random() - 0.5) * (this.arrival === 'house' ? 12 : 36));
      spawn.y += Math.round((Math.random() - 0.5) * 10);
    }
    this.me = new Avatar(this, profile.id, profile.nickname, profile.appearance, spawn.x, spawn.y, true);
    this.world.add([this.me.shadow, this.me.sprite]);
    this.overlay.setNameTag(profile.id, profile.nickname, true);
    this.lastSent = { x: spawn.x, y: spawn.y, dir: 'down', moving: false, vx: 0, vy: 0 };

    this.setupNight();
    this.setupCameras();
    this.setupInput();
    this.setupBus();
    this.setupAmbient();

    // 이미 접속 중인 사람들 표시
    this.syncPeers(useGame.getState().peers);
    this.cameras.main.fadeIn(350, 255, 248, 230);
    bus.emit('scene:ready');
    this.time.delayedCall(80, () => this.sendNow()); // 새 공간의 내 위치를 바로 알림
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    this.events.once(Phaser.Scenes.Events.DESTROY, () => this.cleanup());
  }

  // ───────────────────────── 낮과 밤 ─────────────────────────
  private setupNight() {
    if (!this.textures.exists('light_glow')) {
      const c = document.createElement('canvas');
      c.width = 128; c.height = 128;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,236,170,0.95)');
      g.addColorStop(0.35, 'rgba(255,214,130,0.45)');
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      this.textures.addCanvas('light_glow', c);
    }
    const W = this.map.w * TS, H = this.map.h * TS;
    this.nightShade = this.add.rectangle(-2000, -2000, W + 4000, H + 4000, 0x161a48).setOrigin(0, 0).setDepth(9e5).setAlpha(0);
    this.world.add(this.nightShade);
    for (const o of this.map.objects) {
      if (o.key !== 'lamp') continue;
      const gl = this.add.image(o.x, o.y - 24, 'light_glow').setDepth(9e5 + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(1.1);
      this.world.add(gl);
      this.glows.push(gl);
    }
    this.myGlow = this.add.image(0, 0, 'light_glow').setDepth(9e5 + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setScale(0.75);
    this.world.add(this.myGlow);
    if (this.map.id === 'village') {
      this.beggars = new Beggars(this, {
        me: this.me, others: this.others, overlay: this.overlay,
        blocked: (x, y) => this.blocked(x, y),
        add: (objs) => this.world.add(objs),
      });
    }
  }

  private nightTick(delta: number) {
    const now = serverNow();
    const ph = dayPhase(now);
    const indoor = this.map.id === 'house';
    this.nightShade?.setAlpha(ph.darkness * (indoor ? 0.22 : 0.52));
    for (const g of this.glows) g.setAlpha(ph.darkness * 0.75);
    this.myGlow?.setPosition(this.me.x, this.me.y - 10).setAlpha(indoor ? 0 : ph.darkness * 0.28);
    if (this.wasNight === false && ph.night) bus.emit('night:start');
    this.wasNight = ph.night;
    if (!this.beggars) return;
    if (ph.night) this.beggars.spawn(ph.cycleIndex);
    else this.beggars.despawn();
    const st = useGame.getState();
    this.beggars.update(delta, now, (id) => st.beggarRobbed.includes(id), st.phase === 'playing' && !st.traveling && st.space === 'village',
      (id) => bus.emit('beggar:caught', id));
  }

  // ───────────────────────── 카메라 ─────────────────────────
  private computeZoom() {
    const w = this.scale.width, h = this.scale.height;
    return Math.max(2, Math.floor(Math.min(w / 400, h / 230)));
  }

  private setupCameras() {
    const cam = this.cameras.main;
    cam.setRoundPixels(true);
    cam.setBackgroundColor(this.map.id === 'house' ? '#5a3a34' : '#a8d973');
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'ui');
    this.uiCam.ignore(this.world);
    cam.ignore(this.overlay.layer);
    this.applyCameraSize();
    cam.startFollow(this.me.sprite, true, 0.14, 0.14, 0, 10);
    cam.centerOn(this.me.x, this.me.y - 10);

    // 은은한 햇살 비네트
    if (!this.textures.exists('vignette')) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 256;
      const ctx = c.getContext('2d')!;
      const g = ctx.createRadialGradient(128, 110, 40, 128, 128, 190);
      g.addColorStop(0, 'rgba(255,240,200,0)');
      g.addColorStop(1, 'rgba(120,80,60,0.38)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 256);
      this.textures.addCanvas('vignette', c);
    }
    this.vignette = this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(-1).setAlpha(0.5);
    this.overlay.layer.add(this.vignette);
    this.resizeVignette();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
  }

  private onResize() {
    this.applyCameraSize();
    this.resizeVignette();
  }

  private resizeVignette() {
    this.vignette?.setDisplaySize(this.scale.width, this.scale.height);
  }

  private applyCameraSize() {
    const cam = this.cameras.main;
    const zoom = this.computeZoom();
    cam.setSize(this.scale.width, this.scale.height);
    cam.setZoom(zoom);
    this.uiCam?.setSize(this.scale.width, this.scale.height);
    const mw = this.map.w * TS, mh = this.map.h * TS;
    const vw = this.scale.width / zoom, vh = this.scale.height / zoom;
    // 지도가 화면보다 작으면 가운데 정렬
    const bx = vw > mw ? -(vw - mw) / 2 : 0;
    const by = vh > mh ? -(vh - mh) / 2 : 0;
    cam.setBounds(bx, by, Math.max(mw, vw), Math.max(mh, vh));
  }

  // ───────────────────────── 입력 ─────────────────────────
  private setupInput() {
    const kb = this.input.keyboard!;
    kb.disableGlobalCapture(); // 채팅 입력창에서 W/A/S/D/Space 를 타이핑할 수 있도록
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    const onAction = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (inputLocked()) return;
      ev.preventDefault();
      this.doInteract();
    };
    kb.on('keydown-E', onAction);
    kb.on('keydown-R', (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (inputLocked() || !this.farmLayer) return;
      const st = useGame.getState();
      if (farmOwnerOf(st.space) === st.profile?.id) return; // 내 밭은 물 주기 대상이 아님
      ev.preventDefault();
      bus.emit('water'); // 친구 밭 전체에 물 주기
    });
    kb.on('keydown-SPACE', onAction);
    this.input.on('pointermove', () => { this.lastPointerMove = performance.now(); });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (inputLocked()) return;
      const avatar = [...this.others.values()].find((a) => over.includes(a.sprite));
      if (avatar) {
        useGame.getState().openModal('player', { id: avatar.id, nickname: avatar.nickname });
        return;
      }
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      if (this.houseLayer) {
        const st = useGame.getState();
        if (!st.houseEdit) return;
        const t = this.houseLayer.tileAtWorld(wp.x, wp.y);
        if (!t) return;
        if (st.housePlacing) { bus.emit('house:tile', this.placeOrigin(st.housePlacing.furnId, t)); return; }
        const it = this.houseLayer.itemAt(t.x, t.y);
        if (it) { st.set({ housePlacing: { furnId: it.type, color: it.color, moveId: it.id } }); }
        return;
      }
      if (!this.farmLayer) return;
      const plot = this.farmLayer.plotAtWorld(wp.x, wp.y);
      if (!plot) return;
      const c = plotCenter(plot.x, plot.y);
      if (Math.hypot(c.x - this.me.x, c.y - (this.me.y - 4)) > 40) {
        useGame.getState().toast('조금 더 가까이 가 주세요!');
        return;
      }
      this.me.setState(this.dirTowards(c.x, c.y), false);
      bus.emit('plot', plot);
    });
  }

  /** 가리킨 칸이 가구의 가운데(아래쪽)가 되도록 왼쪽 위 칸 계산 */
  private placeOrigin(furnId: string, t: { x: number; y: number }) {
    const d = FURN_MAP[furnId];
    return d ? { x: t.x - Math.floor((d.w - 1) / 2), y: t.y - (d.h - 1) } : t;
  }

  /** 바라보는 쪽에 물이 있으면 찌가 떨어질 자리 */
  private waterAhead(): { x: number; y: number } | null {
    if (this.map.id === 'house') return null;
    const d = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[this.me.dir];
    const isWater = (x: number, y: number) => this.tileAt(Math.floor(x / TS), Math.floor(y / TS)) === T.Water;
    for (const dist of [9, 15, 21]) {
      const px = this.me.x + d[0] * dist, py = this.me.y - 3 + d[1] * dist;
      if (!isWater(px, py)) continue;
      const fx = px + d[0] * 12, fy = py + d[1] * 12;
      return isWater(fx, fy) ? { x: fx, y: fy } : { x: px, y: py };
    }
    return null;
  }

  private dirTowards(x: number, y: number): Direction {
    const dx = x - this.me.x, dy = y - (this.me.y - 4);
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
    return dy < 0 ? 'up' : 'down';
  }

  /** 벤치에서 일어나기: 앉기 전의(부딪힘 없는) 자리로 돌아감 */
  private standUp() {
    if (!this.me.sitting) return;
    if (this.standSpot && !this.blocked(this.standSpot.x, this.standSpot.y)) this.me.setPos(this.standSpot.x, this.standSpot.y);
    else this.unstick();
    this.standSpot = null;
    this.me.sit(false);
    this.sendNow();
  }

  /** 혹시 장애물에 끼었으면 가장 가까운 빈 자리로 빼 주기 */
  private unstick() {
    const { x, y } = this.me;
    if (!this.blocked(x, y)) return;
    for (let r = 2; r <= 40; r += 2) {
      for (const [dx, dy] of [[0, r], [0, -r], [-r, 0], [r, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
        if (!this.blocked(x + dx, y + dy)) { this.me.setPos(x + dx, y + dy); return; }
      }
    }
  }

  /** 지금 있는 친구 밭에 다시 물을 줄 수 있을 때까지 남은 시간(초) */
  private waterWait() {
    const st = useGame.getState();
    const owner = farmOwnerOf(st.space);
    const last = owner ? st.waterLogs[owner] : undefined;
    return last ? Math.max(0, (last + WATER.cooldownSec * 1000 - serverNow()) / 1000) : 0;
  }

  /** 남은 대기 시간(초). 0 이면 딸 수 있음 */
  private fruitWait(id: string) {
    const picked = useGame.getState().fruitPicks[id];
    if (!picked) return 0;
    return Math.max(0, (picked + FRUIT_COOLDOWN_SEC * 1000 - serverNow()) / 1000);
  }

  private refreshFruit() {
    const st = useGame.getState();
    const visiting = isFarmSpace(st.space) && farmOwnerOf(st.space) !== st.profile?.id;
    for (const t of this.fruitTrees) {
      const bare = !visiting && this.fruitWait(t.id) > 0;
      const key = bare ? `tree_${t.fruit}_bare` : `tree_${t.fruit}`;
      if (t.img.texture.key !== key) t.img.setTexture(key);
      t.marker.setVisible(!visiting && !bare); // 딸 수 있을 때만 표시
    }
  }

  private doInteract() {
    if (this.me.sitting) { this.standUp(); return; }
    const st = useGame.getState();
    if (st.fishing) { bus.emit('fish:reel'); return; }
    if (this.houseLayer && st.houseEdit && st.housePlacing) {
      if (this.ghostTile) bus.emit('house:tile', this.ghostTile);
      return;
    }
    const it = this.interactTarget;
    const plot = this.plotTarget;
    if (plot && (!it || this.distTo(it) > 14)) { bus.emit('plot', plot); return; }
    if (!it) {
      const spot = this.waterAhead();
      if (spot) { this.fishSpot = spot; bus.emit('fish:cast'); }
      return;
    }
    if (it.kind === 'fruit') {
      const wait = this.fruitWait(it.id);
      if (wait > 0) { useGame.getState().toast(`아직 열매가 없어요. ${formatDuration(wait)} 뒤에 다시 열려요 🌱`); return; }
    }
    if (it.kind === 'bench' && it.data) {
      this.standSpot = { x: this.me.x, y: this.me.y };
      this.me.setPos(it.data.sx, it.data.sy);
      this.me.sit(true);
      this.sendNow();
      bus.emit('local:emote', 'sit');
      return;
    }
    bus.emit('interact', { kind: it.kind, id: it.id, data: it.data });
  }

  private distTo(it: Interactable) { return Math.hypot(it.x - this.me.x, it.y - this.me.y); }

  // ───────────────────────── 이벤트 ─────────────────────────
  private setupBus() {
    this.unsubs.push(
      bus.on('remote:peers', (list) => this.syncPeers(list)),
      bus.on('remote:move', (p) => {
        const a = this.others.get(p.id);
        if (!a) return;
        this.missingSince.delete(p.id); // 움직이는 중이면 살아 있음
        if (p.vx === undefined) this.legacyPeerSeen = performance.now();
        a.pushRemote(p);
      }),
      bus.on('remote:emote', (e) => { const a = this.others.get(e.id); if (a) this.playEmote(a, e.kind); }),
      bus.on('local:emote', (k) => { if (k !== 'sit') this.playEmote(this.me, k); }),
      bus.on('bubble', ({ id, text }) => {
        if (id === this.me.id || this.others.has(id)) this.overlay.showBubble(id, text);
      }),
      bus.on('farm:update', (farm) => {
        const owner = farmOwnerOf(useGame.getState().space);
        if (this.farmLayer && owner === farm.ownerId) this.farmLayer.setFarm(farm, true);
      }),
      bus.on('fx:harvest', ({ x, y, cropId }) => {
        this.farmLayer?.harvestFx(x, y, cropId, { x: this.me.x, y: this.me.y });
        this.overlay.floatText(this.me.x, this.me.y - 26, `+1 ${CROP_MAP[cropId]?.name ?? ''}`, '#ffffff');
      }),
      bus.on('fx:plant', ({ x, y }) => this.farmLayer?.plantFx(x, y)),
      bus.on('fx:coins', ({ amount }) => this.overlay.floatText(this.me.x, this.me.y - 26, `${amount > 0 ? '+' : ''}${amount.toLocaleString()}G`)),
      bus.on('fx:expand', () => {
        this.cameras.main.shake(220, 0.004);
        this.farmLayer?.preview(null);
      }),
      bus.on('expand:preview', ({ size }) => this.farmLayer?.preview(size)),
      bus.on('net:announce', () => this.sendNow()),
      bus.on('fx:water', ({ x, y }) => {
        const p = plotCenter(x, y);
        for (let i = 0; i < 10; i++) {
          const d = this.add.rectangle(p.x + (Math.random() - 0.5) * 10, p.y - 18, 2, 3, i % 2 ? 0x8fd5e8 : 0xc6eef6).setDepth(1e6);
          this.world.add(d);
          this.tweens.add({ targets: d, y: p.y + 2 + Math.random() * 4, alpha: 0.2, duration: 380 + Math.random() * 200, delay: i * 30, ease: 'Quad.easeIn', onComplete: () => d.destroy() });
        }
        this.overlay.floatText(p.x, p.y - 20, '💧 -5분', '#d9f6ff');
      }),
      bus.on('fx:fruit', ({ treeId }) => {
        this.refreshFruit();
        const t = this.fruitTrees.find((f) => f.id === treeId);
        if (!t) return;
        for (let i = 0; i < 6; i++) {
          const s = this.add.sprite(t.img.x + (Math.random() - 0.5) * 22, t.img.y - 16 - Math.random() * 16, 'sparkle', 0).setDepth(1e6);
          this.world.add(s);
          s.play({ key: 'sparkle_play', delay: i * 50 });
          s.once('animationcomplete', () => s.destroy());
        }
      }),
      bus.on('remote:bye', (id) => {
        const a = this.others.get(id);
        if (!a) return;
        a.destroy();
        this.overlay.removeNameTag(id);
        this.others.delete(id);
        this.missingSince.delete(id);
      }),
      bus.on('touch:action', () => { if (!inputLocked()) this.doInteract(); }),
      bus.on('house:update', (h) => {
        if (this.houseLayer && houseOwnerOf(useGame.getState().space) === h.ownerId) { this.houseLayer.setHouse(h); this.unstick(); }
      }),
      bus.on('fx:fertilize', ({ x, y, minutes }) => {
        const p = plotCenter(x, y);
        for (let i = 0; i < 5; i++) {
          const s = this.add.sprite(p.x + (Math.random() - 0.5) * 14, p.y - 4 - Math.random() * 12, 'sparkle', 0).setDepth(1e6).setTint(0xb8ee8a);
          this.world.add(s);
          s.play({ key: 'sparkle_play', delay: i * 60 });
          s.once('animationcomplete', () => s.destroy());
        }
        this.overlay.floatText(p.x, p.y - 20, `🌱 -${minutes}분`, '#e4ffd0');
      }),
      bus.on('fish:bite', () => {
        if (this.bobber) {
          this.tweens.killTweensOf(this.bobber);
          const by = this.fishSpot?.y ?? this.bobber.y;
          this.tweens.add({ targets: this.bobber, y: by + 3, yoyo: true, repeat: 5, duration: 120 });
          this.splash(this.bobber.x, by);
        }
        this.exclaimIcon?.destroy();
        this.exclaimIcon = this.add.image(this.me.x, this.me.y - 30, 'exclaim').setOrigin(0.5, 1).setDepth(1e6).setScale(0.4);
        this.world.add(this.exclaimIcon);
        this.tweens.add({ targets: this.exclaimIcon, scale: 1, duration: 200, ease: 'Back.easeOut' });
        // (내 캐릭터 hop 은 y 를 tween 해서, 바로 움직이면 제자리로 돌아가므로 쓰지 않음)
      }),
      bus.on('fish:caught', ({ fishId }) => {
        const from = this.bobber ? { x: this.bobber.x, y: this.bobber.y } : this.fishSpot;
        if (from) this.splash(from.x, from.y);
        if (!fishId || !from) return;
        const f = this.add.image(from.x, from.y, `icon_fish_${fishId}`).setDepth(1e6);
        this.world.add(f);
        this.tweens.add({ targets: f, x: this.me.x, duration: 520, ease: 'Sine.easeInOut' });
        this.tweens.add({
          targets: f, y: { from: from.y, to: this.me.y - 34 }, duration: 520, ease: 'Quad.easeOut',
          onComplete: () => this.tweens.add({ targets: f, y: f.y - 6, alpha: 0, delay: 500, duration: 400, onComplete: () => f.destroy() }),
        });
        this.overlay.floatText(this.me.x, this.me.y - 40, `+1 ${FISH_MAP[fishId]?.name ?? ''}`, '#ffffff');
      }),
      bus.on('fish:end', () => this.clearFishing()),
      bus.on('beggar:result', ({ id, text }) => this.beggars?.afterRob(id, text)),
      bus.on('appearance:update', () => {
        const p = useGame.getState().profile;
        if (!p) return;
        this.me.setAppearance(p.appearance);
        this.overlay.setNameTag(p.id, p.nickname, true);
      }),
    );
  }

  private splash(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const d = this.add.rectangle(x, y, 2, 2, i % 2 ? 0xdff8ff : 0xffffff).setDepth(1e6);
      this.world.add(d);
      const a = (i / 6) * Math.PI * 2;
      this.tweens.add({ targets: d, x: x + Math.cos(a) * 7, y: y + Math.sin(a) * 3 - 3, alpha: 0, duration: 380, onComplete: () => d.destroy() });
    }
  }

  /** 낚싯줄 + 찌 그리기 (가게에서 산 낚싯대 끝 → 찌) */
  private syncFishing() {
    const f = useGame.getState().fishing;
    if (!f) { if (this.bobber) this.clearFishing(); return; }
    if (!this.fishSpot) this.fishSpot = this.waterAhead() ?? { x: this.me.x, y: this.me.y + 18 };
    const spot = this.fishSpot;
    if (!this.bobber) {
      this.bobber = this.add.image(this.me.x, this.me.y - 16, 'bobber').setOrigin(0.5, 0.75).setDepth(spot.y + 2);
      this.world.add(this.bobber);
      this.tweens.add({
        targets: this.bobber, x: spot.x, duration: 360, ease: 'Sine.easeOut',
        onComplete: () => {
          if (!this.bobber) return;
          this.splash(spot.x, spot.y);
          this.tweens.add({ targets: this.bobber, y: spot.y + 1, yoyo: true, repeat: -1, duration: 700, ease: 'Sine.easeInOut' });
        },
      });
      this.tweens.add({ targets: this.bobber, y: { from: this.me.y - 26, to: spot.y }, duration: 360, ease: 'Quad.easeIn' });
      this.fishLine = this.add.graphics().setDepth(spot.y + 1);
      this.world.add(this.fishLine);
    }
    const tip = { down: [6, -12], up: [-6, -26], left: [-12, -18], right: [12, -18] }[this.me.dir];
    this.fishLine!.clear().lineStyle(1, 0xf4f4fa, 0.9).lineBetween(this.me.x + tip[0], this.me.y + tip[1], this.bobber.x, this.bobber.y - 4);
    this.exclaimIcon?.setPosition(this.me.x, this.me.y - 30);
  }

  private clearFishing() {
    this.bobber?.destroy(); this.bobber = null;
    this.fishLine?.destroy(); this.fishLine = null;
    this.exclaimIcon?.destroy(); this.exclaimIcon = null;
    this.fishSpot = null;
  }

  /** 집 꾸미기: 놓을 자리 미리보기 (마우스 → 없으면 바라보는 칸) */
  private syncHouseGhost() {
    if (!this.houseLayer) return;
    const st = useGame.getState();
    const editing = st.houseEdit && houseOwnerOf(st.space) === st.profile?.id;
    this.houseLayer.showGrid(editing);
    const pl = editing ? st.housePlacing : null;
    this.houseLayer.highlight(pl?.moveId ?? null);
    if (!pl) { this.houseLayer.hideGhost(); this.ghostTile = null; return; }
    let t: { x: number; y: number } | null = null;
    const p = this.input.activePointer;
    // 마우스가 게임 화면 위에 있고, 마지막으로 움직인 게 마우스라면 마우스 칸 / 아니면 바라보는 칸
    if (this.game.input.isOver && this.lastPointerMove > this.lastKeyMove && p.x > 0 && p.y > 0 && p.x < this.scale.width && p.y < this.scale.height) {
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      t = this.houseLayer.tileAtWorld(wp.x, wp.y);
    }
    if (!t) {
      const off = { down: [0, 12], up: [0, -18], left: [-14, -4], right: [14, -4] }[this.me.dir];
      t = this.houseLayer.tileAtWorld(this.me.x + off[0], this.me.y + off[1]);
    }
    if (!t) { this.houseLayer.hideGhost(); this.ghostTile = null; return; }
    const o = this.placeOrigin(pl.furnId, t);
    this.ghostTile = o;
    this.houseLayer.showGhost(pl.furnId, pl.color, o.x, o.y, pl.moveId);
  }

  private syncPeers(list: PresenceInfo[]) {
    const myId = this.me?.id;
    const present = new Set<string>();
    for (const p of list) {
      if (p.id === myId || present.has(p.id)) continue;
      present.add(p.id);
      let a = this.others.get(p.id);
      if (!a) {
        a = new Avatar(this, p.id, p.nickname, p.appearance, p.x, p.y, false);
        a.setState(p.dir, false);
        this.world.add([a.shadow, a.sprite]);
        this.overlay.setNameTag(p.id, p.nickname, false);
        this.others.set(p.id, a);
      } else if (a.nickname !== p.nickname || JSON.stringify(a.appearance) !== JSON.stringify(p.appearance)) {
        a.nickname = p.nickname;
        a.setAppearance(p.appearance);
        this.overlay.setNameTag(p.id, p.nickname, false);
      }
    }
    const now = performance.now();
    for (const id of this.others.keys()) {
      if (present.has(id)) this.missingSince.delete(id);
      else if (!this.missingSince.has(id)) this.missingSince.set(id, now);
    }
    this.sweepPeers();
  }

  /** 목록에서 빠진 지 PEER_GRACE_MS 가 지난 캐릭터만 실제로 지움 */
  private sweepPeers() {
    const now = performance.now();
    for (const [id, since] of this.missingSince) {
      const a = this.others.get(id);
      if (!a) { this.missingSince.delete(id); continue; }
      if (now - since < PEER_GRACE_MS) continue;
      a.destroy();
      this.overlay.removeNameTag(id);
      this.others.delete(id);
      this.missingSince.delete(id);
    }
  }

  private playEmote(a: Avatar, kind: EmoteKind) {
    if (kind === 'sit') { a.sit(true); return; }
    if (kind === 'hello') { this.overlay.showBubble(a.id, '안녕하세요~! 👋'); a.hop(); return; }
    if (kind === 'wave') a.hop();
    const key = kind === 'heart' ? 'heart' : 'note';
    const icon = this.add.image(a.x, a.y - 24, key).setDepth(1e6).setScale(0.6);
    this.world.add(icon);
    this.tweens.add({ targets: icon, y: a.y - 38, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: icon, alpha: 0, delay: 1100, duration: 400, onComplete: () => icon.destroy() });
  }

  // ───────────────────────── 장식 애니메이션 ─────────────────────────
  private setupAmbient() {
    const W = this.map.w * TS, H = this.map.h * TS;
    const flies = this.map.id === 'village' ? 6 : this.map.id === 'farm' ? 3 : 0;
    const kinds = ['butterfly_pink', 'butterfly_yellow', 'butterfly_white'];
    for (let i = 0; i < flies; i++) {
      const k = kinds[i % kinds.length];
      const b = this.add.sprite(60 + Math.random() * (W - 120), 60 + Math.random() * (H - 120), k, 0).play(`${k}_fly`).setDepth(5000);
      this.world.add(b);
      const wander = () => {
        if (!b.active) return;
        const nx = Phaser.Math.Clamp(b.x + (Math.random() - 0.5) * 120, 30, W - 30);
        const ny = Phaser.Math.Clamp(b.y + (Math.random() - 0.5) * 90, 30, H - 30);
        b.setFlipX(nx < b.x);
        this.tweens.add({ targets: b, x: nx, y: ny, duration: 2500 + Math.random() * 2500, ease: 'Sine.easeInOut', onComplete: wander });
      };
      wander();
    }
  }

  private ambientTick(delta: number) {
    this.ambientTimer -= delta;
    if (this.ambientTimer > 0) return;
    this.ambientTimer = 260;
    // 물 반짝임
    const view = this.cameras.main.worldView;
    for (let tries = 0; tries < 6; tries++) {
      const tx = Math.floor((view.x + Math.random() * view.width) / TS);
      const ty = Math.floor((view.y + Math.random() * view.height) / TS);
      if (this.tileAt(tx, ty) !== T.Water) continue;
      const s = this.add.sprite(tx * TS + Math.random() * 16, ty * TS + 4 + Math.random() * 10, 'sparkle', 0).setDepth(-800).setScale(0.7).setTint(0xdff8ff);
      this.world.add(s);
      s.play('sparkle_play');
      s.once('animationcomplete', () => s.destroy());
      break;
    }
  }

  // ───────────────────────── 이동 / 충돌 ─────────────────────────
  private tileAt(tx: number, ty: number) {
    if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) return -1;
    return this.map.tiles[ty * this.map.w + tx];
  }

  private blocked(x: number, y: number): boolean {
    const r = { x: x - FEET_W / 2, y: y - FEET_H, w: FEET_W, h: FEET_H };
    if (r.x < 2 || r.y < 2 || r.x + r.w > this.map.w * TS - 2 || r.y + r.h > this.map.h * TS) return true;
    // 물 타일
    for (const [cx, cy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
      const t = this.tileAt(Math.floor(cx / TS), Math.floor(cy / TS));
      if (t === T.Water || t === T.Wall) return true;
    }
    const hit = (c: Rect) => r.x < c.x + c.w && r.x + r.w > c.x && r.y < c.y + c.h && r.y + r.h > c.y;
    if (this.colliders.some(hit)) return true;
    if (this.farmLayer && this.farmLayer.fenceRects.some(hit)) return true;
    if (this.houseLayer && this.houseLayer.rects.some(hit)) return true;
    return false;
  }

  private moveMe(dx: number, dy: number) {
    if (this.blocked(this.me.x, this.me.y)) this.unstick(); // 안전장치: 끼어 있으면 먼저 빼내기
    let { x, y } = this.me;
    if (dx !== 0) {
      if (!this.blocked(x + dx, y)) x += dx;
      else if (dy === 0) { // 모서리에서 미끄러지듯 빠져나가기
        if (!this.blocked(x + dx, y - 2)) { x += dx; y -= 1; } else if (!this.blocked(x + dx, y + 2)) { x += dx; y += 1; }
      }
    }
    if (dy !== 0) {
      if (!this.blocked(x, y + dy)) y += dy;
      else if (dx === 0) {
        if (!this.blocked(x - 3, y + dy)) { y += dy; x -= 1; } else if (!this.blocked(x + 3, y + dy)) { y += dy; x += 1; }
      }
    }
    const moved = Math.hypot(x - this.me.x, y - this.me.y);
    this.me.setPos(x, y);
    return moved;
  }

  private sendNow() {
    const moving = this.me.moving && !this.me.sitting;
    const vx = moving ? this.vel.x : 0, vy = moving ? this.vel.y : 0;
    const pkt: MovePacket = { id: this.me.id, x: Math.round(this.me.x), y: Math.round(this.me.y), dir: this.me.dir, moving, t: Date.now(), vx, vy };
    this.lastSent = { x: pkt.x, y: pkt.y, dir: pkt.dir, moving: pkt.moving, vx, vy };
    this.lastSend = performance.now();
    bus.emit('local:move', pkt);
  }

  update(_time: number, delta: number) {
    if (!this.me) return;
    const dt = Math.min(delta, 50) / 1000;
    const locked = inputLocked();
    let vx = 0, vy = 0;
    if (!locked) {
      const k = this.keys;
      if (k.LEFT.isDown || k.A.isDown) vx -= 1;
      if (k.RIGHT.isDown || k.D.isDown) vx += 1;
      if (k.UP.isDown || k.W.isDown) vy -= 1;
      if (k.DOWN.isDown || k.S.isDown) vy += 1;
      const t = useGame.getState().touch; // 모바일 가상 방향키
      if (t.x || t.y) { vx += t.x; vy += t.y; }
    }
    const wantMove = vx !== 0 || vy !== 0;
    if (wantMove && this.me.sitting) this.standUp();
    if (wantMove && useGame.getState().fishing) bus.emit('fish:cancel'); // 움직이면 낚시 그만
    if (wantMove) this.lastKeyMove = performance.now();
    let moving = false;
    if (wantMove) {
      const len = Math.hypot(vx, vy); // 대각선 속도 정규화
      const step = GAME_CONFIG.walkSpeed * dt;
      const bx = this.me.x, by = this.me.y;
      const moved = this.moveMe((vx / len) * step, (vy / len) * step);
      if (step > 0) {
        const q = (v: number) => Math.round(v * 10) / 10; // 잔떨림 방지
        this.vel = { x: q((this.me.x - bx) / step), y: q((this.me.y - by) / step) };
      }
      moving = moved > 0.01;
      const dir: Direction = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : vy > 0 ? 'down' : this.me.dir;
      this.me.setState(dir, moving || wantMove);
      this.movedDist += moved;
      if (!this.tutorialMovedSent && this.movedDist > 48) { this.tutorialMovedSent = true; bus.emit('tutorial:moved'); }
    } else if (this.me.moving) {
      this.me.setState(this.me.dir, false);
    }
    if (!wantMove) this.vel = { x: 0, y: 0 };

    const now = performance.now();
    // 네트워크 전송: 출발/멈춤/방향 전환 순간 + 걷는 동안 1초마다 위치 보정 (메시지 절약)
    // 단, 아직 새로고침하지 않은 예전 버전 주민이 같은 공간에 있으면 예전처럼 자주 보냄 (호환)
    const keepalive = now - this.legacyPeerSeen < 10_000 ? 200 : 1000;
    const sinceSend = now - this.lastSend;
    const velChanged = Math.abs(this.vel.x - this.lastSent.vx) > 0.15 || Math.abs(this.vel.y - this.lastSent.vy) > 0.15;
    const stateChanged = this.me.moving !== this.lastSent.moving || this.me.dir !== this.lastSent.dir;
    if ((velChanged || stateChanged) && sinceSend > 90) this.sendNow();
    else if (this.me.moving && sinceSend > keepalive) this.sendNow();
    else if (!this.me.moving && sinceSend > 30000) this.sendNow(); // 가끔 하트비트

    this.checkTriggers();
    this.updateTargets();
    this.syncFishing();
    this.syncHouseGhost();
    this.nightTick(delta);
    if (this.farmLayer) this.farmLayer.tick(delta);
    this.ambientTick(delta);
    this.fruitTimer -= delta;
    if (this.fruitTimer <= 0) { this.fruitTimer = 2000; this.refreshFruit(); }
    this.peerSweepTimer -= delta;
    if (this.peerSweepTimer <= 0) { this.peerSweepTimer = 1000; this.sweepPeers(); }

    for (const a of this.others.values()) a.updateRemote(delta, GAME_CONFIG.walkSpeed);
    const view = this.cameras.main.worldView;
    const list = [{ id: this.me.id, x: this.me.x, y: this.me.y, visible: true }];
    for (const a of this.others.values()) {
      const inView = a.x > view.x - 32 && a.x < view.right + 32 && a.y > view.y - 8 && a.y < view.bottom + 40;
      a.sprite.setVisible(inView); // 화면 밖 캐릭터는 그리지 않음 (접속은 유지)
      a.shadow.setVisible(inView && !a.sitting);
      list.push({ id: a.id, x: a.x, y: a.y, visible: inView });
    }
    if (this.beggars) list.push(...this.beggars.tags(view));
    this.overlay.update(list);
  }

  private checkTriggers() {
    const fx = this.me.x, fy = this.me.y;
    const t = this.map.triggers.find((tr) => fx >= tr.rect.x && fx <= tr.rect.x + tr.rect.w && fy >= tr.rect.y && fy <= tr.rect.y + tr.rect.h + 4);
    const key = t ? t.kind : null;
    if (key && key !== this.insideTrigger && !inputLocked()) {
      bus.emit('interact', { kind: t!.kind, id: `trigger_${t!.kind}` });
      // 같은 자리에서 계속 열리지 않도록 살짝 뒤로
      this.me.setPos(this.me.x, this.me.y - 10);
    }
    this.insideTrigger = key;
  }

  private updateTargets() {
    const st = useGame.getState();
    // 가장 가까운 상호작용 대상
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of [...this.map.interactables, ...this.fruitInteractables]) {
      const d = this.distTo(it);
      if (d <= it.r && d < bestD) { best = it; bestD = d; }
    }
    this.interactTarget = best;

    // 농장: 바라보는 방향의 밭 칸
    this.plotTarget = null;
    if (this.farmLayer && this.cursor) {
      const off = { down: [0, 6], up: [0, -16], left: [-12, -4], right: [12, -4] }[this.me.dir];
      const target = this.farmLayer.plotAtWorld(this.me.x + off[0], this.me.y + off[1]) ?? this.farmLayer.plotAtWorld(this.me.x, this.me.y - 3);
      this.plotTarget = target;
      if (target) {
        const c = plotCenter(target.x, target.y);
        const crop = this.farmLayer.cropAt(target.x, target.y);
        const isOwner = farmOwnerOf(st.space) === st.profile?.id;
        const fertOk = !!st.selectedFert && (st.inventory[st.selectedFert] ?? 0) > 0;
        const ok = isOwner && (crop ? growthInfo(crop, serverNow()).ready || (fertOk && !crop.fertilized) : !!st.selectedSeed && (st.inventory[`seed:${st.selectedSeed}`] ?? 0) > 0);
        this.cursor.setTexture(ok ? 'plot_cursor' : 'plot_cursor_bad').setPosition(c.x, c.y).setVisible(true);
      } else this.cursor.setVisible(false);
    }

    // 안내 문구
    let prompt: string | null = null;
    const fishing = st.fishing;
    const placing = this.houseLayer && st.houseEdit ? st.housePlacing : null;
    if (!inputLocked()) {
      if (this.me.sitting) prompt = 'E: 일어나기';
      else if (fishing) prompt = fishing.phase === 'bite' ? '❗ 지금이에요! E 를 눌러 당기기' : fishing.phase === 'wait' ? '🎣 찌를 지켜보는 중… "툭!" 하면 E (움직이면 그만둬요)' : '🎣 찌를 던지는 중…';
      else if (placing) {
        const d = FURN_MAP[placing.furnId];
        prompt = `${placing.moveId ? '옮기는 중' : '놓는 중'}: ${d?.name ?? ''} · E 또는 클릭으로 ${placing.moveId ? '옮기기' : '놓기'}`;
      } else if (this.houseLayer && st.houseEdit) prompt = '🛋️ 꾸미기 모드: 놓인 가구를 클릭하면 옮기거나 보관할 수 있어요';
      else if (this.plotTarget && (!best || bestD > 14)) {
        const crop = this.farmLayer!.cropAt(this.plotTarget.x, this.plotTarget.y);
        const isOwner = farmOwnerOf(st.space) === st.profile?.id;
        // 바라보는 작물 정보는 아래 안내줄에 표시 (작물 위 정보 상자가 말풍선을 가리지 않도록)
        const info = crop ? growthInfo(crop, serverNow()) : null;
        const name = crop ? CROP_MAP[crop.cropId]?.name ?? '' : '';
        const state = info ? (info.ready ? '다 자랐어요!' : `수확까지 ${formatDuration(info.remainingSec)}`) : '';
        if (!isOwner) {
          if (!crop) prompt = null;
          else if (info!.ready) prompt = `${name} 구경 중 · 다 자랐어요!`;
          else {
            const wait = this.waterWait();
            prompt = wait > 0
              ? `${name} · ${state} · 이 밭엔 ${formatDuration(wait)} 뒤에 다시 물을 줄 수 있어요`
              : `R: 밭 전체에 물 주기 (-5분) · ${name} ${state}`;
          }
        }
        else if (crop) {
          const fert = st.selectedFert && (st.inventory[st.selectedFert] ?? 0) > 0 ? FERT_MAP[st.selectedFert] : null;
          prompt = info!.ready ? `E: ${name} 수확하기`
            : crop.fertilized ? `${name} · 🧂 비료 준 칸 · ${state}`
              : fert ? `E: ${fert.name} 주기 · ${name} ${state}` : `${name} · ${STAGE_LABELS[info!.stage]} · ${state}`;
        }
        else prompt = st.selectedSeed ? `E: ${CROP_MAP[st.selectedSeed]?.name} 씨앗 심기` : '퀵슬롯에서 씨앗을 골라 주세요';
      } else if (best && best.kind === 'fruit') {
        const t = this.fruitTrees.find((f) => f.id === best!.id);
        const name = t ? FRUIT_NAMES[t.fruit] : '과일';
        const wait = this.fruitWait(best.id);
        prompt = wait > 0 ? `${name}가 다시 열리기까지 ${formatDuration(wait)}` : `E: ${name} 따기 (+${FRUIT_REWARD}G)`;
      } else if (best) prompt = `E: ${best.prompt}`;
      else if (this.waterAhead()) {
        const rod = bestRod(st.inventory);
        prompt = rod ? `E: 낚시하기 (${rod.name} · 남은 ${st.rodUses[rod.id] ?? rod.uses}/${rod.uses}회)` : '🎣 낚싯대가 있으면 여기서 낚시할 수 있어요 (씨앗 상점 → 낚시)';
      } else if (this.farmLayer && farmOwnerOf(st.space) !== st.profile?.id) {
        // 친구 밭 어디서든: 자라는 작물이 있으면 R 로 밭 전체에 물 주기 안내
        const growing = (st.viewFarm?.crops ?? []).some((c) => c.readyAt > serverNow());
        const wait = this.waterWait();
        if (growing) prompt = wait > 0 ? `💧 이 밭엔 ${formatDuration(wait)} 뒤에 다시 물을 줄 수 있어요` : 'R: 친구 밭 전체에 물 주기 (작물마다 -5분)';
      }
    }
    if (prompt !== st.prompt) st.set({ prompt });

    // 작물 정보 툴팁 (마우스 → 없으면 바라보는 칸)
    this.hoverTimer -= this.game.loop.delta;
    if (this.hoverTimer <= 0) {
      this.hoverTimer = 150;
      this.updateHover();
    }
  }

  private updateHover() {
    const st = useGame.getState();
    if (!this.farmLayer || inputLocked()) { if (st.hoverInfo) st.set({ hoverInfo: null }); return; }
    const p = this.input.activePointer;
    const cam = this.cameras.main;
    let plot: { x: number; y: number } | null = null;
    if (p.x > 0 && p.y > 0 && p.x < this.scale.width && p.y < this.scale.height) {
      const wp = cam.getWorldPoint(p.x, p.y);
      plot = this.farmLayer.plotAtWorld(wp.x, wp.y);
    }
    // 작물 위 정보 상자는 마우스를 올렸을 때만 (키보드로 바라보는 칸은 아래 안내줄에 표시)
    const crop = plot ? this.farmLayer.cropAt(plot.x, plot.y) : null;
    if (!plot || !crop) { if (st.hoverInfo) st.set({ hoverInfo: null }); return; }
    const info = growthInfo(crop, serverNow());
    const def = CROP_MAP[crop.cropId];
    const c = plotCenter(plot.x, plot.y);
    const s = this.overlay.toScreen(cam, c.x, c.y - 18);
    st.set({
      hoverInfo: {
        title: def?.name ?? crop.cropId,
        lines: [STAGE_LABELS[info.stage], info.ready ? '반짝반짝 수확할 수 있어요!' : `수확까지 ${formatDuration(info.remainingSec)}`, ...(crop.fertilized && !info.ready ? ['🧂 비료를 줬어요'] : [])],
        x: s.x, y: s.y, ready: info.ready,
      },
    });
  }

  private cleanup() {
    if (!this.unsubs.length && !this.overlay) return;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.input.keyboard?.removeAllListeners();
    try {
      this.farmLayer?.destroy();
      this.houseLayer?.destroy();
      this.beggars?.destroy();
      this.clearFishing();
      this.overlay?.destroy();
      this.others.forEach((a) => a.destroy());
    } catch { /* 게임 전체가 파괴되는 중이면 무시 */ }
    this.others.clear();
    this.farmLayer = null;
    this.houseLayer = null;
    (this as unknown as { overlay?: Overlay }).overlay = undefined;
    const st = useGame.getState();
    st.set({ prompt: null, hoverInfo: null });
  }
}
