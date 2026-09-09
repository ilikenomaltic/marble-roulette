import { assignNamesToSlots } from '../groupAssignment';
import { expandNames, hasUniformWeights } from '../marbleEntries';
import options from '../options';
import type { Roulette } from '../roulette';
import type { RaceSimulator } from '../simulation';
import { randomSeed } from '../utils/rng';
import { parseName } from '../utils/utils';
import { $, $all } from './dom';
import { chunkIntoGroups, hideGroupResult, showGroupResult } from './groupResult';
import { PairSettings } from './pairSettings';

const NAMES_STORAGE_KEY = 'mbr_names';
const NOTICE_STORAGE_KEY = 'lastViewedNotification';
const NOTICE_VERSION = 6;
const DEFAULT_GROUP_SIZE = 3;
const RESULT_POPUP_DELAY = 800;
const SETTINGS_RESTORE_DELAY = 3000;

type WinnerType = 'first' | 'last' | 'custom';

export class AppUI {
  private ready = false;
  private winnerType: WinnerType = 'first';
  private groupSize = DEFAULT_GROUP_SIZE;
  private pairSettings = new PairSettings();

  constructor(
    private roulette: Roulette,
    private simulator: RaceSimulator
  ) {}

  start() {
    this.restoreNames();
    this.attachNameInputs();
    this.attachOptionToggles();
    this.attachWinnerRankControls();
    this.attachGroupControls();
    this.attachRouletteEvents();
    this.attachSettingsPanel();
    this.attachMapSelect();
    this.attachNotice();
    this.pairSettings.attach();

    $('#btnShuffle').click();
  }

  // ─── names ────────────────────────────────────────────────────────────────

  private getNames(): string[] {
    return $<HTMLTextAreaElement>('#in_names')
      .value.trim()
      .split(/[,\r\n]/g)
      .map((name) => name.trim())
      .filter((name) => !!name);
  }

  private restoreNames() {
    const fromQuery = new URLSearchParams(window.location.search).get('names');
    if (fromQuery) {
      $<HTMLTextAreaElement>('#in_names').value = fromQuery.replace(/,/g, '\n');
      return;
    }
    const stored = localStorage.getItem(NAMES_STORAGE_KEY);
    if (stored) {
      $<HTMLTextAreaElement>('#in_names').value = stored;
    }
  }

  /** Rebuilds the marble line-up from the textarea. */
  private refreshMarbles() {
    const names = this.getNames();
    this.roulette.setMarbles(names);
    this.ready = names.length > 0;
    localStorage.setItem(NAMES_STORAGE_KEY, names.join(','));

    if (this.winnerType === 'first') {
      this.setWinnerRank(1);
    } else if (this.winnerType === 'last') {
      this.setWinnerRank(this.roulette.getCount());
    }
  }

  private attachNameInputs() {
    const namesInput = $<HTMLTextAreaElement>('#in_names');

    namesInput.addEventListener('input', () => this.refreshMarbles());

    // Collapses duplicates into the `name*count` form when focus leaves.
    // The weight suffix is part of the key, so `가/2` stays distinct from `가`.
    namesInput.addEventListener('blur', () => {
      const counts = new Map<string, number>();
      this.getNames().forEach((raw) => {
        const parsed = parseName(raw);
        if (!parsed) return;
        const key = parsed.weight > 1 ? `${parsed.name}/${parsed.weight}` : parsed.name;
        counts.set(key, (counts.get(key) ?? 0) + parsed.count);
      });

      const collapsed = [...counts.entries()].map(([name, count]) => (count > 1 ? `${name}*${count}` : name));
      const next = collapsed.join(',');
      if (namesInput.value !== next) {
        namesInput.value = next;
        this.refreshMarbles();
      }
    });

    $('#btnShuffle').addEventListener('click', () => this.refreshMarbles());
    $('#btnStart').addEventListener('click', () => this.startRace());

    $('#btnAutoFill').addEventListener('click', () => {
      const count = parseInt($<HTMLInputElement>('#studentCountInput').value, 10);
      if (!count || count < 1) return;
      namesInput.value = Array.from({ length: count }, (_, i) => `${i + 1}번`).join('\n');
      this.refreshMarbles();
    });
  }

  // ─── race start ───────────────────────────────────────────────────────────

  private startRace() {
    if (!this.ready) return;

    this.trackStart();

    if ($<HTMLInputElement>('#chkGroupMode').checked) {
      const problem = this.applyGroupPlan();
      if (problem) {
        this.toast(problem);
        return;
      }
    }

    this.roulette.start();
    $('#settings').classList.add('hide');
  }

  /**
   * Decides which name starts from which spawn slot so the requested pairs end
   * up in the groups the teacher asked for.
   *
   * The race is never touched. A headless run tells us which slots finish in
   * which group; assigning names to those slots is the only decision made here,
   * and that assignment was already random before. Returns an error message
   * when the constraints cannot all be met, otherwise null.
   */
  private applyGroupPlan(): string | null {
    const { togetherPairs, conflictPairs } = this.pairSettings;
    if (togetherPairs.length === 0 && conflictPairs.length === 0) return null;

    const entries = expandNames(this.getNames());
    if (entries.length === 0) return null;

    if (!hasUniformWeights(entries)) {
      return '이름에 가중치(/숫자)가 있으면 짝·갈등 설정을 적용할 수 없습니다.';
    }

    const stage = this.roulette.getStage();
    if (!stage) return '맵이 준비되지 않았습니다.';
    if (!this.simulator.isReady) {
      return '준비 중입니다. 잠시 후 다시 시작해 주세요.';
    }

    const seed = randomSeed();
    const prediction = this.simulator.simulate({
      seed,
      marbleCount: entries.length,
      stage,
      winnerRank: options.winningRank,
    });

    if (!prediction.completed) {
      return '레이스를 예측하지 못했습니다. 다시 시도해 주세요.';
    }

    const assignment = assignNamesToSlots({
      names: entries.map((entry) => entry.name),
      arrivalOrder: prediction.arrival,
      groupSize: this.groupSize,
      togetherPairs,
      conflictPairs,
    });

    if (!assignment.ok) return assignment.reason;

    this.roulette.setMarbleEntries(entries, assignment.slotOf, seed);
    return null;
  }

  private trackStart() {
    const gtag = (window as any).gtag;
    if (typeof gtag === 'function') {
      gtag('event', 'start', {
        event_category: 'roulette',
        event_label: 'start',
        value: this.roulette.getCount(),
      });
    }

    const umami = (window as any).umami;
    if (typeof umami !== 'undefined') {
      umami.track('start', { count: this.roulette.getCount() });
      expandNames(this.getNames()).forEach((entry) => {
        umami.track('marble', { name: entry.name, count: 1 });
      });
    }
  }

  // ─── options ──────────────────────────────────────────────────────────────

  private attachOptionToggles() {
    $('#chkAutoRecording').addEventListener('change', (e) => {
      options.autoRecording = (e.target as HTMLInputElement).checked;
      this.roulette.setAutoRecording(options.autoRecording);
    });

    $('#chkSkill').addEventListener('change', (e) => {
      options.useSkills = (e.target as HTMLInputElement).checked;
      this.roulette.setWinningRank(options.winningRank);
    });

    $('#chkDarkMode').addEventListener('change', (e) => {
      options.darkMode = (e.target as HTMLInputElement).checked;
      this.roulette.setTheme(options.darkMode ? 'dark' : 'light');
      document.documentElement.classList.toggle('light', !options.darkMode);
    });
  }

  private setWinnerRank(rank: number) {
    $<HTMLInputElement>('#in_winningRank').value = String(rank);
    options.winningRank = rank - 1;
    this.roulette.setWinningRank(options.winningRank);

    $('.btn-first-winner').classList.toggle('active', this.winnerType === 'first');
    $('.btn-last-winner').classList.toggle('active', this.winnerType === 'last');
    $('#in_winningRank').classList.toggle('active', this.winnerType === 'custom');
  }

  private attachWinnerRankControls() {
    $('#in_winningRank').addEventListener('change', (e) => {
      const value = parseInt((e.target as HTMLInputElement).value, 10);
      this.winnerType = 'custom';
      this.setWinnerRank(Number.isNaN(value) ? 0 : value);
    });

    $('.btn-last-winner').addEventListener('click', () => {
      this.winnerType = 'last';
      this.setWinnerRank(this.roulette.getCount());
    });

    $('.btn-first-winner').addEventListener('click', () => {
      this.winnerType = 'first';
      this.setWinnerRank(1);
    });
  }

  // ─── group mode ───────────────────────────────────────────────────────────

  private attachGroupControls() {
    $('#chkGroupMode').addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      $('#groupSizeBtns').style.display = enabled ? 'flex' : 'none';
    });

    $all('.btn-group-size').forEach((button) => {
      button.addEventListener('click', () => {
        $all('.btn-group-size').forEach((other) => other.classList.remove('active'));
        button.classList.add('active');
        this.groupSize = parseInt(button.dataset.size ?? String(DEFAULT_GROUP_SIZE), 10);
      });
    });

    $('#closeGroupResultBtn').addEventListener('click', () => hideGroupResult());
  }

  // ─── roulette events ──────────────────────────────────────────────────────

  private attachRouletteEvents() {
    this.roulette.addEventListener('goal', () => {
      this.ready = false;
      setTimeout(() => {
        $('#settings').classList.remove('hide');
      }, SETTINGS_RESTORE_DELAY);
    });

    this.roulette.addEventListener('allFinished', (e) => {
      if (!$<HTMLInputElement>('#chkGroupMode').checked) return;
      const winners = (e as CustomEvent<{ winners: string[] }>).detail.winners;
      const groups = chunkIntoGroups(winners, this.groupSize);
      setTimeout(() => showGroupResult(groups), RESULT_POPUP_DELAY);
    });

    this.roulette.addEventListener('message', (e) => {
      this.toast((e as CustomEvent<string>).detail);
    });
  }

  private toast(message: string) {
    const element = document.createElement('div');
    element.classList.add('toast');
    element.textContent = message;

    const translate = (window as any).translateElement;
    if (typeof translate === 'function') translate(element);

    document.body.appendChild(element);
    setTimeout(() => element.remove(), 1200);
  }

  // ─── chrome ───────────────────────────────────────────────────────────────

  private attachSettingsPanel() {
    const toggle = $('#btnToggleSettings');
    const rows = $('.collapsible-rows');
    toggle.addEventListener('click', () => {
      rows.classList.toggle('collapsed');
      const arrow = toggle.querySelector('.toggle-arrow');
      if (arrow) arrow.textContent = rows.classList.contains('collapsed') ? '▲' : '▼';
    });
  }

  private attachMapSelect() {
    const select = $<HTMLSelectElement>('#sltMap');
    const translate = (window as any).translateElement;

    this.roulette.getMaps().forEach((map) => {
      const option = document.createElement('option');
      option.value = String(map.index);
      option.innerHTML = map.title;
      option.setAttribute('data-trans', '');
      if (typeof translate === 'function') translate(option);
      select.append(option);
    });

    select.addEventListener('change', (e) => {
      this.roulette.setMap(Number((e.target as HTMLSelectElement).value));
    });
  }

  private attachNotice() {
    const notice = $('#notice');
    const open = () => {
      notice.style.display = 'flex';
    };

    $('#closeNotice').addEventListener('click', () => {
      notice.style.display = 'none';
      localStorage.setItem(NOTICE_STORAGE_KEY, String(NOTICE_VERSION));
    });
    $('#btnNotice').addEventListener('click', open);

    const lastViewed = localStorage.getItem(NOTICE_STORAGE_KEY);
    if (lastViewed === null || Number(lastViewed) < NOTICE_VERSION) {
      open();
    }
  }
}
