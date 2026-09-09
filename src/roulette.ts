import { Camera } from './camera';
import { canvasHeight, canvasWidth, initialZoom, Themes, zoomThreshold } from './data/constants';
import { type StageDef, stages } from './data/maps';
import { FastForwader } from './fastForwader';
import type { GameObject } from './gameObject';
import type { IPhysics } from './IPhysics';
import { expandNames, type MarbleEntry } from './marbleEntries';
import { Marble } from './marble';
import { Minimap } from './minimap';
import options from './options';
import { ParticleManager } from './particleManager';
import { Box2dPhysics } from './physics-box2d';
import { RaceCore, UPDATE_INTERVAL } from './raceCore';
import { RankRenderer } from './rankRenderer';
import { RouletteRenderer } from './rouletteRenderer';
import { SkillEffect } from './skillEffect';
import type { ColorTheme } from './types/ColorTheme';
import type { MouseEventHandlerName, MouseEventName } from './types/mouseEvents.type';
import type { UIObject } from './UIObject';
import { bound } from './utils/bound.decorator';
import { createRng, randomSeed } from './utils/rng';
import { shuffle } from './utils/utils';
import { VideoRecorder } from './utils/videoRecorder';

export class Roulette extends EventTarget {
  private _lastTime: number = 0;
  private _elapsed: number = 0;

  private _speed = 1;

  private _particleManager = new ParticleManager();
  private _stage: StageDef | null = null;

  protected _camera: Camera = new Camera();
  protected _renderer: RouletteRenderer;

  private _effects: GameObject[] = [];

  private _winnerRank = 0;
  private _winner: Marble | null = null;

  private _uiObjects: UIObject[] = [];

  private _autoRecording: boolean = false;
  private _recorder!: VideoRecorder;

  private physics!: IPhysics;
  private _core!: RaceCore;

  private _isReady: boolean = false;
  private _seed: number = 0;

  protected fastForwarder!: FastForwader;
  protected _theme: ColorTheme = Themes.dark;

  get isReady() {
    return this._isReady;
  }

  /** The seed the current line-up was built with; a race replays from it. */
  get seed() {
    return this._seed;
  }

  private get _marbles(): Marble[] {
    return this._core ? this._core.marbles : [];
  }

  private get _winners(): Marble[] {
    return this._core ? this._core.winners : [];
  }

  protected createRenderer(): RouletteRenderer {
    return new RouletteRenderer();
  }

  protected createFastForwader(): FastForwader {
    return new FastForwader();
  }

  constructor() {
    super();
    this._renderer = this.createRenderer();
    this._renderer.init().then(() => {
      this._init().then(() => {
        this._isReady = true;
        this._update();
      });
    });
  }

  public getZoom() {
    return initialZoom * this._camera.zoom;
  }

  private addUiObject(obj: UIObject) {
    this._uiObjects.push(obj);
    if (obj.onWheel) {
      this._renderer.canvas.addEventListener('wheel', obj.onWheel);
    }
    if (obj.onMessage) {
      obj.onMessage((msg) => {
        console.log('onMessage', msg);
        this.dispatchEvent(new CustomEvent('message', { detail: msg }));
      });
    }
  }

  @bound
  private _update() {
    if (!this._lastTime) this._lastTime = Date.now();
    const currentTime = Date.now();

    this._elapsed += (currentTime - this._lastTime) * this._speed * this.fastForwarder.speed;
    if (this._elapsed > 100) {
      this._elapsed %= 100;
    }
    this._lastTime = currentTime;

    while (this._elapsed >= UPDATE_INTERVAL) {
      this._core.step();
      this._particleManager.update(UPDATE_INTERVAL);
      this._updateEffects(UPDATE_INTERVAL);
      this._elapsed -= UPDATE_INTERVAL;
      this._uiObjects.forEach((obj) => obj.update(UPDATE_INTERVAL));
    }

    if (this._stage) {
      this._camera.update({
        marbles: this._marbles,
        stage: this._stage,
        needToZoom: this._core.goalDist < zoomThreshold,
        targetIndex: this._winners.length > 0 ? this._winnerRank - this._winners.length : 0,
      });
    }

    this._render();
    window.requestAnimationFrame(this._update);
  }

  private _updateEffects(deltaTime: number) {
    this._effects.forEach((effect) => effect.update(deltaTime));
    this._effects = this._effects.filter((effect) => !effect.isDestroy);
  }

  private _render() {
    if (!this._stage) return;
    const renderParams = {
      camera: this._camera,
      stage: this._stage,
      entities: this.physics.getEntities(),
      marbles: this._marbles,
      winners: this._winners,
      particleManager: this._particleManager,
      effects: this._effects,
      winnerRank: this._winnerRank,
      winner: this._winner,
      size: { x: this._renderer.width, y: this._renderer.height },
      theme: this._theme,
    };
    this._renderer.render(renderParams, this._uiObjects);
  }

  private async _init() {
    this._recorder = new VideoRecorder(this._renderer.canvas);

    this.physics = new Box2dPhysics();
    await this.physics.init();

    this._core = new RaceCore(this.physics, {
      onSkill: (marble) => {
        this._effects.push(new SkillEffect(marble.x, marble.y));
      },
      onWinner: (marble) => {
        this.dispatchEvent(new CustomEvent('goal', { detail: { winner: marble.name } }));
        this._winner = marble;
        this._particleManager.shot(this._renderer.width, this._renderer.height);
        setTimeout(() => {
          this._recorder.stop();
        }, 1000);
      },
      onAllFinished: (winners) => {
        this.dispatchEvent(
          new CustomEvent('allFinished', { detail: { winners: winners.map((m) => m.name) } })
        );
      },
    });

    this.addUiObject(new RankRenderer());
    this.attachEvent();
    const minimap = new Minimap();
    minimap.onViewportChange((pos) => {
      if (pos) {
        this._camera.setPosition(pos, false);
        this._camera.lock(true);
      } else {
        this._camera.lock(false);
      }
    });
    this.addUiObject(minimap);
    this.fastForwarder = this.createFastForwader();
    this.addUiObject(this.fastForwarder);
    this._stage = stages[0];
    this._core.stage = this._stage;
    this._loadMap();
  }

  @bound
  private mouseHandler(eventName: MouseEventName, e: MouseEvent) {
    const handlerName = `on${eventName}` as MouseEventHandlerName;

    const sizeFactor = this._renderer.sizeFactor;
    const pos = { x: e.offsetX * sizeFactor, y: e.offsetY * sizeFactor };
    this._uiObjects.forEach((obj) => {
      if (!obj[handlerName]) return;
      const bounds = obj.getBoundingBox();
      if (!bounds) {
        obj[handlerName]({ ...pos, button: e.button });
      } else if (
        bounds &&
        pos.x >= bounds.x &&
        pos.y >= bounds.y &&
        pos.x <= bounds.x + bounds.w &&
        pos.y <= bounds.y + bounds.h
      ) {
        obj[handlerName]({ x: pos.x - bounds.x, y: pos.y - bounds.y, button: e.button });
      } else {
        obj[handlerName](undefined);
      }
    });
  }

  private attachEvent() {
    const canvas = this._renderer.canvas;
    const onPointerRelease = (e: Event) => {
      this.mouseHandler('MouseUp', e as MouseEvent);
      window.removeEventListener('pointerup', onPointerRelease);
      window.removeEventListener('pointercancel', onPointerRelease);
    };

    canvas.addEventListener('pointerdown', (e: Event) => {
      this.mouseHandler('MouseDown', e as MouseEvent);
      window.addEventListener('pointerup', onPointerRelease);
      window.addEventListener('pointercancel', onPointerRelease);
    });

    ['MouseMove', 'DblClick'].forEach((ev) => {
      // @ts-expect-error
      canvas.addEventListener(ev.toLowerCase().replace('mouse', 'pointer'), this.mouseHandler.bind(this, ev));
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  private _loadMap() {
    if (!this._stage) {
      throw new Error('No map has been selected');
    }

    this.physics.createStage(this._stage);
    this._camera.initializePosition();
  }

  public clearMarbles() {
    this.physics.clearMarbles();
    this._winner = null;
    this._core.reset();
    this._core.stage = this._stage;
  }

  public getWinners(): string[] {
    return this._winners.map((m) => m.name);
  }

  public start() {
    this._winnerRank = options.winningRank;
    if (this._winnerRank >= this._marbles.length) {
      this._winnerRank = this._marbles.length - 1;
    }
    this._core.winnerRank = this._winnerRank;
    this._camera.startFollowingMarbles();

    if (this._autoRecording) {
      this._recorder.start().then(() => {
        this._core.start();
      });
    } else {
      this._core.start();
    }
  }

  public setSpeed(value: number) {
    if (value <= 0) {
      throw new Error('Speed multiplier must larger than 0');
    }
    this._speed = value;
  }

  public setTheme(themeName: keyof typeof Themes) {
    this._theme = Themes[themeName];
  }

  public getSpeed() {
    return this._speed;
  }

  public setWinningRank(rank: number) {
    this._winnerRank = rank;
    if (this._core) this._core.winnerRank = rank;
  }

  public setAutoRecording(value: boolean) {
    this._autoRecording = value;
  }

  /** Random line-up: every name lands on a random spawn slot. */
  public setMarbles(names: string[]) {
    const entries = expandNames(names);
    const seed = randomSeed();
    const slots = shuffle(
      entries.map((_, i) => i),
      createRng(seed)
    );
    this.setMarbleEntries(entries, slots, seed);
  }

  /**
   * Chosen line-up: `slotOf[i]` is the spawn slot for `entries[i]`.
   *
   * The physics depends only on the seed and the slot, never on the name, so a
   * caller that knows which slots finish in which group can decide the grouping
   * without touching the race itself.
   */
  public setMarbleEntries(entries: MarbleEntry[], slotOf: number[], seed: number) {
    this.reset();

    const total = entries.length;
    this._seed = seed;
    this.physics.setSeed(seed);

    const bySlot: (MarbleEntry | undefined)[] = new Array(total);
    entries.forEach((entry, i) => {
      bySlot[slotOf[i]] = entry;
    });

    // Created in ascending slot order so Box2D always builds its body list in
    // the same sequence; the solver order would otherwise perturb the result.
    for (let slot = 0; slot < total; slot++) {
      const entry = bySlot[slot];
      if (!entry) continue;
      this._core.marbles.push(new Marble(this.physics, slot, total, entry.name, entry.weight, seed));
    }
    this._core.totalMarbleCount = total;

    this._frameSpawnArea(total);
  }

  /** Moves the camera to the spawn grid and zooms in on it. */
  private _frameSpawnArea(totalCount: number) {
    if (totalCount <= 0) return;

    const cols = Math.min(totalCount, 10);
    const rows = Math.ceil(totalCount / 10);
    const lineDelta = -Math.max(0, Math.ceil(rows - 5));
    const centerX = 10.25 + (cols - 1) * 0.3;
    const centerY = (1 + rows) / 2 + lineDelta;

    const spawnWidth = Math.max((cols - 1) * 0.6, 1);
    const spawnHeight = Math.max(rows - 1, 1);
    const margin = 3;
    const viewW = canvasWidth / initialZoom;
    const viewH = canvasHeight / initialZoom;
    const zoom = Math.max(
      1.5,
      Math.min(Math.min(viewW / (spawnWidth + margin * 2), viewH / (spawnHeight + margin * 2)), 3)
    );

    this._camera.initializePosition({ x: centerX, y: centerY }, zoom);
  }

  private _clearMap() {
    this.physics.clear();
    this._core.marbles = [];
  }

  public reset() {
    this.clearMarbles();
    this._clearMap();
    this._loadMap();
  }

  public getCount() {
    return this._marbles.length;
  }

  public getMaps() {
    return stages.map((stage, index) => {
      return {
        index,
        title: stage.title,
      };
    });
  }

  public getStage(): StageDef | null {
    return this._stage;
  }

  public setMap(index: number) {
    if (index < 0 || index > stages.length - 1) {
      throw new Error('Incorrect map number');
    }
    const names = this._marbles.map((marble) => marble.name);
    this._stage = stages[index];
    this._core.stage = this._stage;
    this.setMarbles(names);
    this._camera.initializePosition();
  }
}
