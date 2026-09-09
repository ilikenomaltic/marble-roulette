import { $, escapeHtml } from './dom';

const GROUP_COLORS = ['#7c6aff', '#ff6a9f', '#4ade80', '#facc15', '#38bdf8', '#fb923c', '#a78bfa', '#34d399'];

/** Plain consecutive chunks of the finishing order — the rule never changes. */
export function chunkIntoGroups(ranked: string[], groupSize: number): string[][] {
  if (ranked.length === 0 || groupSize < 1) return [];
  const groups: string[][] = [];
  for (let i = 0; i < ranked.length; i += groupSize) {
    groups.push(ranked.slice(i, i + groupSize));
  }
  return groups;
}

export function showGroupResult(groups: string[][]) {
  $('#groupResultGrid').innerHTML = groups
    .map((members, index) => {
      const color = GROUP_COLORS[index % GROUP_COLORS.length];
      const rows = members
        .map(
          (name) =>
            `<div class="group-member"><span class="dot" style="background:${color}"></span>${escapeHtml(name)}</div>`
        )
        .join('');
      return `<div class="group-card">
        <div class="group-title" style="color:${color}">${index + 1}조</div>
        ${rows}
      </div>`;
    })
    .join('');

  $('#groupResultPanel').classList.add('open');
}

export function hideGroupResult() {
  $('#groupResultPanel').classList.remove('open');
}
