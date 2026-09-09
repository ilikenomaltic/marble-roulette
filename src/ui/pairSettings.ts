import type { Pair } from '../groupAssignment';
import { $, escapeHtml } from './dom';

const CONFLICT_STORAGE_KEY = 'mbr_conflicts';
const TOGETHER_STORAGE_KEY = 'mbr_together';
/** Typing this anywhere outside an input opens the teacher-only panel. */
const SECRET_KEYWORD = 'teacher';

export type PairKind = 'conflict' | 'together';

interface PairListConfig {
  kind: PairKind;
  storageKey: string;
  listSelector: string;
  inputASelector: string;
  inputBSelector: string;
  addButtonSelector: string;
  clearButtonSelector: string;
  emptyHint: string;
  separator: string;
}

const LIST_CONFIGS: Record<PairKind, PairListConfig> = {
  conflict: {
    kind: 'conflict',
    storageKey: CONFLICT_STORAGE_KEY,
    listSelector: '#conflictList',
    inputASelector: '#conflictA',
    inputBSelector: '#conflictB',
    addButtonSelector: '#addConflictBtn',
    clearButtonSelector: '#clearConflictsBtn',
    emptyHint: '설정된 쌍이 없습니다',
    separator: '↔',
  },
  together: {
    kind: 'together',
    storageKey: TOGETHER_STORAGE_KEY,
    listSelector: '#togetherList',
    inputASelector: '#togetherA',
    inputBSelector: '#togetherB',
    addButtonSelector: '#addTogetherBtn',
    clearButtonSelector: '#clearTogetherBtn',
    emptyHint: '설정된 쌍이 없습니다',
    separator: '🤝',
  },
};

/**
 * The teacher-only panel: pairs that must share a group, and pairs that must
 * not. Both are stored locally and applied when a race starts.
 */
export class PairSettings {
  private pairs: Record<PairKind, Pair[]> = { conflict: [], together: [] };

  constructor() {
    this.load('conflict');
    this.load('together');
  }

  get conflictPairs(): Pair[] {
    return this.pairs.conflict;
  }

  get togetherPairs(): Pair[] {
    return this.pairs.together;
  }

  attach() {
    (Object.keys(LIST_CONFIGS) as PairKind[]).forEach((kind) => this.attachList(LIST_CONFIGS[kind]));

    $('#saveTeacherBtn').addEventListener('click', () => {
      this.save('conflict');
      this.save('together');
      this.close();
    });
    $('#closeTeacherModal').addEventListener('click', () => this.close());

    this.watchForKeyword();
    this.renderAll();
  }

  private attachList(config: PairListConfig) {
    const inputA = $<HTMLInputElement>(config.inputASelector);
    const inputB = $<HTMLInputElement>(config.inputBSelector);

    const addPair = () => {
      const a = inputA.value.trim();
      const b = inputB.value.trim();
      if (!a || !b || a === b) return;
      const existing = this.pairs[config.kind];
      const duplicate = existing.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
      if (duplicate) return;

      existing.push([a, b]);
      inputA.value = '';
      inputB.value = '';
      this.render(config);
    };

    $(config.addButtonSelector).addEventListener('click', addPair);
    [inputA, inputB].forEach((input) =>
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addPair();
      })
    );

    $(config.clearButtonSelector).addEventListener('click', () => {
      this.pairs[config.kind] = [];
      this.render(config);
    });

    // Delegated so rows can be re-rendered freely without rebinding handlers.
    $(config.listSelector).addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-index]');
      if (!button) return;
      const index = Number(button.dataset.index);
      if (Number.isNaN(index)) return;
      this.pairs[config.kind].splice(index, 1);
      this.render(config);
    });
  }

  private watchForKeyword() {
    let typed = '';
    document.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      typed += e.key.toLowerCase();
      if (typed.length > SECRET_KEYWORD.length) {
        typed = typed.slice(-SECRET_KEYWORD.length);
      }
      if (typed === SECRET_KEYWORD) {
        typed = '';
        this.open();
      }
    });
  }

  open() {
    this.renderAll();
    $('#teacherModal').classList.add('open');
  }

  close() {
    $('#teacherModal').classList.remove('open');
  }

  private renderAll() {
    (Object.keys(LIST_CONFIGS) as PairKind[]).forEach((kind) => this.render(LIST_CONFIGS[kind]));
  }

  private render(config: PairListConfig) {
    const list = $(config.listSelector);
    const pairs = this.pairs[config.kind];

    if (pairs.length === 0) {
      list.innerHTML = `<div class="empty-hint">${config.emptyHint}</div>`;
      return;
    }

    list.innerHTML = pairs
      .map(
        ([a, b], index) => `<div class="conflict-item">
        <span class="conflict-names"><span>${escapeHtml(a)}</span> ${config.separator} <span>${escapeHtml(b)}</span></span>
        <button class="del-btn" data-index="${index}">✕</button>
      </div>`
      )
      .join('');
  }

  private load(kind: PairKind) {
    const raw = localStorage.getItem(LIST_CONFIGS[kind].storageKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.pairs[kind] = parsed.filter(
          (entry): entry is Pair =>
            Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string'
        );
      }
    } catch (err) {
      console.warn(`[PairSettings] stored ${kind} pairs are unreadable, ignoring them`, err);
    }
  }

  private save(kind: PairKind) {
    localStorage.setItem(LIST_CONFIGS[kind].storageKey, JSON.stringify(this.pairs[kind]));
  }
}
