// ============================================
// Editor Module (CodeMirror 5)
// Depends on: mermaid-mode.js (for CodeMirror mermaid mode)
// ============================================
const Editor = {
  instance: null,
  onChange: null,

  init(container, onChange) {
    this.onChange = onChange;
    this.instance = CodeMirror(container, {
      value: '',
      mode: 'mermaid',
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
      if (!this.instance.getOption('readOnly')) {
        onChange(this.instance.getValue());
      }
    });
  },

  getValue() {
    return this.instance.getValue();
  },

  setValue(code) {
    this.instance.setValue(code);
  },

  setReadOnly(readOnly) {
    if (this.instance) {
      this.instance.setOption('readOnly', readOnly);
    }
  },

  setTheme(theme) {
    if (this.instance) {
      this.instance.setOption('theme', theme);
    }
  },

  focus() {
    this.instance.focus();
  }
};

// ============================================
// Main Application
// Depends on: modules.js (Storage, Preview, Export, Sidebar, Modal, MermaidHelpUrls)
// ============================================
const App = {
  currentDiagram: null,
  saveTimeout: null,
  renderTimeout: null,
  currentSavepoint: null,
  viewingSavepoint: false,
  currentTheme: 'default',

  async init() {
    await Storage.init();

    // Load saved theme and apply CSS class early
    const savedTheme = localStorage.getItem('sereia-theme') || 'default';
    this.currentTheme = savedTheme;
    this.applyThemeClass(savedTheme);

    Sidebar.init();
    Editor.init(document.getElementById('editor'), code => this.onEditorChange(code));
    Preview.init(document.getElementById('preview'));

    // Now apply full theme (including module themes)
    this.setTheme(savedTheme);

    this.bindEvents();
    await this.loadDiagrams();

    // Initialize resizer
    this.initResizer();
  },

  applyThemeClass(theme) {
    document.body.className = '';
    if (theme === 'default') {
      document.body.classList.add('theme-light');
    } else if (theme === 'forest') {
      document.body.classList.add('theme-forest');
    } else if (theme === 'neutral') {
      document.body.classList.add('theme-neutral');
    }
  },

  bindEvents() {
    // Theme selector
    document.getElementById('themeSelect').addEventListener('change', e => {
      this.setTheme(e.target.value);
    });

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
      this.showSavepointForm();
    });

    // Savepoint list clicks
    document.getElementById('savepointList').addEventListener('click', e => {
      const item = e.target.closest('.savepoint-item');
      if (item) {
        this.viewSavepoint(item.dataset.id);
      }
    });

    // Savepoint bar actions
    document.getElementById('savepointRevertBtn').addEventListener('click', () => this.revertToSavepoint());
    document.getElementById('savepointDeleteBtn').addEventListener('click', () => this.deleteSavepoint());
    document.getElementById('savepointExitBtn').addEventListener('click', () => this.exitSavepointView());

    // Export buttons
    document.getElementById('copyBtn').addEventListener('click', () => Export.copyToClipboard());
    document.getElementById('exportPngBtn').addEventListener('click', () => {
      if (this.currentDiagram) Export.exportPng(this.currentDiagram.name);
    });
    document.getElementById('exportSvgBtn').addEventListener('click', () => {
      if (this.currentDiagram) Export.exportSvg(this.currentDiagram.name);
    });

    // Inline savepoint form
    document.getElementById('confirmCreateSavepointInline').addEventListener('click', () => this.createSavepoint());
    document.getElementById('cancelCreateSavepointInline').addEventListener('click', () => this.hideSavepointForm());
    document.getElementById('savepointNameInline').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.createSavepoint();
      if (e.key === 'Escape') this.hideSavepointForm();
    });

    // Delete modal
    document.getElementById('confirmDelete').addEventListener('click', () => this.deleteDiagram());
    document.getElementById('cancelDelete').addEventListener('click', () => Modal.close('deleteModal'));

    // About modal
    document.getElementById('aboutBtn').addEventListener('click', () => Modal.open('aboutModal'));
    document.getElementById('closeAbout').addEventListener('click', () => Modal.close('aboutModal'));

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
      if (e.key === 'Escape') {
        if (this.viewingSavepoint) {
          this.exitSavepointView();
        } else {
          Modal.closeAll();
        }
      }
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
    if (this.currentDiagram && this.currentDiagram.id === id && !this.viewingSavepoint) return;

    // Exit savepoint view if active
    if (this.viewingSavepoint) {
      this.hideSavepointBar();
      Editor.setReadOnly(false);
      this.viewingSavepoint = false;
      this.currentSavepoint = null;
    }

    const diagram = await Storage.getDiagram(id);
    if (!diagram) return;

    this.currentDiagram = diagram;

    if (updateStorage) {
      await Storage.setActiveDiagram(id);
    }

    Editor.setValue(diagram.code);
    await Preview.render(diagram.code);
    this.updateMermaidHelpLink(diagram.code);

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
    // Don't auto-save when viewing a savepoint
    if (this.viewingSavepoint) return;

    // Update help link immediately when first line changes
    this.updateMermaidHelpLink(code);

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

  showSavepointForm() {
    if (this.currentDiagram && !this.viewingSavepoint) {
      document.getElementById('createSavepointBtn').classList.add('hidden');
      const form = document.getElementById('savepointForm');
      form.classList.remove('hidden');
      const input = document.getElementById('savepointNameInline');
      input.value = '';
      // Wait for CSS transition to start before focusing
      setTimeout(() => input.focus(), 50);
    }
  },

  hideSavepointForm() {
    document.getElementById('savepointForm').classList.add('hidden');
    document.getElementById('createSavepointBtn').classList.remove('hidden');
  },

  async createSavepoint() {
    const name = document.getElementById('savepointNameInline').value.trim();
    if (!name) {
      document.getElementById('savepointNameInline').focus();
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
    this.hideSavepointForm();

    // Expand savepoints section if collapsed
    const savepointsContent = document.getElementById('savepointsContent');
    if (savepointsContent.classList.contains('collapsed')) {
      Sidebar.expandSavepoints();
    }

    this.showNotification('Savepoint created!', 'success');
  },

  async viewSavepoint(savepointId) {
    if (!this.currentDiagram) return;

    const savepoint = this.currentDiagram.savepoints?.find(sp => sp.id === savepointId);
    if (!savepoint) return;

    this.currentSavepoint = savepoint;
    this.viewingSavepoint = true;

    // Show savepoint bar
    this.showSavepointBar(savepoint.name);

    // Load savepoint code as read-only
    Editor.setValue(savepoint.code);
    Editor.setReadOnly(true);
    await Preview.render(savepoint.code);
    this.updateMermaidHelpLink(savepoint.code);

    // Update savepoint list to show active
    Sidebar.renderSavepoints(this.currentDiagram.savepoints, savepointId);
  },

  exitSavepointView() {
    if (!this.viewingSavepoint || !this.currentDiagram) return;

    this.viewingSavepoint = false;
    this.currentSavepoint = null;

    // Hide savepoint bar
    this.hideSavepointBar();

    // Restore current diagram code
    Editor.setValue(this.currentDiagram.code);
    Editor.setReadOnly(false);
    Preview.render(this.currentDiagram.code);
    this.updateMermaidHelpLink(this.currentDiagram.code);

    // Update savepoint list
    Sidebar.renderSavepoints(this.currentDiagram.savepoints);

    Editor.focus();
  },

  showSavepointBar(name) {
    const bar = document.getElementById('savepointBar');
    document.getElementById('savepointBarName').textContent = name;
    bar.classList.remove('hidden');
  },

  hideSavepointBar() {
    document.getElementById('savepointBar').classList.add('hidden');
  },

  async revertToSavepoint() {
    if (!this.currentDiagram || !this.currentSavepoint) return;

    const code = this.currentSavepoint.code;

    // Update diagram
    this.currentDiagram.code = code;
    this.currentDiagram.updatedAt = Date.now();
    await Storage.saveDiagram(this.currentDiagram);

    // Exit savepoint view but keep the reverted code
    this.viewingSavepoint = false;
    this.currentSavepoint = null;
    this.hideSavepointBar();

    Editor.setReadOnly(false);
    Sidebar.renderSavepoints(this.currentDiagram.savepoints);

    this.showNotification('Reverted to savepoint!', 'success');
    Editor.focus();
  },

  async deleteSavepoint() {
    if (!this.currentDiagram || !this.currentSavepoint) return;

    const savepointId = this.currentSavepoint.id;

    this.currentDiagram.savepoints = this.currentDiagram.savepoints.filter(
      sp => sp.id !== savepointId
    );
    await Storage.saveDiagram(this.currentDiagram);

    // Exit savepoint view
    this.exitSavepointView();

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
  },

  updateMermaidHelpLink(code) {
    const link = document.getElementById('mermaidHelpLink');
    if (link) {
      const url = getMermaidHelpUrl(code);
      link.href = url;

      // Update the tooltip to show the diagram type
      const type = getDiagramType(code);
      if (type) {
        link.title = `${type} Documentation`;
      } else {
        link.title = 'Mermaid Documentation';
      }
    }
  },

  setTheme(theme) {
    this.currentTheme = theme;
    localStorage.setItem('sereia-theme', theme);

    // Update theme selector
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.value = theme;
    }

    // Update body class for CSS theme
    this.applyThemeClass(theme);

    // Update Mermaid theme
    if (Preview.container) {
      Preview.setTheme(theme);
    }

    // Update CodeMirror theme
    if (theme === 'default' || theme === 'neutral') {
      Editor.setTheme('default');
    } else {
      Editor.setTheme('material-darker');
    }

    // Re-render current diagram with new theme
    if (this.currentDiagram && Preview.container) {
      const code = this.viewingSavepoint && this.currentSavepoint
        ? this.currentSavepoint.code
        : this.currentDiagram.code;
      Preview.render(code);
    }
  },

  getExportBackground() {
    // Return appropriate background color based on theme
    const backgrounds = {
      dark: '#1a1a2e',
      default: '#ffffff',
      forest: '#1a2e1a',
      neutral: '#f5f5f5'
    };
    return backgrounds[this.currentTheme] || '#1a1a2e';
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
