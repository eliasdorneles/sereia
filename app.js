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
// Utility Functions
// ============================================
function generateUUID() {
  // Use native crypto.randomUUID if available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator for compatibility
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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
  isSharedDiagram: false,
  lastSaveTime: null,
  saveStatusInterval: null,

  async init() {
    await Storage.init();

    // Load saved theme and apply CSS class early
    const savedTheme = localStorage.getItem('sereia-theme') || 'default';
    this.currentTheme = savedTheme;
    this.applyThemeClass(savedTheme);

    Sidebar.init();
    Editor.init(document.getElementById('editor'), code => this.onEditorChange(code));
    Preview.init(document.getElementById('preview'));
    Toast.init();

    // Now apply full theme (including module themes)
    this.setTheme(savedTheme);

    this.bindEvents();

    // Check for shared diagram in URL before loading from storage
    const sharedData = ShareLink.loadFromUrl();
    if (sharedData) {
      try {
        await this.loadSharedDiagram(sharedData);
      } catch (error) {
        console.error('Failed to load shared diagram:', error);
        this.showNotification('Invalid or corrupted share link', 'error');
        await this.loadDiagrams();
      }
    } else {
      await this.loadDiagrams();
    }

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

    // Copy link button
    document.getElementById('copyLinkBtn').addEventListener('click', () => this.copyShareableLink());

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
    try {
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
    } catch (error) {
      console.error('Error loading diagrams:', error);
      this.showNotification('Error loading diagrams. Creating new workspace.', 'error');

      // Try to create a fresh default diagram
      try {
        const defaultDiagram = this.createDefaultDiagram();
        this.currentDiagram = defaultDiagram;
        Editor.setValue(defaultDiagram.code);
        await Preview.render(defaultDiagram.code);
        this.updateMermaidHelpLink(defaultDiagram.code);
        Sidebar.renderDiagrams({}, null);
        Sidebar.renderSavepoints([]);
      } catch (fallbackError) {
        console.error('Critical error creating default diagram:', fallbackError);
        this.showNotification('Critical error. Please refresh the page.', 'error');
      }
    }
  },

  async loadSharedDiagram(sharedData) {
    // Create temporary diagram (not saved to storage)
    const diagram = {
      id: null,
      name: sharedData.name,
      code: sharedData.code,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      savepoints: []
    };

    this.currentDiagram = diagram;
    this.isSharedDiagram = true;

    Editor.setValue(diagram.code);
    await Preview.render(diagram.code);
    this.updateMermaidHelpLink(diagram.code);

    // Load existing diagrams but don't select any
    const diagrams = await Storage.getDiagrams();
    Sidebar.renderDiagrams(diagrams, null);
    Sidebar.renderSavepoints([]);

    this.updateSaveStatus('shared');
    this.showNotification(`Viewing shared: "${diagram.name}". Edit freely or save to keep it.`, 'info');

    Editor.focus();
  },

  createDefaultDiagram() {
    return {
      id: generateUUID(),
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
    // Clear shared diagram state when creating new diagram
    this.isSharedDiagram = false;

    const diagram = {
      id: generateUUID(),
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

    // Clear shared diagram state when selecting a saved diagram
    this.isSharedDiagram = false;

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

    // Handle shared diagrams - save with collision handling on first edit
    if (this.isSharedDiagram) {
      if (this.currentDiagram) {
        this.currentDiagram.code = code;
        this.currentDiagram.updatedAt = Date.now();
      }
      // Auto-save shared diagram with collision handling
      clearTimeout(this.saveTimeout);
      this.updateSaveStatus('saving');
      this.saveTimeout = setTimeout(() => {
        this.saveSharedDiagram(code);
      }, 500);
      return;
    }

    // Debounced autosave for regular diagrams
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

  async generateUniqueName(baseName) {
    const diagrams = await Storage.getDiagrams();
    const existingNames = Object.values(diagrams).map(d => d.name);

    // If name doesn't exist, return it as-is
    if (!existingNames.includes(baseName)) {
      return baseName;
    }

    // Find next available version number
    let version = 1;
    let uniqueName;
    do {
      const versionSuffix = `-v${String(version).padStart(2, '0')}`;
      uniqueName = `${baseName}${versionSuffix}`;
      version++;
    } while (existingNames.includes(uniqueName));

    return uniqueName;
  },

  async saveSharedDiagram(code) {
    if (!this.currentDiagram) return;

    // Generate unique name to handle collisions
    const originalName = this.currentDiagram.name;
    const uniqueName = await this.generateUniqueName(originalName);

    // Convert shared diagram to a saved diagram
    this.currentDiagram.id = generateUUID();
    this.currentDiagram.name = uniqueName;
    this.currentDiagram.code = code;
    this.currentDiagram.updatedAt = Date.now();
    this.currentDiagram.createdAt = Date.now();

    // Save to storage
    await Storage.saveDiagram(this.currentDiagram);
    await Storage.setActiveDiagram(this.currentDiagram.id);

    // Clear shared state - it's now a regular diagram
    this.isSharedDiagram = false;

    // Update UI
    const diagrams = await Storage.getDiagrams();
    Sidebar.renderDiagrams(diagrams, this.currentDiagram.id);
    this.updateSaveStatus('saved');

    // Show notification if name was changed due to collision
    if (uniqueName !== originalName) {
      this.showNotification(`Saved as "${uniqueName}" to avoid name collision`, 'info');
    } else {
      this.showNotification(`Shared diagram saved as "${uniqueName}"`, 'success');
    }
  },

  saveNow() {
    clearTimeout(this.saveTimeout);
    if (this.currentDiagram) {
      this.saveCurrentDiagram(Editor.getValue());
    }
  },

  async copyShareableLink() {
    if (!this.currentDiagram || !this.currentDiagram.code.trim()) {
      this.showNotification('No diagram to share', 'error');
      return;
    }

    try {
      await ShareLink.copyToClipboard(this.currentDiagram);
      this.showNotification('Link copied to clipboard!', 'success');
    } catch (error) {
      this.showNotification(error.message || 'Failed to copy link', 'error');
    }
  },

  updateSaveStatus(status) {
    const el = document.getElementById('saveStatus');

    // Clear any existing status classes
    el.classList.remove('saving', 'shared', 'error');
    el.style.color = '';

    if (status === 'saving') {
      el.textContent = 'Saving...';
      el.classList.add('saving');
      // Don't update lastSaveTime yet
    } else if (status === 'shared') {
      el.textContent = 'Shared (not saved)';
      el.classList.add('shared');
    } else if (status === 'unsaved-shared') {
      el.textContent = 'Edited (not saved)';
      el.classList.add('error');
    } else if (status === 'saved') {
      // Record the save time
      this.lastSaveTime = Date.now();
      this.updateSaveTimestamp();
      this.startSaveTimestampInterval();
    }
  },

  updateSaveTimestamp() {
    const el = document.getElementById('saveStatus');
    if (!this.lastSaveTime) {
      el.textContent = 'Saved';
      return;
    }

    const secondsAgo = Math.floor((Date.now() - this.lastSaveTime) / 1000);
    el.textContent = `Saved ${this.formatTimeAgo(secondsAgo)}`;
  },

  formatTimeAgo(seconds) {
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  },

  startSaveTimestampInterval() {
    // Clear existing interval if any
    if (this.saveStatusInterval) {
      clearInterval(this.saveStatusInterval);
    }

    // Update timestamp every 5 seconds
    this.saveStatusInterval = setInterval(() => {
      if (this.lastSaveTime) {
        this.updateSaveTimestamp();
      }
    }, 5000);
  },

  stopSaveTimestampInterval() {
    if (this.saveStatusInterval) {
      clearInterval(this.saveStatusInterval);
      this.saveStatusInterval = null;
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
      id: generateUUID(),
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

    // Stop updating timestamp while viewing savepoint
    this.stopSaveTimestampInterval();

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

    // Resume timestamp updates
    this.startSaveTimestampInterval();

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
    // Use toast notification system for prominent, non-intrusive notifications
    Toast.show({
      type: type,
      title: message,
      duration: 3000
    });
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
      forest: '#2b2d28',
      neutral: '#f5f5f5'
    };
    return backgrounds[this.currentTheme] || '#1a1a2e';
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());
