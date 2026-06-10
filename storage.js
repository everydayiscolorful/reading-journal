const ReadingJournalStorage = (() => {
  const VERSION = 1;
  const KEYS = {
    books: 'readingJournalBooks',
    diaries: 'readingJournalDiaries',
    tagColors: 'readingJournalTagColors',
    settings: 'readingJournalSettings',
  };

  const IDB_NAME = 'readingJournalApp';
  const IDB_VERSION = 1;
  const IDB_STORE = 'handles';
  const DIR_HANDLE_KEY = 'backupDir';

  const AUTO_BACKUP_FILENAME = 'reading-journal-auto-backup.json';
  const JSON_FILE_TYPES = [{
    description: 'JSON 文件',
    accept: { 'application/json': ['.json'] },
  }];

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

  function readSettings() {
    return readJson(KEYS.settings, { autoBackupEnabled: true, backupFolderName: '' });
  }

  function updateSettings(partial) {
    localStorage.setItem(KEYS.settings, JSON.stringify({ ...readSettings(), ...partial }));
  }

  function isAutoBackupEnabled() {
    return readSettings().autoBackupEnabled !== false;
  }

  function setAutoBackupEnabled(enabled) {
    updateSettings({ autoBackupEnabled: enabled });
  }

  function supportsFileSystemAccess() {
    return typeof window.showSaveFilePicker === 'function'
      && typeof window.showDirectoryPicker === 'function';
  }

  function openIdb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveDirectoryHandle(handle) {
    const db = await openIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(handle, DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function getDirectoryHandle() {
    try {
      const db = await openIdb();
      const handle = await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const request = tx.objectStore(IDB_STORE).get(DIR_HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return handle || null;
    } catch {
      return null;
    }
  }

  async function clearDirectoryHandle() {
    try {
      const db = await openIdb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(DIR_HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Ignore IndexedDB cleanup errors.
    }
    updateSettings({ backupFolderName: '' });
  }

  async function verifyDirPermission(handle, readWrite = true) {
    if (!handle) return false;
    const opts = { mode: readWrite ? 'readwrite' : 'read' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    if ((await handle.requestPermission(opts)) === 'granted') return true;
    return false;
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

  function payloadToJson(payload) {
    return JSON.stringify(payload, null, 2);
  }

  function downloadJson(payload, filename) {
    const blob = new Blob([payloadToJson(payload)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function writeJsonToDirectory(dirHandle, filename, json) {
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
  }

  async function getWritableDirectoryHandle() {
    const dirHandle = await getDirectoryHandle();
    if (!dirHandle) return null;
    if (!(await verifyDirPermission(dirHandle))) return null;
    return dirHandle;
  }

  async function saveJsonWithPicker(filename, json) {
    const dirHandle = await getWritableDirectoryHandle();
    const pickerOptions = {
      suggestedName: filename,
      types: JSON_FILE_TYPES,
    };
    if (dirHandle) pickerOptions.startIn = dirHandle;

    const fileHandle = await window.showSaveFilePicker(pickerOptions);
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
  }

  async function autoBackupAfterSave() {
    if (!isAutoBackupEnabled()) return;

    const payload = buildExportPayload();
    const json = payloadToJson(payload);

    if (supportsFileSystemAccess()) {
      try {
        const dirHandle = await getWritableDirectoryHandle();
        if (dirHandle) {
          await writeJsonToDirectory(dirHandle, AUTO_BACKUP_FILENAME, json);
          return;
        }
      } catch (error) {
        console.warn('Auto backup to selected folder failed:', error);
      }
    }

    downloadJson(payload, AUTO_BACKUP_FILENAME);
  }

  async function exportAll() {
    const payload = buildExportPayload();
    const json = payloadToJson(payload);
    const filename = `reading-journal-export-${formatTimestamp()}.json`;

    if (supportsFileSystemAccess()) {
      try {
        await saveJsonWithPicker(filename, json);
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.warn('Export with file picker failed:', error);
      }
    }

    downloadJson(payload, filename);
  }

  async function chooseBackupFolder() {
    if (!supportsFileSystemAccess()) {
      alert('当前浏览器不支持选择文件夹，将使用浏览器默认下载位置。建议使用 Chrome 或 Edge。');
      return;
    }

    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      if (!(await verifyDirPermission(dirHandle))) {
        alert('未获得文件夹写入权限，无法保存到所选位置。');
        return;
      }
      await saveDirectoryHandle(dirHandle);
      updateSettings({ backupFolderName: dirHandle.name });
      updateBackupFolderUI();
    } catch (error) {
      if (error.name !== 'AbortError') {
        alert('选择文件夹失败，请重试。');
      }
    }
  }

  async function resetBackupFolder() {
    await clearDirectoryHandle();
    updateBackupFolderUI();
  }

  function updateBackupFolderUI() {
    const chooseBtn = document.getElementById('chooseBackupFolderBtn');
    const clearBtn = document.getElementById('clearBackupFolderBtn');
    const folderName = readSettings().backupFolderName;

    if (clearBtn) {
      clearBtn.hidden = !folderName;
    }
    if (chooseBtn && !supportsFileSystemAccess()) {
      chooseBtn.title = '当前浏览器不支持，将使用浏览器下载文件夹';
    }
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
    const autoBackupToggle = document.getElementById('autoBackupToggle');
    const chooseBackupFolderBtn = document.getElementById('chooseBackupFolderBtn');
    const clearBackupFolderBtn = document.getElementById('clearBackupFolderBtn');

    if (autoBackupToggle) {
      autoBackupToggle.checked = isAutoBackupEnabled();
      autoBackupToggle.addEventListener('change', (event) => {
        setAutoBackupEnabled(event.target.checked);
      });
    }

    exportBtn?.addEventListener('click', () => {
      exportAll().catch(() => {
        alert('导出失败，请重试。');
      });
    });

    chooseBackupFolderBtn?.addEventListener('click', () => {
      chooseBackupFolder().catch(() => {
        alert('选择文件夹失败，请重试。');
      });
    });

    clearBackupFolderBtn?.addEventListener('click', () => {
      resetBackupFolder().catch(() => {
        alert('重置保存位置失败，请重试。');
      });
    });

    updateBackupFolderUI();

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
    autoBackupAfterSave,
    exportAll,
    importAll,
    readAllData,
  };
})();
