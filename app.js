const STORAGE_KEY = 'readingJournalBooks';
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

const STATUS_LABELS = {
  finished: '已读完',
  reading: '正在读',
  planned: '计划读',
};

const STATUS_ORDER = ['finished', 'reading', 'planned'];

const PLAN_TYPES = {
  monthly: '月读计划',
  yearly: '年度计划',
  longterm: '长期计划',
};

const PLAN_TYPE_ORDER = ['monthly', 'yearly', 'longterm'];

const READ_FORMAT_LABELS = {
  paper: '纸质书',
  ebook: '电子书',
};

const EBOOK_PLATFORM_LABELS = {
  app: '手机 App',
  ereader: '阅读器',
};

const FILTER_FIELDS = [
  { key: 'category', selectId: 'filterCategory', label: '类别', emptyLabel: '全部类别' },
  { key: 'author', selectId: 'filterAuthor', label: '作者', emptyLabel: '全部作者' },
  { key: 'tag', selectId: 'filterTag', label: '标签', emptyLabel: '全部标签', type: 'tag' },
  { key: 'publisher', selectId: 'filterPublisher', label: '出版社', emptyLabel: '全部出版社' },
];

let books = [];
let viewingBookId = null;
let filters = {
  category: '',
  author: '',
  tag: '',
  publisher: '',
};
let plannedPlanFilter = '';
let finishedYearFilter = '';
let dragState = { id: null, sourceContainer: null, didDrag: false };
let formReadingRecords = [];
let formTags = [];
let selectedTagColor = 'purple';
let tagColors = {};

const DROP_CONTAINER_SELECTOR = '#list-finished, #list-reading, #list-planned, .plan-group-list';

const bookModal = document.getElementById('bookModal');
const detailModal = document.getElementById('detailModal');
const bookForm = document.getElementById('bookForm');

function loadBooks() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    books = data ? JSON.parse(data) : [];
  } catch {
    books = [];
  }
  migrateBooks();
  migrateSortOrder();
  loadTagColors();
}

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

function renderTagColorPicker() {
  const picker = document.getElementById('tagColorPicker');
  if (!picker) return;
  picker.innerHTML = `
    <span class="tag-color-picker-label">新标签颜色</span>
    ${TAG_COLOR_IDS.map(id => `
      <button type="button" class="tag-color-dot tag-color-${id}${id === selectedTagColor ? ' active' : ''}"
        data-color="${id}" title="${TAG_COLOR_PALETTE[id].label}" aria-label="${TAG_COLOR_PALETTE[id].label}"></button>
    `).join('')}
  `;
}

function renderTagSpan(tag, clickable = false) {
  const colorId = getTagColorId(tag);
  const clickClass = clickable ? ' tag-clickable' : '';
  const clickAttrs = clickable
    ? ` data-filter="tag" data-value="${escapeHtml(tag)}"`
    : '';
  return `<span class="tag tag-color-${colorId}${clickClass}"${clickAttrs}>${escapeHtml(tag)}</span>`;
}

function detailFilterTagLink(tag) {
  const colorId = getTagColorId(tag);
  return `<span class="detail-link tag tag-color-${colorId} tag-clickable" data-filter="tag" data-value="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`;
}

function migrateBooks() {
  books.forEach(book => {
    if (!book.readingRecords) {
      book.readingRecords = [];
      if (book.startDate || book.endDate || book.duration) {
        book.readingRecords.push({
          startDate: book.startDate || '',
          endDate: book.endDate || '',
          duration: book.duration || '',
          readFormat: '',
          ebookPlatform: '',
        });
      }
    }
    book.readingRecords.forEach(record => {
      if (record.readFormat == null) record.readFormat = '';
      if (record.ebookPlatform == null) record.ebookPlatform = '';
    });
    if (!book.tags) book.tags = [];
    if (book.authorOrigin && !book.authorRegion) {
      book.dynasty = book.authorOrigin;
      book.authorRegion = 'china';
      delete book.authorOrigin;
    }
    if (book.authorRegion == null) book.authorRegion = '';
    if (book.dynasty == null) book.dynasty = '';
    if (book.nationality == null) book.nationality = '';
    if (book.translator == null) book.translator = '';
    if (!book.readCount) book.readCount = Math.max(1, book.readingRecords.length || 1);
    syncLegacyDatesFromRecords(book);
  });
}

function formatAuthorInfo(book) {
  if (book.authorRegion === 'china') {
    return book.dynasty ? `中国 · ${book.dynasty}` : '中国';
  }
  if (book.authorRegion === 'foreign') {
    const parts = ['外国'];
    if (book.nationality) parts.push(book.nationality);
    if (book.translator) parts.push(`译者：${book.translator}`);
    return parts.join(' · ');
  }
  return '';
}

function toggleAuthorInfoFields() {
  const region = document.getElementById('authorRegion').value;
  document.getElementById('authorChinaFields').hidden = region !== 'china';
  document.getElementById('authorForeignFields').hidden = region !== 'foreign';
}

function readAuthorInfoFromForm() {
  const authorRegion = document.getElementById('authorRegion').value;
  return {
    authorRegion,
    dynasty: authorRegion === 'china' ? document.getElementById('dynasty').value.trim() : '',
    nationality: authorRegion === 'foreign' ? document.getElementById('nationality').value.trim() : '',
    translator: authorRegion === 'foreign' ? document.getElementById('translator').value.trim() : '',
  };
}

function fillAuthorInfoForm(book) {
  document.getElementById('authorRegion').value = book.authorRegion || '';
  document.getElementById('dynasty').value = book.dynasty || '';
  document.getElementById('nationality').value = book.nationality || '';
  document.getElementById('translator').value = book.translator || '';
  toggleAuthorInfoFields();
}

function getUniqueTags() {
  const tags = books.flatMap(b => b.tags || []).filter(Boolean);
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function renderTagsChips() {
  const container = document.getElementById('tagsChips');
  container.innerHTML = formTags.map(tag => {
    const colorId = getTagColorId(tag);
    return `
      <span class="tag-chip tag-color-${colorId}" data-tag="${escapeHtml(tag)}" title="点击切换颜色">
        ${escapeHtml(tag)}
        <button type="button" class="tag-chip-remove" data-tag="${escapeHtml(tag)}" aria-label="移除标签">&times;</button>
      </span>
    `;
  }).join('');
}

function addFormTag(raw) {
  const tag = raw.trim();
  if (!tag) return;
  if (formTags.includes(tag)) return;
  formTags.push(tag);
  setTagColor(tag, selectedTagColor);
  renderTagsChips();
  document.getElementById('tagInput').value = '';
  updateDatalists();
}

function removeFormTag(tag) {
  formTags = formTags.filter(t => t !== tag);
  renderTagsChips();
}

function getBookPlanGroup(book) {
  if (!book.planType || !PLAN_TYPES[book.planType]) return 'uncategorized';
  return book.planType;
}

function getBooksInSortGroup(status, planType = null) {
  let list = books.filter(b => b.status === status);
  if (status === 'planned') {
    if (planType === 'uncategorized') {
      list = list.filter(b => getBookPlanGroup(b) === 'uncategorized');
    } else {
      list = list.filter(b => b.planType === planType);
    }
  }
  return list;
}

function sortByOrder(list) {
  return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

function getNextSortOrder(status, planType = null) {
  const group = getBooksInSortGroup(status, planType);
  const max = group.reduce((m, b) => Math.max(m, b.sortOrder ?? 0), -1);
  return max + 1;
}

function migrateSortOrder() {
  STATUS_ORDER.forEach(status => {
    if (status === 'planned') {
      [...PLAN_TYPE_ORDER, 'uncategorized'].forEach(planType => {
        const group = sortByOrder(getBooksInSortGroup(status, planType));
        group.forEach((book, i) => {
          if (book.sortOrder == null) book.sortOrder = i;
        });
      });
    } else {
      const group = sortByOrder(getBooksInSortGroup(status));
      group.forEach((book, i) => {
        if (book.sortOrder == null) book.sortOrder = i;
      });
    }
  });
}

function applySortOrder(container) {
  if (!container) return;
  const ids = [...container.querySelectorAll('.book-card')].map(c => c.dataset.id);
  ids.forEach((id, index) => {
    const book = books.find(b => b.id === id);
    if (book) book.sortOrder = index;
  });
}

function saveBooks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
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
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

function calcDuration(start, end) {
  if (!start || !end) return '';
  const ms = new Date(end) - new Date(start);
  if (ms < 0) return '';
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1;
  return `${days}天`;
}

function ensureReadingRecords(book) {
  if (!book.readingRecords) book.readingRecords = [];
}

function getLastReadingRecord(book) {
  ensureReadingRecords(book);
  return book.readingRecords[book.readingRecords.length - 1] || null;
}

function syncLegacyDatesFromRecords(book) {
  ensureReadingRecords(book);
  const last = getLastReadingRecord(book);
  if (last) {
    book.startDate = last.startDate || '';
    book.endDate = last.endDate || '';
    book.duration = last.duration || '';
  } else {
    book.startDate = book.startDate || '';
    book.endDate = book.endDate || '';
    book.duration = book.duration || '';
  }
  book.readCount = Math.max(book.readCount || 1, book.readingRecords.length || 1);
}

function formatPlanPeriod(planType, planPeriod) {
  if (!planPeriod) return '';
  if (planType === 'monthly') {
    const [y, m] = planPeriod.split('-');
    return `${y}年${parseInt(m)}月`;
  }
  if (planType === 'yearly') {
    return `${planPeriod}年`;
  }
  return planPeriod;
}

function getPlanPeriodLabel(planType) {
  if (planType === 'monthly') return '计划月份';
  if (planType === 'yearly') return '计划年份';
  return '计划周期';
}

function getPlanPeriodPlaceholder(planType) {
  if (planType === 'longterm') return '如：2026-2028、不限';
  if (planType === 'yearly') return '如：2026';
  return '';
}

function renderPlanPeriodInput(planType, value = '') {
  const container = document.getElementById('planPeriodContainer');
  const label = getPlanPeriodLabel(planType);
  let inputHtml = '';

  if (planType === 'monthly') {
    inputHtml = `<input type="month" id="planPeriod" value="${escapeHtml(value)}">`;
  } else if (planType === 'yearly') {
    const year = value || new Date().getFullYear();
    inputHtml = `<input type="number" id="planPeriod" min="1900" max="2100" step="1" value="${escapeHtml(String(year))}" placeholder="${getPlanPeriodPlaceholder(planType)}">`;
  } else {
    inputHtml = `<input type="text" id="planPeriod" value="${escapeHtml(value)}" placeholder="${getPlanPeriodPlaceholder(planType)}">`;
  }

  container.innerHTML = `<label for="planPeriod" id="planPeriodLabel">${label}</label>${inputHtml}`;
}

function togglePlanFields() {
  const isPlanned = document.getElementById('bookStatus').value === 'planned';
  document.getElementById('planFields').hidden = !isPlanned;
  if (isPlanned) {
    const planType = document.getElementById('planType').value;
    const existing = document.getElementById('planPeriod');
    const currentValue = existing ? existing.value : '';
    renderPlanPeriodInput(planType, currentValue);
  }
}

function getRecordYear(record) {
  if (!record?.endDate) return null;
  return record.endDate.split('-')[0];
}

function getAllCompletedYears() {
  const years = new Set();
  books.forEach(book => {
    ensureReadingRecords(book);
    book.readingRecords.forEach(r => {
      const y = getRecordYear(r);
      if (y) years.add(y);
    });
  });
  return [...years].sort((a, b) => Number(b) - Number(a));
}

function getRecordsInYear(book, year) {
  ensureReadingRecords(book);
  return book.readingRecords.filter(r => getRecordYear(r) === year);
}

function formatReadMethod(record) {
  if (record.readFormat === 'paper') return READ_FORMAT_LABELS.paper;
  if (record.readFormat === 'ebook') {
    const platform = EBOOK_PLATFORM_LABELS[record.ebookPlatform];
    return platform ? `${READ_FORMAT_LABELS.ebook} · ${platform}` : READ_FORMAT_LABELS.ebook;
  }
  return '';
}

function defaultReadingRecord() {
  return { startDate: '', endDate: '', duration: '', readFormat: '', ebookPlatform: '' };
}

function updateFinishedYearFilterOptions() {
  const select = document.getElementById('finishedYearFilter');
  const years = getAllCompletedYears();
  select.innerHTML = `<option value="">全部年份</option>` +
    years.map(y => {
      const selected = y === finishedYearFilter ? ' selected' : '';
      return `<option value="${y}"${selected}>${y} 年</option>`;
    }).join('');
}

function getFinishedYearStats(finishedBooks, year) {
  const items = finishedBooks.map(book => ({
    book,
    yearRecords: getRecordsInYear(book, year),
  })).filter(item => item.yearRecords.length > 0);

  const totalReads = items.reduce((sum, item) => sum + item.yearRecords.length, 0);
  return { items, bookCount: items.length, totalReads };
}

function updateFinishedYearSummary(stats, year) {
  const summary = document.getElementById('finishedYearSummary');
  const exportBtn = document.getElementById('exportYearBtn');
  const exportFormat = document.getElementById('exportFormat');
  exportBtn.disabled = !year;
  exportFormat.disabled = !year;
  exportBtn.title = year ? `导出 ${year} 年书单` : '请先选择年度';

  if (!year) {
    summary.hidden = true;
    return;
  }
  summary.hidden = false;
  summary.textContent = `${year} 年共读完 ${stats.bookCount} 本书，合计 ${stats.totalReads} 次阅读`;
}

function downloadTextFile(content, filename, mimeType) {
  const bom = mimeType.includes('csv') ? '\uFEFF' : '';
  const blob = new Blob([bom + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value) {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildYearExportData(year) {
  const bookEntries = books
    .filter(b => getRecordsInYear(b, year).length > 0)
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'))
    .map(book => ({
      book,
      yearRecords: getRecordsInYear(book, year),
      yearReadCount: getRecordsInYear(book, year).length,
    }));

  const rows = [];
  bookEntries.forEach(({ book, yearRecords, yearReadCount }) => {
    yearRecords.forEach((record, index) => {
      rows.push({
        title: book.title,
        author: book.author || '',
        authorRegion: book.authorRegion || '',
        dynasty: book.dynasty || '',
        nationality: book.nationality || '',
        translator: book.translator || '',
        authorInfo: formatAuthorInfo(book),
        category: book.category || '',
        publisher: book.publisher || '',
        tags: book.tags || [],
        yearReadCount,
        readIndex: index + 1,
        startDate: record.startDate ? formatDate(record.startDate) : '',
        endDate: record.endDate ? formatDate(record.endDate) : '',
        duration: record.duration || '',
        readMethod: formatReadMethod(record),
        notes: book.notes || '',
      });
    });
  });

  return {
    year,
    bookEntries,
    rows,
    bookCount: bookEntries.length,
    totalReads: rows.length,
  };
}

function buildYearCsv(data) {
  const headers = [
    '书名', '作者', '作者信息', '类别', '出版社', '标签',
    '本年阅读次数', '第几次', '开始日期', '读完日期', '阅读周期', '阅读方式', '读书感悟',
  ];

  return [
    headers.map(escapeCsvCell).join(','),
    ...data.rows.map(row => [
      row.title,
      row.author,
      row.authorInfo,
      row.category,
      row.publisher,
      (row.tags || []).join('、'),
      row.yearReadCount,
      row.readIndex,
      row.startDate,
      row.endDate,
      row.duration,
      row.readMethod,
      row.notes,
    ].map(escapeCsvCell).join(',')),
  ].join('\n');
}

function buildYearMarkdown(data) {
  const { year, bookCount, totalReads, bookEntries } = data;
  const lines = [
    `# ${year} 年读书记录`,
    '',
    `共读完 **${bookCount}** 本书，合计 **${totalReads}** 次阅读`,
    '',
    '---',
    '',
  ];

  bookEntries.forEach(({ book, yearRecords, yearReadCount }) => {
    lines.push(`## ${book.title}`, '');
    if (book.author) lines.push(`- **作者**：${book.author}`);
    const authorInfo = formatAuthorInfo(book);
    if (authorInfo) lines.push(`- **作者信息**：${authorInfo}`);
    if (book.category) lines.push(`- **类别**：${book.category}`);
    if (book.publisher) lines.push(`- **出版社**：${book.publisher}`);
    if (book.tags?.length) lines.push(`- **标签**：${book.tags.join('、')}`);
    lines.push(`- **${year} 年阅读次数**：${yearReadCount} 次`, '');

    lines.push('### 阅读记录', '');
    yearRecords.forEach((record, i) => {
      lines.push(`#### 第 ${i + 1} 次`, '');
      if (record.startDate) lines.push(`- **开始**：${formatDate(record.startDate)}`);
      if (record.endDate) lines.push(`- **读完**：${formatDate(record.endDate)}`);
      if (record.duration) lines.push(`- **周期**：${record.duration}`);
      const method = formatReadMethod(record);
      if (method) lines.push(`- **方式**：${method}`);
      lines.push('');
    });

    if (book.adaptation) lines.push(`- **影视化**：${book.adaptation}`, '');
    if (book.authorBio) lines.push('**作者生平**', '', book.authorBio, '');
    if (book.extendedReading) lines.push('**拓展阅读**', '', book.extendedReading, '');
    if (book.notes) {
      lines.push('**读书感悟**', '');
      book.notes.split('\n').forEach(line => lines.push(`> ${line}`));
      lines.push('');
    }

    lines.push('---', '');
  });

  return lines.join('\n');
}

function buildYearJson(data) {
  const { year, bookCount, totalReads, bookEntries } = data;
  const payload = {
    year,
    exportedAt: new Date().toISOString(),
    summary: { bookCount, totalReads },
    books: bookEntries.map(({ book, yearRecords, yearReadCount }) => ({
      title: book.title,
      author: book.author || '',
      authorRegion: book.authorRegion || '',
      dynasty: book.dynasty || '',
      nationality: book.nationality || '',
      translator: book.translator || '',
      authorInfo: formatAuthorInfo(book),
      category: book.category || '',
      publisher: book.publisher || '',
      tags: book.tags || [],
      tagColors: (book.tags || []).reduce((acc, t) => {
        acc[t] = getTagColorId(t);
        return acc;
      }, {}),
      yearReadCount,
      readingRecords: yearRecords.map((record, i) => ({
        index: i + 1,
        startDate: record.startDate || '',
        endDate: record.endDate || '',
        duration: record.duration || '',
        readFormat: record.readFormat || '',
        ebookPlatform: record.ebookPlatform || '',
        readMethod: formatReadMethod(record),
      })),
      adaptation: book.adaptation || '',
      authorBio: book.authorBio || '',
      extendedReading: book.extendedReading || '',
      notes: book.notes || '',
    })),
  };
  return JSON.stringify(payload, null, 2);
}

function exportYearBookList(year, format) {
  const data = buildYearExportData(year);

  if (data.rows.length === 0) {
    alert(`${year} 年暂无读完记录，无法导出`);
    return;
  }

  const exporters = {
    csv: {
      content: buildYearCsv(data),
      filename: `读书记录_${year}年.csv`,
      mimeType: 'text/csv;charset=utf-8;',
    },
    markdown: {
      content: buildYearMarkdown(data),
      filename: `读书记录_${year}年.md`,
      mimeType: 'text/markdown;charset=utf-8;',
    },
    json: {
      content: buildYearJson(data),
      filename: `读书记录_${year}年.json`,
      mimeType: 'application/json;charset=utf-8;',
    },
  };

  const exporter = exporters[format] || exporters.csv;
  downloadTextFile(exporter.content, exporter.filename, exporter.mimeType);
}

function renderFinishedColumn(statusBooks) {
  updateFinishedYearFilterOptions();

  const list = document.getElementById('list-finished');
  const count = document.getElementById('count-finished');

  let displayBooks = statusBooks;
  let yearStats = null;

  if (finishedYearFilter) {
    yearStats = getFinishedYearStats(statusBooks, finishedYearFilter);
    displayBooks = yearStats.items.map(item => item.book);
    count.textContent = yearStats.bookCount;
    updateFinishedYearSummary(yearStats, finishedYearFilter);
  } else {
    count.textContent = statusBooks.length;
    updateFinishedYearSummary(null, '');
  }

  if (displayBooks.length === 0) {
    const hint = hasActiveFilters()
      ? '没有符合筛选条件的书籍'
      : finishedYearFilter
        ? `${finishedYearFilter} 年暂无读完记录`
        : '拖拽书籍到此处，或点击右上角添加';
    list.innerHTML = `<p class="empty-hint">${hint}</p>`;
    return;
  }

  list.innerHTML = sortByOrder(displayBooks).map(book => {
    const yearCount = finishedYearFilter ? getRecordsInYear(book, finishedYearFilter).length : 0;
    return renderBookCard(book, { yearFilter: finishedYearFilter, yearCount });
  }).join('');
}

function renderRecordFormatFields(record, index) {
  const isEbook = record.readFormat === 'ebook';
  const platformDisabled = !isEbook ? 'disabled' : '';
  const wrapClass = isEbook ? 'record-platform-wrap' : 'record-platform-wrap disabled';
  return `
    <div class="form-row two-col">
      <div>
        <label>阅读方式</label>
        <select class="record-format" data-index="${index}">
          <option value=""${record.readFormat === '' ? ' selected' : ''}>未选择</option>
          <option value="paper"${record.readFormat === 'paper' ? ' selected' : ''}>纸质书</option>
          <option value="ebook"${record.readFormat === 'ebook' ? ' selected' : ''}>电子书</option>
        </select>
      </div>
      <div class="${wrapClass}">
        <label>电子书平台</label>
        <select class="record-platform" data-index="${index}" ${platformDisabled}>
          <option value=""${!record.ebookPlatform ? ' selected' : ''}>请选择</option>
          <option value="app"${record.ebookPlatform === 'app' ? ' selected' : ''}>手机 App</option>
          <option value="ereader"${record.ebookPlatform === 'ereader' ? ' selected' : ''}>阅读器</option>
        </select>
      </div>
    </div>
  `;
}

function toggleRecordPlatformSelect(item) {
  const format = item.querySelector('.record-format').value;
  const wrap = item.querySelector('.record-platform-wrap');
  const platform = item.querySelector('.record-platform');
  const isEbook = format === 'ebook';
  wrap.classList.toggle('disabled', !isEbook);
  platform.disabled = !isEbook;
  if (!isEbook) platform.value = '';
}

function toggleFormSections() {
  const status = document.getElementById('bookStatus').value;
  document.getElementById('readingFields').hidden = status === 'planned';
  togglePlanFields();
  if (status !== 'planned') renderReadingRecordsForm();
}

function renderReadingRecordsForm() {
  const status = document.getElementById('bookStatus').value;
  const list = document.getElementById('readingRecordsList');
  if (status === 'planned') return;

  const readCount = Math.max(1, parseInt(document.getElementById('readCount').value, 10) || 1);
  while (formReadingRecords.length < readCount) {
    formReadingRecords.push(defaultReadingRecord());
  }
  formReadingRecords = formReadingRecords.slice(0, readCount);

  list.innerHTML = formReadingRecords.map((record, i) => {
    const isLast = i === readCount - 1;
    const endLabel = status === 'finished' || !isLast ? '读完日期' : '读完日期（选填）';
    const endRequired = status === 'finished' ? 'required' : '';
    return `
      <div class="reading-record-item" data-index="${i}">
        <div class="reading-record-title">第 ${i + 1} 次阅读</div>
        ${renderRecordFormatFields(record, i)}
        <div class="form-row two-col">
          <div>
            <label>开始日期</label>
            <input type="date" class="record-start" value="${escapeHtml(record.startDate || '')}">
          </div>
          <div>
            <label>${endLabel}</label>
            <input type="date" class="record-end" value="${escapeHtml(record.endDate || '')}" ${endRequired}>
          </div>
        </div>
        <div class="form-row">
          <label>阅读周期</label>
          <input type="text" class="record-duration" value="${escapeHtml(record.duration || '')}" placeholder="填写起止日期后自动计算">
        </div>
      </div>
    `;
  }).join('');
}

function readReadingRecordsFromForm() {
  const items = document.querySelectorAll('.reading-record-item');
  return [...items].map(item => {
    const startDate = item.querySelector('.record-start').value;
    const endDate = item.querySelector('.record-end').value;
    let duration = item.querySelector('.record-duration').value.trim();
    if (!duration && startDate && endDate) {
      duration = calcDuration(startDate, endDate);
    }
    const readFormat = item.querySelector('.record-format').value;
    const ebookPlatform = readFormat === 'ebook' ? item.querySelector('.record-platform').value : '';
    return { startDate, endDate, duration, readFormat, ebookPlatform };
  });
}

function readPlanPeriodValue() {
  const planType = document.getElementById('planType').value;
  const input = document.getElementById('planPeriod');
  if (!input) return '';
  const value = input.value.trim();
  if (planType === 'yearly' && value) return String(parseInt(value, 10));
  return value;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getUniqueValues(field) {
  const values = books
    .map(b => (b[field] || '').trim())
    .filter(Boolean);
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function updateDatalists() {
  const mapping = {
    categoryList: 'category',
    authorList: 'author',
    publisherList: 'publisher',
  };

  Object.entries(mapping).forEach(([listId, field]) => {
    const list = document.getElementById(listId);
    list.innerHTML = getUniqueValues(field)
      .map(v => `<option value="${escapeHtml(v)}">`)
      .join('');
  });

  document.getElementById('dynastyList').innerHTML = books
    .map(b => b.dynasty).filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map(v => `<option value="${escapeHtml(v)}">`).join('');

  document.getElementById('nationalityList').innerHTML = books
    .map(b => b.nationality).filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map(v => `<option value="${escapeHtml(v)}">`).join('');

  document.getElementById('translatorList').innerHTML = books
    .map(b => b.translator).filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map(v => `<option value="${escapeHtml(v)}">`).join('');

  document.getElementById('tagList').innerHTML = getUniqueTags()
    .map(v => `<option value="${escapeHtml(v)}">`).join('');
}

function updateFilterOptions() {
  FILTER_FIELDS.forEach(({ key, selectId, emptyLabel, type }) => {
    const select = document.getElementById(selectId);
    const current = filters[key];
    const options = type === 'tag' ? getUniqueTags() : getUniqueValues(key);

    select.innerHTML = `<option value="">${emptyLabel}</option>` +
      options.map(v => {
        const selected = v === current ? ' selected' : '';
        return `<option value="${escapeHtml(v)}"${selected}>${escapeHtml(v)}</option>`;
      }).join('');
  });
}

function hasActiveFilters() {
  return Object.values(filters).some(v => v);
}

function applyFilters(list) {
  return list.filter(book =>
    FILTER_FIELDS.every(({ key, type }) => {
      const filterVal = filters[key];
      if (!filterVal) return true;
      if (type === 'tag') {
        return (book.tags || []).includes(filterVal);
      }
      return (book[key] || '').trim() === filterVal;
    })
  );
}

function setFilter(key, value) {
  filters[key] = value;
  document.getElementById(
    FILTER_FIELDS.find(f => f.key === key).selectId
  ).value = value;
  render();
}

function clearFilters() {
  filters = { category: '', author: '', tag: '', publisher: '' };
  FILTER_FIELDS.forEach(({ selectId }) => {
    document.getElementById(selectId).value = '';
  });
  render();
}

function updateFilterSummary(filteredCount) {
  const summary = document.getElementById('filterSummary');
  const clearBtn = document.getElementById('clearFiltersBtn');
  const active = hasActiveFilters();

  clearBtn.hidden = !active;
  summary.hidden = !active;

  if (!active) return;

  const parts = FILTER_FIELDS
    .filter(({ key }) => filters[key])
    .map(({ key, label }) => `${label}：${filters[key]}`);

  summary.textContent = `当前筛选 ${parts.join(' · ')}，共 ${filteredCount} 本`;
}

function getFinishedDisplayInfo(book) {
  ensureReadingRecords(book);
  const completed = book.readingRecords.filter(r => r.endDate);
  if (completed.length === 0) {
    return { endDate: book.endDate, duration: book.duration, count: book.readCount || 1 };
  }
  const last = completed[completed.length - 1];
  return {
    endDate: last.endDate,
    duration: last.duration,
    count: book.readCount || completed.length,
  };
}

function renderBookCard(book, options = {}) {
  const { yearFilter, yearCount } = options;
  const infoTags = [];
  if (book.status === 'planned' && book.planType) {
    const periodText = formatPlanPeriod(book.planType, book.planPeriod);
    const planLabel = periodText
      ? `${PLAN_TYPES[book.planType]} · ${periodText}`
      : PLAN_TYPES[book.planType];
    infoTags.push(`<span class="tag tag-plan">${escapeHtml(planLabel)}</span>`);
  }
  if (book.category) {
    infoTags.push(`<span class="tag tag-category tag-clickable" data-filter="category" data-value="${escapeHtml(book.category)}">${escapeHtml(book.category)}</span>`);
  }
  (book.tags || []).forEach(tag => {
    infoTags.push(renderTagSpan(tag, true));
  });
  const authorInfo = formatAuthorInfo(book);
  if (authorInfo) {
    infoTags.push(`<span class="tag tag-origin">${escapeHtml(authorInfo)}</span>`);
  }
  if (book.publisher) {
    infoTags.push(`<span class="tag tag-publisher tag-clickable" data-filter="publisher" data-value="${escapeHtml(book.publisher)}">${escapeHtml(book.publisher)}</span>`);
  }

  const timeTags = [];
  if (book.status === 'finished') {
    if (yearFilter && yearCount) {
      timeTags.push(`${yearFilter} 年 ${yearCount} 次`);
      const yearRecords = getRecordsInYear(book, yearFilter);
      const lastInYear = yearRecords[yearRecords.length - 1];
      if (lastInYear?.endDate) timeTags.push(`最近 ${formatDate(lastInYear.endDate)}`);
      if (lastInYear?.duration) timeTags.push(`周期 ${lastInYear.duration}`);
      const method = formatReadMethod(lastInYear);
      if (method) infoTags.push(`<span class="tag tag-format">${escapeHtml(method)}</span>`);
    } else {
      const info = getFinishedDisplayInfo(book);
      if (info.endDate) timeTags.push(`读完 ${formatDate(info.endDate)}`);
      if (info.duration) timeTags.push(`周期 ${info.duration}`);
      if (info.count > 1) timeTags.push(`共 ${info.count} 次`);
      const last = getLastReadingRecord(book);
      const method = last ? formatReadMethod(last) : '';
      if (method) infoTags.push(`<span class="tag tag-format">${escapeHtml(method)}</span>`);
    }
  } else if (book.status === 'reading') {
    if (book.startDate) timeTags.push(`开始 ${formatDate(book.startDate)}`);
    if (book.readCount > 1) timeTags.push(`第 ${book.readCount} 次`);
    const last = getLastReadingRecord(book);
    const method = last ? formatReadMethod(last) : '';
    if (method) infoTags.push(`<span class="tag tag-format">${escapeHtml(method)}</span>`);
  }

  const infoHtml = infoTags.length ? `<div class="book-card-meta">${infoTags.join('')}</div>` : '';
  const timeHtml = timeTags.length
    ? `<div class="book-card-meta">${timeTags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
    : '';
  const notesHtml = book.notes
    ? `<p class="book-card-notes">${escapeHtml(book.notes)}</p>`
    : '';

  const authorLine = book.author
    ? `<p class="book-card-author"><span class="tag-clickable" data-filter="author" data-value="${escapeHtml(book.author)}">${escapeHtml(book.author)}</span></p>`
    : '';

  return `
    <article class="book-card" data-id="${book.id}">
      <div class="book-card-top">
        <button type="button" class="book-card-drag" draggable="true" aria-label="拖动排序" title="拖动排序">⠿</button>
        <h3 class="book-card-title">${escapeHtml(book.title)}</h3>
      </div>
      ${authorLine}
      ${infoHtml}
      ${timeHtml}
      ${notesHtml}
      <div class="book-card-actions">
        <button type="button" class="btn btn-sm btn-ghost" data-action="edit" data-id="${book.id}">编辑</button>
      </div>
    </article>
  `;
}

function sortPlannedBooks(list) {
  return sortByOrder(list);
}

function findDropContainer(el) {
  const direct = el?.closest(DROP_CONTAINER_SELECTOR);
  if (direct) return direct;

  const column = el?.closest('.column[data-status]');
  if (!column) return null;

  const status = column.dataset.status;
  if (status === 'finished') return document.getElementById('list-finished');
  if (status === 'reading') return document.getElementById('list-reading');
  if (status === 'planned') {
    const list = document.getElementById('list-planned');
    return list?.querySelector('.plan-group-list') || list;
  }
  return null;
}

function getContainerStatus(container) {
  if (!container) return null;
  if (container.matches('.plan-group-list') || container.id === 'list-planned') return 'planned';
  if (container.id === 'list-finished') return 'finished';
  if (container.id === 'list-reading') return 'reading';
  return null;
}

function getContainerPlanType(container) {
  if (!container?.matches('.plan-group-list')) return null;
  return container.closest('.plan-group')?.dataset.planType || 'uncategorized';
}

function clearDropHighlights() {
  document.querySelectorAll('.drop-target-active').forEach(el => {
    el.classList.remove('drop-target-active');
  });
  document.querySelectorAll('.column.drop-highlight').forEach(el => {
    el.classList.remove('drop-highlight');
  });
}

function prepareContainerForDrop(container) {
  const hint = container.querySelector('.empty-hint');
  if (hint) hint.remove();
}

function getDragAfterElement(container, y) {
  const cards = [...container.querySelectorAll('.book-card:not(.is-dragging)')];
  return cards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;
}

function setupDragAndDrop() {
  document.querySelectorAll(DROP_CONTAINER_SELECTOR).forEach(container => {
    container.dataset.sortable = hasActiveFilters() ? 'off' : 'on';
  });
}

function updateBookStatusOnMove(book, newStatus, targetPlanType) {
  const oldStatus = book.status;
  book.status = newStatus;

  if (newStatus === 'planned') {
    if (targetPlanType && targetPlanType !== 'uncategorized') {
      book.planType = targetPlanType;
    } else if (!book.planType) {
      book.planType = 'monthly';
    }
  }

  ensureReadingRecords(book);
  const today = todayStr();

  if (newStatus === 'finished' && oldStatus !== 'finished') {
    const last = getLastReadingRecord(book);
    if (!last || last.endDate) {
      book.readingRecords.push({
        startDate: book.startDate || today,
        endDate: today,
        duration: calcDuration(book.startDate || today, today),
        readFormat: '',
        ebookPlatform: '',
      });
    } else {
      last.endDate = today;
      if (!last.duration && last.startDate) {
        last.duration = calcDuration(last.startDate, today);
      }
    }
    book.readCount = Math.max(book.readCount || 1, book.readingRecords.length);
    syncLegacyDatesFromRecords(book);
  }

  if (newStatus === 'reading' && oldStatus !== 'reading') {
    const last = getLastReadingRecord(book);
    if (!last || last.endDate) {
      book.readingRecords.push({
        startDate: today,
        endDate: '',
        duration: '',
        readFormat: '',
        ebookPlatform: '',
      });
      book.readCount = Math.max(book.readCount || 1, book.readingRecords.length);
    }
    book.startDate = getLastReadingRecord(book)?.startDate || today;
    book.endDate = '';
    syncLegacyDatesFromRecords(book);
  }

  book.sortOrder = getNextSortOrder(
    newStatus,
    newStatus === 'planned' ? getBookPlanGroup(book) : null
  );
}

function handleDragStart(e) {
  if (hasActiveFilters()) return;
  const handle = e.target.closest('.book-card-drag');
  if (!handle) return;

  const card = handle.closest('.book-card');
  const container = card.closest(DROP_CONTAINER_SELECTOR);
  if (!container || container.dataset.sortable === 'off') return;

  dragState = {
    id: card.dataset.id,
    sourceContainer: container,
    didDrag: false,
  };

  card.classList.add('is-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', card.dataset.id);
}

function handleDragOver(e) {
  if (hasActiveFilters() || !dragState.id) return;

  let container = findDropContainer(e.target);
  if (!container || container.dataset.sortable === 'off') return;

  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  clearDropHighlights();
  container.classList.add('drop-target-active');
  container.closest('.column')?.classList.add('drop-highlight');

  prepareContainerForDrop(container);

  const card = document.querySelector(`.book-card[data-id="${dragState.id}"]`);
  if (!card) return;

  const afterElement = getDragAfterElement(container, e.clientY);
  if (afterElement) {
    container.insertBefore(card, afterElement);
  } else {
    container.appendChild(card);
  }
}

function handleDrop(e) {
  if (hasActiveFilters() || !dragState.id) return;
  const container = findDropContainer(e.target);
  if (!container) return;
  e.preventDefault();
  dragState.didDrag = true;
}

function handleDragEnd() {
  const { id, sourceContainer } = dragState;

  clearDropHighlights();
  document.querySelectorAll('.book-card.is-dragging').forEach(el => {
    el.classList.remove('is-dragging');
  });

  const card = document.querySelector(`.book-card[data-id="${id}"]`);
  const targetContainer = card?.closest(DROP_CONTAINER_SELECTOR);

  if (id && targetContainer && !hasActiveFilters()) {
    const book = books.find(b => b.id === id);
    const newStatus = getContainerStatus(targetContainer);
    const newPlanType = getContainerPlanType(targetContainer);
    let statusChanged = false;

    if (book && newStatus) {
      statusChanged = book.status !== newStatus;
      const planChanged = newStatus === 'planned'
        && newPlanType
        && newPlanType !== 'uncategorized'
        && getBookPlanGroup(book) !== newPlanType;

      if (statusChanged || planChanged) {
        updateBookStatusOnMove(book, newStatus, newPlanType);
      }
    }

    applySortOrder(targetContainer);
    if (sourceContainer && sourceContainer !== targetContainer) {
      applySortOrder(sourceContainer);
    }

    saveBooks();
    if (statusChanged) {
      ReadingJournalStorage.autoBackupAfterSave();
    }
    dragState.didDrag = true;

    if (targetContainer !== sourceContainer) {
      render();
    }
  } else if (id && targetContainer) {
    applySortOrder(targetContainer);
    saveBooks();
    dragState.didDrag = true;
  }

  setTimeout(() => {
    dragState = { id: null, sourceContainer: null, didDrag: false };
  }, 0);
}

function renderPlannedColumn(statusBooks) {
  const list = document.getElementById('list-planned');
  const groups = PLAN_TYPE_ORDER.map(planType => ({
    planType,
    books: sortPlannedBooks(statusBooks.filter(b => b.planType === planType)),
  }));

  const ungrouped = statusBooks.filter(b => getBookPlanGroup(b) === 'uncategorized');
  if (ungrouped.length) {
    groups.push({ planType: 'uncategorized', books: sortByOrder(ungrouped) });
  }

  const visibleGroups = plannedPlanFilter
    ? groups.filter(g => g.planType === plannedPlanFilter)
    : groups.filter(g => g.books.length > 0);

  if (statusBooks.length === 0) {
    const hint = hasActiveFilters()
      ? '没有符合筛选条件的书籍'
      : '暂无书籍，点击右上角添加';
    list.innerHTML = `<p class="empty-hint">拖拽书籍到此处，或点击右上角添加</p>`;
    return;
  }

  if (visibleGroups.length === 0) {
    list.innerHTML = `<p class="empty-hint">该计划分类下暂无书籍</p>`;
    return;
  }

  list.innerHTML = visibleGroups.map(group => {
    const title = group.planType === 'uncategorized'
      ? '未分类'
      : PLAN_TYPES[group.planType];
    const cards = group.books.map(renderBookCard).join('');
    const emptyHint = group.books.length === 0
      ? '<p class="empty-hint">拖拽书籍到此处</p>'
      : '';
    return `
      <div class="plan-group" data-plan-type="${group.planType}">
        <div class="plan-group-header">
          <h3 class="plan-group-title">${title}</h3>
          <span class="plan-group-count">${group.books.length} 本</span>
        </div>
        <div class="plan-group-list">${cards}${emptyHint}</div>
      </div>
    `;
  }).join('');
}

function updatePlanTabs() {
  document.querySelectorAll('.plan-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.planFilter === plannedPlanFilter);
  });
}

function render() {
  const filtered = applyFilters(books);
  updateFilterOptions();
  updateDatalists();
  updateFilterSummary(filtered.length);
  updatePlanTabs();

  STATUS_ORDER.forEach(status => {
    const count = document.getElementById(`count-${status}`);
    const statusBooks = filtered.filter(b => b.status === status);

    count.textContent = statusBooks.length;

    if (status === 'planned') {
      renderPlannedColumn(statusBooks);
      return;
    }

    if (status === 'finished') {
      renderFinishedColumn(statusBooks);
      return;
    }

    const list = document.getElementById(`list-${status}`);

    if (statusBooks.length === 0) {
      const hint = hasActiveFilters()
        ? '没有符合筛选条件的书籍'
        : '拖拽书籍到此处，或点击右上角添加';
      list.innerHTML = `<p class="empty-hint">${hint}</p>`;
    } else {
      list.innerHTML = sortByOrder(statusBooks).map(renderBookCard).join('');
    }
  });

  setupDragAndDrop();
}

function openAddModal(status = 'reading') {
  document.getElementById('modalTitle').textContent = '添加书籍';
  bookForm.reset();
  document.getElementById('bookId').value = '';
  document.getElementById('bookStatus').value = status;
  document.getElementById('readCount').value = 1;
  document.getElementById('planType').value = 'monthly';
  formReadingRecords = [defaultReadingRecord()];
  formTags = [];
  selectedTagColor = 'purple';
  renderTagColorPicker();
  renderTagsChips();
  document.getElementById('authorRegion').value = '';
  toggleAuthorInfoFields();
  document.getElementById('extensionSection').open = false;
  renderPlanPeriodInput('monthly');
  toggleFormSections();
  updateDatalists();
  bookModal.showModal();
}

function openEditModal(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;

  document.getElementById('modalTitle').textContent = '编辑书籍';
  document.getElementById('bookId').value = book.id;
  document.getElementById('bookTitle').value = book.title;
  document.getElementById('bookAuthor').value = book.author || '';
  fillAuthorInfoForm(book);
  document.getElementById('bookCategory').value = book.category || '';
  document.getElementById('bookPublisher').value = book.publisher || '';
  document.getElementById('bookStatus').value = book.status;
  document.getElementById('planType').value = book.planType || 'monthly';
  renderPlanPeriodInput(book.planType || 'monthly', book.planPeriod || '');
  document.getElementById('readCount').value = book.readCount || 1;
  formReadingRecords = (book.readingRecords || []).map(r => ({ ...r }));
  if (formReadingRecords.length === 0) {
    formReadingRecords = [{
      startDate: book.startDate || '',
      endDate: book.endDate || '',
      duration: book.duration || '',
      readFormat: '',
      ebookPlatform: '',
    }];
  }
  document.getElementById('adaptation').value = book.adaptation || '';
  document.getElementById('authorBio').value = book.authorBio || '';
  document.getElementById('extendedReading').value = book.extendedReading || '';
  document.getElementById('notes').value = book.notes || '';
  formTags = [...(book.tags || [])];
  renderTagColorPicker();
  renderTagsChips();
  document.getElementById('extensionSection').open = !!(book.adaptation || book.authorBio || book.extendedReading);
  toggleFormSections();
  updateDatalists();
  bookModal.showModal();
}

function detailFilterLink(key, value) {
  return `<span class="detail-link" data-filter="${key}" data-value="${escapeHtml(value)}">${escapeHtml(value)}</span>`;
}

function openDetailModal(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;

  viewingBookId = id;
  document.getElementById('detailTitle').textContent = book.title;

  const rows = [];
  if (book.author) {
    rows.push(`<p class="detail-author">作者：${detailFilterLink('author', book.author)}</p>`);
  }
  const authorInfo = formatAuthorInfo(book);
  if (authorInfo) {
    rows.push(`<div class="detail-row"><span class="detail-label">作者信息</span><span class="detail-value">${escapeHtml(authorInfo)}</span></div>`);
  }
  if (book.category) {
    rows.push(`<div class="detail-row"><span class="detail-label">类别</span><span class="detail-value">${detailFilterLink('category', book.category)}</span></div>`);
  }
  if (book.publisher) {
    rows.push(`<div class="detail-row"><span class="detail-label">出版社</span><span class="detail-value">${detailFilterLink('publisher', book.publisher)}</span></div>`);
  }
  if (book.tags?.length) {
    rows.push(`<div class="detail-row"><span class="detail-label">标签</span><span class="detail-value">${book.tags.map(t => detailFilterTagLink(t)).join(' ')}</span></div>`);
  }
  rows.push(`<div class="detail-row"><span class="detail-label">状态</span><span class="detail-value">${STATUS_LABELS[book.status]}</span></div>`);

  if (book.status === 'planned' && book.planType) {
    const periodText = formatPlanPeriod(book.planType, book.planPeriod);
    rows.push(`<div class="detail-row"><span class="detail-label">计划类型</span><span class="detail-value">${PLAN_TYPES[book.planType]}</span></div>`);
    if (periodText) {
      rows.push(`<div class="detail-row"><span class="detail-label">计划周期</span><span class="detail-value">${escapeHtml(periodText)}</span></div>`);
    }
  }

  ensureReadingRecords(book);
  if (book.status !== 'planned' && book.readingRecords.length) {
    rows.push(`<div class="detail-section-title">阅读记录</div>`);
    if (book.readCount > 1) {
      rows.push(`<div class="detail-row"><span class="detail-label">次数</span><span class="detail-value">共 ${book.readCount} 次</span></div>`);
    }
    book.readingRecords.forEach((record, i) => {
      const parts = [];
      if (record.startDate) parts.push(`开始 ${formatDate(record.startDate)}`);
      if (record.endDate) parts.push(`读完 ${formatDate(record.endDate)}`);
      if (record.duration) parts.push(`周期 ${record.duration}`);
      const method = formatReadMethod(record);
      if (method) parts.push(method);
      rows.push(`
        <div class="detail-record">
          <div class="detail-record-title">第 ${i + 1} 次阅读</div>
          ${parts.length ? parts.join(' · ') : '暂无记录'}
        </div>
      `);
    });
  }

  if (book.adaptation || book.authorBio || book.extendedReading) {
    rows.push(`<div class="detail-section-title">拓展信息</div>`);
    if (book.adaptation) {
      rows.push(`<div class="detail-row"><span class="detail-label">影视化</span><span class="detail-value">${escapeHtml(book.adaptation)}</span></div>`);
    }
    if (book.authorBio) {
      rows.push(`<div class="detail-row" style="flex-direction:column"><span class="detail-label">作者生平</span><div class="detail-notes">${escapeHtml(book.authorBio)}</div></div>`);
    }
    if (book.extendedReading) {
      rows.push(`<div class="detail-row" style="flex-direction:column"><span class="detail-label">拓展阅读</span><div class="detail-notes">${escapeHtml(book.extendedReading)}</div></div>`);
    }
  }

  if (book.notes) {
    rows.push(`<div class="detail-row" style="flex-direction:column"><span class="detail-label">感悟</span><div class="detail-notes">${escapeHtml(book.notes)}</div></div>`);
  }

  document.getElementById('detailBody').innerHTML = rows.join('');
  detailModal.showModal();
}

function deleteBook(id) {
  const book = books.find(b => b.id === id);
  if (!book) return;
  if (!confirm(`确定删除「${book.title}」吗？`)) return;

  books = books.filter(b => b.id !== id);
  saveBooks();
  render();
  detailModal.close();
}

function handleFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('bookId').value;
  const status = document.getElementById('bookStatus').value;
  const readCount = Math.max(1, parseInt(document.getElementById('readCount').value, 10) || 1);

  const bookData = {
    title: document.getElementById('bookTitle').value.trim(),
    author: document.getElementById('bookAuthor').value.trim(),
    ...readAuthorInfoFromForm(),
    category: document.getElementById('bookCategory').value.trim(),
    publisher: document.getElementById('bookPublisher').value.trim(),
    tags: [...formTags],
    status,
    readCount,
    adaptation: document.getElementById('adaptation').value.trim(),
    authorBio: document.getElementById('authorBio').value.trim(),
    extendedReading: document.getElementById('extendedReading').value.trim(),
    notes: document.getElementById('notes').value.trim(),
  };

  if (bookData.authorRegion === 'china' && !bookData.dynasty) {
    alert('选择「中国」时需填写朝代');
    return;
  }
  if (bookData.authorRegion === 'foreign') {
    if (!bookData.nationality) {
      alert('选择「外国」时需填写国籍');
      return;
    }
    if (!bookData.translator) {
      alert('选择「外国」时需填写译者');
      return;
    }
  }

  if (status === 'planned') {
    bookData.planType = document.getElementById('planType').value;
    bookData.planPeriod = readPlanPeriodValue();
  } else {
    bookData.readingRecords = readReadingRecordsFromForm();
    if (status === 'finished') {
      const incomplete = bookData.readingRecords.some(r => !r.endDate);
      if (incomplete) {
        alert('已读完的书籍需填写每一次阅读的读完日期');
        return;
      }
    }
    syncLegacyDatesFromRecords(bookData);
  }

  if (id) {
    const idx = books.findIndex(b => b.id === id);
    if (idx !== -1) {
      const prev = books[idx];
      const planGroupChanged = prev.status === 'planned'
        && bookData.status === 'planned'
        && getBookPlanGroup(prev) !== getBookPlanGroup({ ...prev, ...bookData });
      const statusChanged = prev.status !== bookData.status;

      if (bookData.status === 'planned') {
        bookData.readingRecords = prev.readingRecords || [];
      } else if (bookData.status !== 'planned' && prev.status === 'planned') {
        bookData.planType = prev.planType;
        bookData.planPeriod = prev.planPeriod;
      } else if (prev.status !== 'planned') {
        bookData.planType = prev.planType;
        bookData.planPeriod = prev.planPeriod;
      }

      books[idx] = { ...prev, ...bookData };
      syncLegacyDatesFromRecords(books[idx]);

      if (statusChanged) {
        books[idx].sortOrder = getNextSortOrder(
          bookData.status,
          bookData.status === 'planned' ? getBookPlanGroup(books[idx]) : null
        );
      } else if (planGroupChanged) {
        books[idx].sortOrder = getNextSortOrder('planned', getBookPlanGroup(books[idx]));
      }
    }
  } else {
    const newBook = {
      id: generateId(),
      ...bookData,
      createdAt: Date.now(),
      sortOrder: getNextSortOrder(
        bookData.status,
        bookData.status === 'planned' ? getBookPlanGroup(bookData) : null
      ),
    };
    if (bookData.status !== 'planned') {
      syncLegacyDatesFromRecords(newBook);
    } else {
      newBook.readingRecords = [];
    }
    books.push(newBook);
  }

  saveBooks();
  ReadingJournalStorage.autoBackupAfterSave();
  render();
  bookModal.close();
}

function handleFilterClick(e) {
  const el = e.target.closest('[data-filter]');
  if (!el) return;

  e.stopPropagation();
  const { filter, value } = el.dataset;
  if (filter && value) {
    setFilter(filter, value);
    detailModal.close();
  }
}

function handleRecordInput(e) {
  const item = e.target.closest('.reading-record-item');
  if (!item) return;

  if (e.target.classList.contains('record-format')) {
    toggleRecordPlatformSelect(item);
    return;
  }

  if (e.target.classList.contains('record-start') || e.target.classList.contains('record-end')) {
    const start = item.querySelector('.record-start').value;
    const end = item.querySelector('.record-end').value;
    const durationInput = item.querySelector('.record-duration');
    if (start && end && !durationInput.value.trim()) {
      const auto = calcDuration(start, end);
      if (auto) durationInput.placeholder = `自动计算：${auto}`;
    }
  }
}

document.getElementById('addBookBtn').addEventListener('click', () => openAddModal());
document.getElementById('closeModalBtn').addEventListener('click', () => bookModal.close());
document.getElementById('cancelBtn').addEventListener('click', () => bookModal.close());
document.getElementById('closeDetailBtn').addEventListener('click', () => detailModal.close());
document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
bookForm.addEventListener('submit', handleFormSubmit);

document.getElementById('bookStatus').addEventListener('change', toggleFormSections);
document.getElementById('authorRegion').addEventListener('change', toggleAuthorInfoFields);

ReadingJournalStorage.bindTagInputCommit(
  document.getElementById('tagInput'),
  document.getElementById('addTagBtn'),
  (value) => addFormTag(value),
);

document.getElementById('tagsChips').addEventListener('click', (e) => {
  const btn = e.target.closest('.tag-chip-remove');
  if (btn) {
    removeFormTag(btn.dataset.tag);
    return;
  }
  const chip = e.target.closest('.tag-chip');
  if (chip?.dataset.tag) {
    cycleTagColor(chip.dataset.tag);
    renderTagsChips();
  }
});

document.getElementById('tagColorPicker').addEventListener('click', (e) => {
  const dot = e.target.closest('.tag-color-dot');
  if (!dot) return;
  selectedTagColor = dot.dataset.color;
  renderTagColorPicker();
});

document.getElementById('readCount').addEventListener('change', () => {
  formReadingRecords = readReadingRecordsFromForm();
  renderReadingRecordsForm();
});
document.getElementById('planType').addEventListener('change', () => {
  renderPlanPeriodInput(document.getElementById('planType').value);
});
document.getElementById('readingRecordsList').addEventListener('input', handleRecordInput);
document.getElementById('readingRecordsList').addEventListener('change', handleRecordInput);

document.getElementById('finishedYearFilter').addEventListener('change', (e) => {
  finishedYearFilter = e.target.value;
  render();
});

document.getElementById('exportYearBtn').addEventListener('click', () => {
  if (!finishedYearFilter) {
    alert('请先在「已读完」栏选择要导出的年度');
    return;
  }
  const format = document.getElementById('exportFormat').value;
  exportYearBookList(finishedYearFilter, format);
});

document.getElementById('planTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.plan-tab');
  if (!tab) return;
  plannedPlanFilter = tab.dataset.planFilter;
  render();
});

FILTER_FIELDS.forEach(({ key, selectId }) => {
  document.getElementById(selectId).addEventListener('change', (e) => {
    filters[key] = e.target.value;
    render();
  });
});

document.getElementById('detailEditBtn').addEventListener('click', () => {
  detailModal.close();
  if (viewingBookId) openEditModal(viewingBookId);
});

document.getElementById('detailDeleteBtn').addEventListener('click', () => {
  if (viewingBookId) deleteBook(viewingBookId);
});

document.getElementById('detailBody').addEventListener('click', handleFilterClick);

document.querySelector('.board').addEventListener('click', (e) => {
  if (e.target.closest('.book-card-drag')) return;
  if (dragState.didDrag) return;

  if (e.target.closest('[data-filter]')) {
    handleFilterClick(e);
    return;
  }

  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    e.stopPropagation();
    const id = actionBtn.dataset.id;
    if (actionBtn.dataset.action === 'edit') openEditModal(id);
    return;
  }

  const card = e.target.closest('.book-card');
  if (card) openDetailModal(card.dataset.id);
});

document.querySelector('.board').addEventListener('dragstart', handleDragStart);
document.querySelector('.board').addEventListener('dragover', handleDragOver);
document.querySelector('.board').addEventListener('drop', handleDrop);
document.querySelector('.board').addEventListener('dragend', handleDragEnd);

loadBooks();
render();
