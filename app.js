// CodeMirror 5 is loaded via script tag - uses global CodeMirror object

// ============================================
// Storage Module
// ============================================
const Storage = {
  STORE_KEY: 'sereia-data',

  async init() {
    const data = await localforage.getItem(this.STORE_KEY);
    if (!data) {
      await this.save({ diagrams: {}, activeDiagramId: null });
    }
    return this.load();
  },

  async load() {
    return await localforage.getItem(this.STORE_KEY);
  },

  async save(data) {
    await localforage.setItem(this.STORE_KEY, data);
  },

  async getDiagrams() {
    const data = await this.load();
    return data.diagrams;
  },

  async getDiagram(id) {
    const data = await this.load();
    return data.diagrams[id];
  },

  async saveDiagram(diagram) {
    const data = await this.load();
    data.diagrams[diagram.id] = diagram;
    await this.save(data);
  },

  async deleteDiagram(id) {
    const data = await this.load();
    delete data.diagrams[id];
    if (data.activeDiagramId === id) {
      const remaining = Object.keys(data.diagrams);
      data.activeDiagramId = remaining.length > 0 ? remaining[0] : null;
    }
    await this.save(data);
    return data.activeDiagramId;
  },

  async setActiveDiagram(id) {
    const data = await this.load();
    data.activeDiagramId = id;
    await this.save(data);
  },

  async getActiveDiagramId() {
    const data = await this.load();
    return data.activeDiagramId;
  }
};

// ============================================
// Mermaid Keywords for Autocompletion
// ============================================
const mermaidKeywords = [
  'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
  'erDiagram', 'journey', 'gantt', 'pie', 'quadrantChart', 'gitGraph',
  'mindmap', 'timeline', 'sankey', 'xychart',
  'TB', 'TD', 'BT', 'RL', 'LR',
  'subgraph', 'end',
  'participant', 'actor', 'activate', 'deactivate', 'note', 'loop', 'alt', 'else', 'opt', 'par', 'and', 'rect',
  'class', 'style', 'linkStyle', 'click',
  'title', 'section', 'dateFormat', 'axisFormat'
];

// Register Mermaid hint helper for CodeMirror 5
CodeMirror.registerHelper('hint', 'mermaid', function(editor) {
  const cur = editor.getCursor();
  const token = editor.getTokenAt(cur);
  const start = token.start;
  const end = cur.ch;
  const word = token.string.slice(0, end - start).toLowerCase();

  const list = mermaidKeywords.filter(kw =>
    kw.toLowerCase().startsWith(word)
  );

  if (list.length === 0) return null;

  return {
    list: list,
    from: CodeMirror.Pos(cur.line, start),
    to: CodeMirror.Pos(cur.line, end)
  };
});

// ============================================
// Editor Module (CodeMirror 5)
// ============================================
const Editor = {
  instance: null,

  init(container, onChange) {
    this.instance = CodeMirror(container, {
      value: '',
      theme: 'material-darker',
      lineNumbers: true,
      lineWrapping: true,
      matchBrackets: true,
      autoCloseBrackets: true,
      tabSize: 2,
      indentWithTabs: false,
      extraKeys: {
        'Ctrl-Space': 'autocomplete',
        'Tab': (cm) => cm.execCommand('indentMore'),
        'Shift-Tab': (cm) => cm.execCommand('indentLess')
      },
      hintOptions: {
        hint: CodeMirror.hint.mermaid,
        completeSingle: false
      }
    });

    this.instance.on('change', () => {
      onChange(this.instance.getValue());
    });
  },

  getValue() {
    return this.instance.getValue();
  },

  setValue(code) {
    this.instance.setValue(code);
  },

  focus() {
    this.instance.focus();
  }
};

// ============================================
// Preview Module
// ============================================
const Preview = {
  container: null,
  renderCount: 0,

  init(container) {
    this.container = container;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'loose',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });
  },

  async render(code) {
    if (!code || !code.trim()) {
      this.container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📊</div>Start typing to see your diagram</div>';
      return;
    }

    try {
      this.renderCount++;
      const id = `mermaid-${this.renderCount}`;
      const { svg } = await mermaid.render(id, code);
      this.container.innerHTML = svg;
    } catch (error) {
      this.container.innerHTML = `<div class="preview-error">${this.formatError(error)}</div>`;
    }
  },

  formatError(error) {
    let message = error.message || String(error);
    // Clean up mermaid error messages
    message = message.replace(/Syntax error in graph/i, 'Syntax error');
    return message;
  },

  getSvg() {
    return this.container.querySelector('svg');
  }
};

// ============================================
// Export Module
// ============================================
const Export = {
  async svgToCanvas(svg) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const svgData = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        // Add padding
        const padding = 40;
        canvas.width = img.width + padding * 2;
        canvas.height = img.height + padding * 2;

        // Fill background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw image
        ctx.drawImage(img, padding, padding);
        URL.revokeObjectURL(url);
        resolve(canvas);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load SVG'));
      };

      img.src = url;
    });
  },

  async copyToClipboard() {
    const svg = Preview.getSvg();
    if (!svg) {
      App.showNotification('No diagram to copy', 'error');
      return;
    }

    try {
      const canvas = await this.svgToCanvas(svg);
      canvas.toBlob(async blob => {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        App.showNotification('Copied to clipboard!', 'success');
      });
    } catch (error) {
      App.showNotification('Failed to copy: ' + error.message, 'error');
    }
  },

  async exportPng(filename) {
    const svg = Preview.getSvg();
    if (!svg) {
      App.showNotification('No diagram to export', 'error');
      return;
    }

    try {
      const canvas = await this.svgToCanvas(svg);
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      App.showNotification('PNG exported!', 'success');
    } catch (error) {
      App.showNotification('Failed to export: ' + error.message, 'error');
    }
  },

  exportSvg(filename) {
    const svg = Preview.getSvg();
    if (!svg) {
      App.showNotification('No diagram to export', 'error');
      return;
    }

    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.download = `${filename}.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    App.showNotification('SVG exported!', 'success');
  }
};

// ============================================
// Sidebar Module
// ============================================
const Sidebar = {
  diagramList: null,
  savepointList: null,

  init() {
    this.diagramList = document.getElementById('diagramList');
    this.savepointList = document.getElementById('savepointList');
  },

  renderDiagrams(diagrams, activeId) {
    const sorted = Object.values(diagrams).sort((a, b) => b.updatedAt - a.updatedAt);

    if (sorted.length === 0) {
      this.diagramList.innerHTML = '<li class="empty-state">No diagrams yet</li>';
      return;
    }

    this.diagramList.innerHTML = sorted.map(d => `
      <li class="diagram-item ${d.id === activeId ? 'active' : ''}" data-id="${d.id}">
        <span class="diagram-item-name" data-id="${d.id}">${this.escapeHtml(d.name)}</span>
        <div class="diagram-item-actions">
          <button class="diagram-item-btn rename" data-id="${d.id}" title="Rename">✏️</button>
          <button class="diagram-item-btn delete" data-id="${d.id}" title="Delete">🗑️</button>
        </div>
      </li>
    `).join('');
  },

  renderSavepoints(savepoints = []) {
    if (savepoints.length === 0) {
      this.savepointList.innerHTML = '<li class="empty-state">No savepoints</li>';
      return;
    }

    const sorted = [...savepoints].sort((a, b) => b.createdAt - a.createdAt);

    this.savepointList.innerHTML = sorted.map(sp => `
      <li class="savepoint-item" data-id="${sp.id}">
        <span class="savepoint-name">${this.escapeHtml(sp.name)}</span>
        <span class="savepoint-date">${this.formatDate(sp.createdAt)}</span>
      </li>
    `).join('');
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
};

// ============================================
// Modal Module
// ============================================
const Modal = {
  open(modalId) {
    document.getElementById(modalId).classList.add('open');
  },

  close(modalId) {
    document.getElementById(modalId).classList.remove('open');
  },

  closeAll() {
    document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
  }
};

// ============================================
// Main Application
// ============================================
const App = {
  currentDiagram: null,
  saveTimeout: null,
  renderTimeout: null,
  currentSavepoint: null,

  async init() {
    await Storage.init();

    Sidebar.init();
    Editor.init(document.getElementById('editor'), code => this.onEditorChange(code));
    Preview.init(document.getElementById('preview'));

    this.bindEvents();
    await this.loadDiagrams();

    // Initialize resizer
    this.initResizer();
  },

  bindEvents() {
    // New diagram button
    document.getElementById('newDiagramBtn').addEventListener('click', () => this.createDiagram());

    // Diagram list clicks
    document.getElementById('diagramList').addEventListener('click', e => {
      const item = e.target.closest('.diagram-item');
      const renameBtn = e.target.closest('.rename');
      const deleteBtn = e.target.closest('.delete');
      const nameEl = e.target.closest('.diagram-item-name');

      if (renameBtn) {
        this.startRename(renameBtn.dataset.id);
      } else if (deleteBtn) {
        this.confirmDelete(deleteBtn.dataset.id);
      } else if (nameEl && !nameEl.classList.contains('editing')) {
        this.selectDiagram(nameEl.dataset.id);
      } else if (item && !e.target.closest('.diagram-item-actions')) {
        this.selectDiagram(item.dataset.id);
      }
    });

    // Create savepoint button
    document.getElementById('createSavepointBtn').addEventListener('click', () => {
      if (this.currentDiagram) {
        Modal.open('createSavepointModal');
        document.getElementById('savepointName').value = '';
        document.getElementById('savepointName').focus();
      }
    });

    // Savepoint list clicks
    document.getElementById('savepointList').addEventListener('click', e => {
      const item = e.target.closest('.savepoint-item');
      if (item) {
        this.openSavepointModal(item.dataset.id);
      }
    });

    // Export buttons
    document.getElementById('copyBtn').addEventListener('click', () => Export.copyToClipboard());
    document.getElementById('exportPngBtn').addEventListener('click', () => {
      if (this.currentDiagram) Export.exportPng(this.currentDiagram.name);
    });
    document.getElementById('exportSvgBtn').addEventListener('click', () => {
      if (this.currentDiagram) Export.exportSvg(this.currentDiagram.name);
    });

    // Create savepoint modal
    document.getElementById('confirmCreateSavepoint').addEventListener('click', () => this.createSavepoint());
    document.getElementById('cancelCreateSavepoint').addEventListener('click', () => Modal.close('createSavepointModal'));
    document.getElementById('savepointName').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.createSavepoint();
      if (e.key === 'Escape') Modal.close('createSavepointModal');
    });

    // Savepoint modal actions
    document.getElementById('savepointViewCodeBtn').addEventListener('click', () => this.viewSavepointCode());
    document.getElementById('savepointRevertBtn').addEventListener('click', () => this.revertToSavepoint());
    document.getElementById('savepointDeleteBtn').addEventListener('click', () => this.deleteSavepoint());

    // Delete modal
    document.getElementById('confirmDelete').addEventListener('click', () => this.deleteDiagram());
    document.getElementById('cancelDelete').addEventListener('click', () => Modal.close('deleteModal'));

    // Close modals
    document.querySelectorAll('.modal-close, [data-close]').forEach(btn => {
      btn.addEventListener('click', () => Modal.closeAll());
    });

    // Close modal on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) Modal.closeAll();
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') Modal.closeAll();
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.saveNow();
      }
    });
  },

  initResizer() {
    const resizer = document.getElementById('resizer');
    const editorPane = document.querySelector('.pane-editor');
    const previewPane = document.querySelector('.pane-preview');
    let isResizing = false;

    resizer.addEventListener('mousedown', e => {
      isResizing = true;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
      if (!isResizing) return;

      const container = document.querySelector('.panes');
      const containerRect = container.getBoundingClientRect();
      const percentage = ((e.clientX - containerRect.left) / containerRect.width) * 100;

      if (percentage > 20 && percentage < 80) {
        editorPane.style.flex = `0 0 ${percentage}%`;
        previewPane.style.flex = `0 0 ${100 - percentage}%`;
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizer.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  },

  async loadDiagrams() {
    const diagrams = await Storage.getDiagrams();
    let activeId = await Storage.getActiveDiagramId();

    // Create default diagram if none exist
    if (Object.keys(diagrams).length === 0) {
      const defaultDiagram = this.createDefaultDiagram();
      await Storage.saveDiagram(defaultDiagram);
      await Storage.setActiveDiagram(defaultDiagram.id);
      activeId = defaultDiagram.id;
    }

    const updatedDiagrams = await Storage.getDiagrams();
    Sidebar.renderDiagrams(updatedDiagrams, activeId);

    if (activeId) {
      await this.selectDiagram(activeId, false);
    }
  },

  createDefaultDiagram() {
    return {
      id: crypto.randomUUID(),
      name: 'My First Diagram',
      code: `graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do Something]
    B -->|No| D[Do Something Else]
    C --> E[End]
    D --> E`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      savepoints: []
    };
  },

  async createDiagram() {
    const diagram = {
      id: crypto.randomUUID(),
      name: 'Untitled Diagram',
      code: `graph TD
    A[Start] --> B[End]`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      savepoints: []
    };

    await Storage.saveDiagram(diagram);
    await Storage.setActiveDiagram(diagram.id);

    const diagrams = await Storage.getDiagrams();
    Sidebar.renderDiagrams(diagrams, diagram.id);
    await this.selectDiagram(diagram.id, false);

    // Start rename immediately
    this.startRename(diagram.id);
  },

  async selectDiagram(id, updateStorage = true) {
    if (this.currentDiagram && this.currentDiagram.id === id) return;

    const diagram = await Storage.getDiagram(id);
    if (!diagram) return;

    this.currentDiagram = diagram;

    if (updateStorage) {
      await Storage.setActiveDiagram(id);
    }

    Editor.setValue(diagram.code);
    await Preview.render(diagram.code);

    Sidebar.renderSavepoints(diagram.savepoints);

    // Update active state in sidebar
    document.querySelectorAll('.diagram-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === id);
    });

    Editor.focus();
  },

  startRename(id) {
    const nameEl = document.querySelector(`.diagram-item-name[data-id="${id}"]`);
    if (!nameEl) return;

    nameEl.classList.add('editing');
    nameEl.contentEditable = true;
    nameEl.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(nameEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const finishRename = async () => {
      nameEl.classList.remove('editing');
      nameEl.contentEditable = false;

      const newName = nameEl.textContent.trim() || 'Untitled Diagram';
      const diagram = await Storage.getDiagram(id);
      if (diagram && diagram.name !== newName) {
        diagram.name = newName;
        diagram.updatedAt = Date.now();
        await Storage.saveDiagram(diagram);

        if (this.currentDiagram && this.currentDiagram.id === id) {
          this.currentDiagram = diagram;
        }
      }
      nameEl.textContent = newName;
    };

    nameEl.addEventListener('blur', finishRename, { once: true });
    nameEl.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        nameEl.blur();
      }
      if (e.key === 'Escape') {
        nameEl.textContent = this.currentDiagram?.name || 'Untitled';
        nameEl.blur();
      }
    });
  },

  confirmDelete(id) {
    this.pendingDeleteId = id;
    Storage.getDiagram(id).then(diagram => {
      document.getElementById('deleteDiagramName').textContent = diagram?.name || 'Untitled';
      Modal.open('deleteModal');
    });
  },

  async deleteDiagram() {
    if (!this.pendingDeleteId) return;

    const newActiveId = await Storage.deleteDiagram(this.pendingDeleteId);
    Modal.close('deleteModal');

    const diagrams = await Storage.getDiagrams();

    if (Object.keys(diagrams).length === 0) {
      // Create a new default diagram if all were deleted
      const defaultDiagram = this.createDefaultDiagram();
      await Storage.saveDiagram(defaultDiagram);
      await Storage.setActiveDiagram(defaultDiagram.id);
      const updatedDiagrams = await Storage.getDiagrams();
      Sidebar.renderDiagrams(updatedDiagrams, defaultDiagram.id);
      await this.selectDiagram(defaultDiagram.id, false);
    } else {
      Sidebar.renderDiagrams(diagrams, newActiveId);
      if (newActiveId) {
        await this.selectDiagram(newActiveId, false);
      }
    }

    this.pendingDeleteId = null;
  },

  onEditorChange(code) {
    // Debounced preview render
    clearTimeout(this.renderTimeout);
    this.renderTimeout = setTimeout(() => {
      Preview.render(code);
    }, 300);

    // Debounced autosave
    clearTimeout(this.saveTimeout);
    this.updateSaveStatus('saving');
    this.saveTimeout = setTimeout(() => {
      this.saveCurrentDiagram(code);
    }, 500);
  },

  async saveCurrentDiagram(code) {
    if (!this.currentDiagram) return;

    this.currentDiagram.code = code;
    this.currentDiagram.updatedAt = Date.now();
    await Storage.saveDiagram(this.currentDiagram);

    this.updateSaveStatus('saved');
  },

  saveNow() {
    clearTimeout(this.saveTimeout);
    if (this.currentDiagram) {
      this.saveCurrentDiagram(Editor.getValue());
    }
  },

  updateSaveStatus(status) {
    const el = document.getElementById('saveStatus');
    if (status === 'saving') {
      el.textContent = 'Saving...';
      el.classList.add('saving');
    } else {
      el.textContent = 'Saved';
      el.classList.remove('saving');
    }
  },

  async createSavepoint() {
    const name = document.getElementById('savepointName').value.trim();
    if (!name) {
      document.getElementById('savepointName').focus();
      return;
    }

    if (!this.currentDiagram) return;

    const savepoint = {
      id: crypto.randomUUID(),
      name: name,
      code: this.currentDiagram.code,
      createdAt: Date.now()
    };

    this.currentDiagram.savepoints = [...(this.currentDiagram.savepoints || []), savepoint];
    await Storage.saveDiagram(this.currentDiagram);

    Sidebar.renderSavepoints(this.currentDiagram.savepoints);
    Modal.close('createSavepointModal');
    this.showNotification('Savepoint created!', 'success');
  },

  async openSavepointModal(savepointId) {
    if (!this.currentDiagram) return;

    const savepoint = this.currentDiagram.savepoints?.find(sp => sp.id === savepointId);
    if (!savepoint) return;

    this.currentSavepoint = savepoint;

    document.getElementById('savepointModalTitle').textContent = savepoint.name;

    // Render preview
    const previewContainer = document.getElementById('savepointPreview');
    try {
      const { svg } = await mermaid.render(`sp-preview-${Date.now()}`, savepoint.code);
      previewContainer.innerHTML = svg;
    } catch (error) {
      previewContainer.innerHTML = `<div class="preview-error">${error.message}</div>`;
    }

    Modal.open('savepointModal');
  },

  viewSavepointCode() {
    if (!this.currentSavepoint) return;

    document.getElementById('viewCodeTitle').textContent = `Code: ${this.currentSavepoint.name}`;
    document.getElementById('viewCodeContent').textContent = this.currentSavepoint.code;

    Modal.close('savepointModal');
    Modal.open('viewCodeModal');
  },

  async revertToSavepoint() {
    if (!this.currentDiagram || !this.currentSavepoint) return;

    this.currentDiagram.code = this.currentSavepoint.code;
    this.currentDiagram.updatedAt = Date.now();
    await Storage.saveDiagram(this.currentDiagram);

    Editor.setValue(this.currentSavepoint.code);
    await Preview.render(this.currentSavepoint.code);

    Modal.close('savepointModal');
    this.showNotification('Reverted to savepoint!', 'success');
  },

  async deleteSavepoint() {
    if (!this.currentDiagram || !this.currentSavepoint) return;

    this.currentDiagram.savepoints = this.currentDiagram.savepoints.filter(
      sp => sp.id !== this.currentSavepoint.id
    );
    await Storage.saveDiagram(this.currentDiagram);

    Sidebar.renderSavepoints(this.currentDiagram.savepoints);
    Modal.close('savepointModal');
    this.currentSavepoint = null;
    this.showNotification('Savepoint deleted', 'success');
  },

  showNotification(message, type = 'info') {
    // Simple notification using save status area temporarily
    const el = document.getElementById('saveStatus');
    const originalText = el.textContent;
    const originalClass = el.classList.contains('saving');

    el.textContent = message;
    el.classList.remove('saving');

    setTimeout(() => {
      el.textContent = originalText;
      if (originalClass) el.classList.add('saving');
    }, 2000);
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
