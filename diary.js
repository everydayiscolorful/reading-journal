const BOOKS_STORAGE_KEY = 'readingJournalBooks';
const DIARY_STORAGE_KEY = 'readingJournalDiaries';

let diaries = [];
let books = [];
let viewingDiaryId = null;
let formTags = [];
let selectedTagColor = 'purple';
let diaryFilters = {
  month: '',
  bookId: '',
  tag: '',
  keyword: '',
};

const diaryModal = document.getElementById('diaryModal');
const diaryDetailModal = document.getElementById('diaryDetailModal');
const diaryForm = document.getElementById('diaryForm');

function loadData() {
  try {
    const diaryData = localStorage.getItem(DIARY_STORAGE_KEY);
    diaries = diaryData ? JSON.parse(diaryData) : [];
  } catch {
    diaries = [];
  }
  diaries.forEach(entry => {
    if (!entry.tags) entry.tags = [];
  });
  try {
    const bookData = localStorage.getItem(BOOKS_STORAGE_KEY);
    books = bookData ? JSON.parse(bookData) : [];
  } catch {
    books = [];
  }
  loadTagColors();
}

function saveDiaries() {
  localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(diaries));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdays[new Date(dateStr + 'T12:00:00').getDay()];
  return `${y}年${parseInt(m)}月${parseInt(d)}日 · 星期${weekday}`;
}

function formatMonthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-');
  return `${y}年${parseInt(m)}月`;
}

function getBookTitle(bookId) {
  if (!bookId) return '';
  const book = books.find(b => b.id === bookId);
  return book ? book.title : '';
}

function getUniqueDiaryTags() {
  const tags = diaries.flatMap(d => d.tags || []).filter(Boolean);
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function updateTagDatalist() {
  document.getElementById('diaryTagList').innerHTML = getUniqueDiaryTags()
    .map(v => `<option value="${escapeHtml(v)}">`)
    .join('');
}

function getUniqueDiaryMonths() {
  const months = diaries
    .map(entry => entry.date?.slice(0, 7))
    .filter(Boolean);
  return [...new Set(months)].sort((a, b) => b.localeCompare(a));
}

function updateMonthFilterOptions() {
  const select = document.getElementById('filterMonth');
  const current = diaryFilters.month;
  let months = getUniqueDiaryMonths();
  if (current && !months.includes(current)) {
    months = [current, ...months];
  }

  select.innerHTML = `<option value="">全部月份</option>` +
    months.map(month => {
      const selected = month === current ? ' selected' : '';
      return `<option value="${escapeHtml(month)}"${selected}>${escapeHtml(formatMonthLabel(month))}</option>`;
    }).join('');
  select.value = current;
}

function updateTagFilterOptions() {
  const select = document.getElementById('filterTag');
  const current = diaryFilters.tag;
  const options = getUniqueDiaryTags();
  select.innerHTML = `<option value="">全部标签</option>` +
    options.map(v => {
      const selected = v === current ? ' selected' : '';
      return `<option value="${escapeHtml(v)}"${selected}>${escapeHtml(v)}</option>`;
    }).join('');
}

function renderDiaryTagsChips() {
  document.getElementById('diaryTagsChips').innerHTML = renderTagsChipsHtml(formTags);
}

function addFormTag(raw) {
  const tag = raw.trim();
  if (!tag) return;
  if (formTags.includes(tag)) return;
  formTags.push(tag);
  setTagColor(tag, selectedTagColor);
  renderDiaryTagsChips();
  document.getElementById('diaryTagInput').value = '';
  updateTagDatalist();
}

function removeFormTag(tag) {
  formTags = formTags.filter(t => t !== tag);
  renderDiaryTagsChips();
}

function resetTagForm() {
  formTags = [];
  selectedTagColor = 'purple';
  renderTagColorPicker(document.getElementById('diaryTagColorPicker'), selectedTagColor);
  renderDiaryTagsChips();
}

function updateBookSelectOptions() {
  const filterSelect = document.getElementById('filterBook');
  const diarySelect = document.getElementById('diaryBook');
  const currentFilter = diaryFilters.bookId;
  const currentDiary = diarySelect.value;

  const bookOptions = books
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    .map(b => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.title)}</option>`)
    .join('');

  filterSelect.innerHTML = `<option value="">全部书籍</option>${bookOptions}`;
  filterSelect.value = currentFilter;

  diarySelect.innerHTML = `<option value="">不关联书籍</option>${bookOptions}`;
  diarySelect.value = currentDiary;
}

function hasActiveDiaryFilters() {
  return Object.values(diaryFilters).some(v => v);
}

function applyDiaryFilters(list) {
  return list.filter(entry => {
    if (diaryFilters.month && !entry.date.startsWith(diaryFilters.month)) return false;
    if (diaryFilters.bookId && entry.bookId !== diaryFilters.bookId) return false;
    if (diaryFilters.tag && !(entry.tags || []).includes(diaryFilters.tag)) return false;
    if (diaryFilters.keyword) {
      const kw = diaryFilters.keyword.toLowerCase();
      const haystack = [
        entry.title,
        entry.content,
        entry.bookTitle,
        ...(entry.tags || []),
      ].join(' ').toLowerCase();
      if (!haystack.includes(kw)) return false;
    }
    return true;
  });
}

function updateDiaryFilterSummary(count) {
  const summary = document.getElementById('diaryFilterSummary');
  const clearBtn = document.getElementById('clearDiaryFiltersBtn');
  const active = hasActiveDiaryFilters();

  clearBtn.hidden = !active;
  summary.hidden = !active;
  if (!active) return;

  const parts = [];
  if (diaryFilters.month) parts.push(`月份：${formatMonthLabel(diaryFilters.month)}`);
  if (diaryFilters.bookId) {
    const title = getBookTitle(diaryFilters.bookId) || '未知书籍';
    parts.push(`书籍：${title}`);
  }
  if (diaryFilters.tag) parts.push(`标签：${diaryFilters.tag}`);
  if (diaryFilters.keyword) parts.push(`关键词：${diaryFilters.keyword}`);

  summary.textContent = `当前筛选 ${parts.join(' · ')}，共 ${count} 篇`;
}

function getContentPreview(content, maxLen = 120) {
  const text = (content || '').trim().replace(/\s+/g, ' ');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function renderDiaryCard(entry) {
  const bookLabel = entry.bookTitle
    ? `<span class="diary-card-book">${escapeHtml(entry.bookTitle)}</span>`
    : '';
  const titleLine = entry.title
    ? `<h3 class="diary-card-title">${escapeHtml(entry.title)}</h3>`
    : '';
  const tagsHtml = (entry.tags || []).length
    ? `<div class="diary-card-tags">${(entry.tags || []).map(t => renderTagSpan(t, true)).join('')}</div>`
    : '';

  return `
    <article class="diary-card" data-id="${entry.id}">
      <div class="diary-card-header">
        <time class="diary-card-date">${formatDate(entry.date)}</time>
        ${bookLabel}
      </div>
      ${titleLine}
      ${tagsHtml}
      <p class="diary-card-preview">${escapeHtml(getContentPreview(entry.content))}</p>
    </article>
  `;
}

function render() {
  updateMonthFilterOptions();
  updateBookSelectOptions();
  updateTagFilterOptions();
  updateTagDatalist();
  const filtered = applyDiaryFilters(
    [...diaries].sort((a, b) => b.date.localeCompare(a.date) || (b.updatedAt - a.updatedAt))
  );
  updateDiaryFilterSummary(filtered.length);

  const list = document.getElementById('diaryList');
  if (filtered.length === 0) {
    const hint = hasActiveDiaryFilters()
      ? '没有符合筛选条件的日记'
      : '还没有日记，点击右上角开始写第一篇';
    list.innerHTML = `<p class="empty-hint diary-empty">${hint}</p>`;
    return;
  }

  list.innerHTML = filtered.map(renderDiaryCard).join('');
}

function openAddDiaryModal() {
  document.getElementById('diaryModalTitle').textContent = '写日记';
  diaryForm.reset();
  document.getElementById('diaryId').value = '';
  document.getElementById('diaryDate').value = todayStr();
  resetTagForm();
  updateBookSelectOptions();
  diaryModal.showModal();
}

function openEditDiaryModal(id) {
  const entry = diaries.find(d => d.id === id);
  if (!entry) return;

  document.getElementById('diaryModalTitle').textContent = '编辑日记';
  document.getElementById('diaryId').value = entry.id;
  document.getElementById('diaryDate').value = entry.date;
  document.getElementById('diaryTitle').value = entry.title || '';
  document.getElementById('diaryContent').value = entry.content || '';
  formTags = [...(entry.tags || [])];
  selectedTagColor = 'purple';
  renderTagColorPicker(document.getElementById('diaryTagColorPicker'), selectedTagColor);
  renderDiaryTagsChips();
  updateBookSelectOptions();
  document.getElementById('diaryBook').value = entry.bookId || '';
  diaryModal.showModal();
}

function openDiaryDetail(id) {
  const entry = diaries.find(d => d.id === id);
  if (!entry) return;

  viewingDiaryId = id;
  document.getElementById('diaryDetailTitle').textContent = entry.title || '读书日记';

  const metaParts = [`<time>${formatDate(entry.date)}</time>`];
  if (entry.bookTitle) {
    metaParts.push(`<span class="diary-detail-book">📚 ${escapeHtml(entry.bookTitle)}</span>`);
  }
  if (entry.tags?.length) {
    metaParts.push(`<div class="diary-detail-tags">${entry.tags.map(t => renderTagSpan(t, true)).join('')}</div>`);
  }
  document.getElementById('diaryDetailMeta').innerHTML = metaParts.join('');
  document.getElementById('diaryDetailBody').textContent = entry.content;
  diaryDetailModal.showModal();
}

function deleteDiary(id) {
  const entry = diaries.find(d => d.id === id);
  if (!entry) return;
  if (!confirm('确定删除这篇日记吗？')) return;

  diaries = diaries.filter(d => d.id !== id);
  saveDiaries();
  render();
  diaryDetailModal.close();
}

function handleDiarySubmit(e) {
  e.preventDefault();

  const id = document.getElementById('diaryId').value;
  const bookId = document.getElementById('diaryBook').value;
  const entryData = {
    date: document.getElementById('diaryDate').value,
    title: document.getElementById('diaryTitle').value.trim(),
    content: document.getElementById('diaryContent').value.trim(),
    bookId: bookId || '',
    bookTitle: bookId ? getBookTitle(bookId) : '',
    tags: [...formTags],
    updatedAt: Date.now(),
  };

  if (id) {
    const idx = diaries.findIndex(d => d.id === id);
    if (idx !== -1) {
      diaries[idx] = { ...diaries[idx], ...entryData };
    }
  } else {
    diaries.push({ id: generateId(), ...entryData, createdAt: Date.now() });
  }

  saveDiaries();
  ReadingJournalStorage.autoBackupAfterSave();
  render();
  diaryModal.close();
}

function clearDiaryFilters() {
  diaryFilters = { month: '', bookId: '', tag: '', keyword: '' };
  document.getElementById('filterMonth').value = '';
  document.getElementById('filterBook').value = '';
  document.getElementById('filterTag').value = '';
  document.getElementById('filterKeyword').value = '';
  render();
}

function setDiaryTagFilter(tag) {
  diaryFilters.tag = tag;
  document.getElementById('filterTag').value = tag;
  render();
}

document.getElementById('addDiaryBtn').addEventListener('click', openAddDiaryModal);
document.getElementById('closeDiaryModalBtn').addEventListener('click', () => diaryModal.close());
document.getElementById('cancelDiaryBtn').addEventListener('click', () => diaryModal.close());
document.getElementById('closeDiaryDetailBtn').addEventListener('click', () => diaryDetailModal.close());
document.getElementById('clearDiaryFiltersBtn').addEventListener('click', clearDiaryFilters);
diaryForm.addEventListener('submit', handleDiarySubmit);

ReadingJournalStorage.bindTagInputCommit(
  document.getElementById('diaryTagInput'),
  document.getElementById('addDiaryTagBtn'),
  (value) => addFormTag(value),
);

document.getElementById('diaryTagsChips').addEventListener('click', (e) => {
  const btn = e.target.closest('.tag-chip-remove');
  if (btn) {
    removeFormTag(btn.dataset.tag);
    return;
  }
  const chip = e.target.closest('.tag-chip');
  if (chip?.dataset.tag) {
    cycleTagColor(chip.dataset.tag);
    renderDiaryTagsChips();
  }
});

document.getElementById('diaryTagColorPicker').addEventListener('click', (e) => {
  const dot = e.target.closest('.tag-color-dot');
  if (!dot) return;
  selectedTagColor = dot.dataset.color;
  renderTagColorPicker(document.getElementById('diaryTagColorPicker'), selectedTagColor);
});

document.getElementById('filterMonth').addEventListener('change', (e) => {
  diaryFilters.month = e.target.value;
  render();
});
document.getElementById('filterBook').addEventListener('change', (e) => {
  diaryFilters.bookId = e.target.value;
  render();
});
document.getElementById('filterTag').addEventListener('change', (e) => {
  diaryFilters.tag = e.target.value;
  render();
});
document.getElementById('filterKeyword').addEventListener('input', (e) => {
  diaryFilters.keyword = e.target.value.trim();
  render();
});

document.getElementById('diaryDetailEditBtn').addEventListener('click', () => {
  diaryDetailModal.close();
  if (viewingDiaryId) openEditDiaryModal(viewingDiaryId);
});
document.getElementById('diaryDetailDeleteBtn').addEventListener('click', () => {
  if (viewingDiaryId) deleteDiary(viewingDiaryId);
});

document.getElementById('diaryDetailMeta').addEventListener('click', (e) => {
  const tagEl = e.target.closest('[data-filter="tag"]');
  if (!tagEl) return;
  diaryDetailModal.close();
  setDiaryTagFilter(tagEl.dataset.value);
});

document.getElementById('diaryList').addEventListener('click', (e) => {
  const tagEl = e.target.closest('[data-filter="tag"]');
  if (tagEl) {
    setDiaryTagFilter(tagEl.dataset.value);
    return;
  }
  const card = e.target.closest('.diary-card');
  if (card) openDiaryDetail(card.dataset.id);
});

loadData();
render();
