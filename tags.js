const TAG_COLORS_STORAGE_KEY = 'readingJournalTagColors';

const TAG_COLOR_PALETTE = {
  rose: { label: '玫瑰' },
  orange: { label: '橙色' },
  amber: { label: '琥珀' },
  green: { label: '绿色' },
  teal: { label: '青色' },
  blue: { label: '蓝色' },
  purple: { label: '紫色' },
  pink: { label: '粉色' },
};

const TAG_COLOR_IDS = Object.keys(TAG_COLOR_PALETTE);

let tagColors = {};

function loadTagColors() {
  try {
    const data = localStorage.getItem(TAG_COLORS_STORAGE_KEY);
    tagColors = data ? JSON.parse(data) : {};
  } catch {
    tagColors = {};
  }
}

function saveTagColors() {
  localStorage.setItem(TAG_COLORS_STORAGE_KEY, JSON.stringify(tagColors));
}

function getDefaultTagColorId(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLOR_IDS[Math.abs(hash) % TAG_COLOR_IDS.length];
}

function getTagColorId(tag) {
  return tagColors[tag] || getDefaultTagColorId(tag);
}

function setTagColor(tag, colorId) {
  if (!TAG_COLOR_PALETTE[colorId]) return;
  tagColors[tag] = colorId;
  saveTagColors();
}

function cycleTagColor(tag) {
  const current = getTagColorId(tag);
  const idx = TAG_COLOR_IDS.indexOf(current);
  const next = TAG_COLOR_IDS[(idx + 1) % TAG_COLOR_IDS.length];
  setTagColor(tag, next);
}

function renderTagColorPicker(container, selectedColorId) {
  if (!container) return;
  container.innerHTML = `
    <span class="tag-color-picker-label">新标签颜色</span>
    ${TAG_COLOR_IDS.map(id => `
      <button type="button" class="tag-color-dot tag-color-${id}${id === selectedColorId ? ' active' : ''}"
        data-color="${id}" title="${TAG_COLOR_PALETTE[id].label}" aria-label="${TAG_COLOR_PALETTE[id].label}"></button>
    `).join('')}
  `;
}

function renderTagSpan(tag, clickable = false, filterKey = 'tag') {
  const colorId = getTagColorId(tag);
  const clickClass = clickable ? ' tag-clickable' : '';
  const clickAttrs = clickable
    ? ` data-filter="${filterKey}" data-value="${escapeHtml(tag)}"`
    : '';
  return `<span class="tag tag-color-${colorId}${clickClass}"${clickAttrs}>${escapeHtml(tag)}</span>`;
}

function renderTagsChipsHtml(tags, chipClass = 'tag-chip') {
  return tags.map(tag => {
    const colorId = getTagColorId(tag);
    return `
      <span class="${chipClass} tag-color-${colorId}" data-tag="${escapeHtml(tag)}" title="点击切换颜色">
        ${escapeHtml(tag)}
        <button type="button" class="tag-chip-remove" data-tag="${escapeHtml(tag)}" aria-label="移除标签">&times;</button>
      </span>
    `;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadTagColors();
