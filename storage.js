const ReadingJournalStorage = (() => {
  const VERSION = 1;
  const KEYS = {
    books: 'readingJournalBooks',
    diaries: 'readingJournalDiaries',
    tagColors: 'readingJournalTagColors',
  };

  const AUTO_BACKUP_MIN_INTERVAL_MS = 3000;
  let lastAutoBackupAt = 0;
  let pendingImportPayload = null;

  function readJson(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  function readAllData() {
    return {
      books: readJson(KEYS.books, []),
      diaries: readJson(KEYS.diaries, []),
      tagColors: readJson(KEYS.tagColors, {}),
    };
  }

  function writeAllData({ books, diaries, tagColors }) {
    localStorage.setItem(KEYS.books, JSON.stringify(books));
    localStorage.setItem(KEYS.diaries, JSON.stringify(diaries));
    localStorage.setItem(KEYS.tagColors, JSON.stringify(tagColors));
  }

  function buildExportPayload() {
    const data = readAllData();
    return {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      source: 'reading-journal',
      books: data.books,
      diaries: data.diaries,
      tagColors: data.tagColors,
    };
  }

  function formatTimestamp(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  }

  function downloadJson(payload, filename) {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function autoBackupBeforeSave({ force = false } = {}) {
    const now = Date.now();
    if (!force && now - lastAutoBackupAt < AUTO_BACKUP_MIN_INTERVAL_MS) return;
    lastAutoBackupAt = now;
    downloadJson(
      buildExportPayload(),
      `reading-journal-auto-backup-${formatTimestamp()}.json`,
    );
  }

  function exportAll() {
    downloadJson(
      buildExportPayload(),
      `reading-journal-export-${formatTimestamp()}.json`,
    );
  }

  function validateImportPayload(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.books) || !Array.isArray(data.diaries)) return false;
    if (data.tagColors != null && typeof data.tagColors !== 'object') return false;
    return true;
  }

  function mergeById(localItems, importedItems) {
    const map = new Map();
    localItems.forEach(item => {
      if (item && item.id) map.set(item.id, item);
    });
    importedItems.forEach(item => {
      if (item && item.id) map.set(item.id, item);
    });
    return Array.from(map.values());
  }

  function importAll(payload, mode) {
    if (!validateImportPayload(payload)) {
      throw new Error('无效的备份文件格式');
    }

    const imported = {
      books: payload.books,
      diaries: payload.diaries,
      tagColors: payload.tagColors || {},
    };
    const current = readAllData();

    if (mode === 'replace') {
      writeAllData(imported);
      return;
    }

    if (mode === 'merge') {
      writeAllData({
        books: mergeById(current.books, imported.books),
        diaries: mergeById(current.diaries, imported.diaries),
        tagColors: { ...current.tagColors, ...imported.tagColors },
      });
      return;
    }

    throw new Error('未知的导入模式');
  }

  function describeImportPayload(payload) {
    const bookCount = payload.books?.length ?? 0;
    const diaryCount = payload.diaries?.length ?? 0;
    const tagCount = Object.keys(payload.tagColors || {}).length;
    const exportedAt = payload.exportedAt
      ? new Date(payload.exportedAt).toLocaleString('zh-CN')
      : '未知时间';
    return { bookCount, diaryCount, tagCount, exportedAt };
  }

  function initUI() {
    const exportBtn = document.getElementById('exportAllBtn');
    const importInput = document.getElementById('importAllInput');
    const importModal = document.getElementById('importModal');
    const importSummary = document.getElementById('importSummary');
    const importReplaceBtn = document.getElementById('importReplaceBtn');
    const importMergeBtn = document.getElementById('importMergeBtn');

    exportBtn?.addEventListener('click', exportAll);

    importInput?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      try {
        const payload = JSON.parse(await file.text());
        if (!validateImportPayload(payload)) {
          alert('无法识别该文件。请确认是「导出全部」生成的 JSON 备份。');
          return;
        }

        pendingImportPayload = payload;
        const summary = describeImportPayload(payload);
        if (importSummary) {
          importSummary.textContent =
            `备份时间：${summary.exportedAt} · ${summary.bookCount} 本书 · ${summary.diaryCount} 篇日记 · ${summary.tagCount} 个标签颜色`;
        }
        importModal?.showModal();
      } catch {
        alert('读取文件失败，请确认文件格式正确。');
      }
    });

    importReplaceBtn?.addEventListener('click', () => {
      if (!pendingImportPayload) return;
      if (!confirm('覆盖将替换当前浏览器中的全部数据，此操作不可撤销。确定继续？')) return;

      try {
        importAll(pendingImportPayload, 'replace');
        pendingImportPayload = null;
        importModal?.close();
        location.reload();
      } catch (error) {
        alert(error.message || '导入失败');
      }
    });

    importMergeBtn?.addEventListener('click', () => {
      if (!pendingImportPayload) return;

      try {
        importAll(pendingImportPayload, 'merge');
        pendingImportPayload = null;
        importModal?.close();
        location.reload();
      } catch (error) {
        alert(error.message || '导入失败');
      }
    });

    document.querySelectorAll('[data-close-import]').forEach(btn => {
      btn.addEventListener('click', () => {
        pendingImportPayload = null;
        importModal?.close();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }

  return {
    KEYS,
    autoBackupBeforeSave,
    exportAll,
    importAll,
    readAllData,
  };
})();
