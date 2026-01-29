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
// Preview Module
// ============================================
const Preview = {
  container: null,
  renderCount: 0,
  currentTheme: 'dark',

  init(container) {
    this.container = container;
    this.setTheme('dark');
  },

  setTheme(theme) {
    this.currentTheme = theme;
    mermaid.initialize({
      startOnLoad: false,
      theme: theme,
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
  async svgToCanvas(svg, scale = 2) {
    return new Promise((resolve, reject) => {
      // Clone SVG to avoid modifying the original
      const clonedSvg = svg.cloneNode(true);

      // Get the bounding box of the SVG content
      const bbox = svg.getBBox();

      // Get computed dimensions or use bbox
      let width = bbox.width;
      let height = bbox.height;

      // Add minimal padding (5% of dimensions, min 20px)
      const paddingX = Math.max(20, width * 0.05);
      const paddingY = Math.max(20, height * 0.05);

      // Set viewBox to crop to content with padding
      const viewBox = `${bbox.x - paddingX} ${bbox.y - paddingY} ${width + paddingX * 2} ${height + paddingY * 2}`;
      clonedSvg.setAttribute('viewBox', viewBox);

      // Set explicit dimensions for the export
      const exportWidth = (width + paddingX * 2) * scale;
      const exportHeight = (height + paddingY * 2) * scale;
      clonedSvg.setAttribute('width', exportWidth);
      clonedSvg.setAttribute('height', exportHeight);

      // Ensure background is included in SVG
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bgRect.setAttribute('x', bbox.x - paddingX);
      bgRect.setAttribute('y', bbox.y - paddingY);
      bgRect.setAttribute('width', width + paddingX * 2);
      bgRect.setAttribute('height', height + paddingY * 2);
      bgRect.setAttribute('fill', App.getExportBackground());
      clonedSvg.insertBefore(bgRect, clonedSvg.firstChild);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const svgData = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        canvas.width = exportWidth;
        canvas.height = exportHeight;
        ctx.drawImage(img, 0, 0);
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
// Mermaid Help URLs
// ============================================
const MermaidHelpUrls = {
  graph: 'https://mermaid.js.org/syntax/flowchart.html',
  flowchart: 'https://mermaid.js.org/syntax/flowchart.html',
  sequenceDiagram: 'https://mermaid.js.org/syntax/sequenceDiagram.html',
  classDiagram: 'https://mermaid.js.org/syntax/classDiagram.html',
  stateDiagram: 'https://mermaid.js.org/syntax/stateDiagram.html',
  'stateDiagram-v2': 'https://mermaid.js.org/syntax/stateDiagram.html',
  erDiagram: 'https://mermaid.js.org/syntax/entityRelationshipDiagram.html',
  journey: 'https://mermaid.js.org/syntax/userJourney.html',
  gantt: 'https://mermaid.js.org/syntax/gantt.html',
  pie: 'https://mermaid.js.org/syntax/pie.html',
  quadrantChart: 'https://mermaid.js.org/syntax/quadrantChart.html',
  gitGraph: 'https://mermaid.js.org/syntax/gitgraph.html',
  mindmap: 'https://mermaid.js.org/syntax/mindmap.html',
  timeline: 'https://mermaid.js.org/syntax/timeline.html',
  sankey: 'https://mermaid.js.org/syntax/sankey.html',
  'xychart-beta': 'https://mermaid.js.org/syntax/xyChart.html',
  default: 'https://mermaid.js.org/syntax/flowchart.html'
};

function getDiagramType(code) {
  if (!code) return null;
  const match = code.trim().match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie|quadrantChart|gitGraph|mindmap|timeline|sankey|xychart-beta)\b/);
  return match ? match[1] : null;
}

function getMermaidHelpUrl(code) {
  const type = getDiagramType(code);
  return MermaidHelpUrls[type] || MermaidHelpUrls.default;
}

// ============================================
// Sidebar Module
// ============================================
const Sidebar = {
  diagramList: null,
  savepointList: null,
  savepointsExpanded: false,

  init() {
    this.diagramList = document.getElementById('diagramList');
    this.savepointList = document.getElementById('savepointList');
    this.initSavepointsToggle();
  },

  initSavepointsToggle() {
    const toggle = document.getElementById('savepointsToggle');
    const content = document.getElementById('savepointsContent');

    if (toggle && content) {
      toggle.addEventListener('click', () => {
        this.savepointsExpanded = !this.savepointsExpanded;
        toggle.classList.toggle('expanded', this.savepointsExpanded);
        content.classList.toggle('collapsed', !this.savepointsExpanded);
      });
    }
  },

  expandSavepoints() {
    const toggle = document.getElementById('savepointsToggle');
    const content = document.getElementById('savepointsContent');
    if (toggle && content && !this.savepointsExpanded) {
      this.savepointsExpanded = true;
      toggle.classList.add('expanded');
      content.classList.remove('collapsed');
    }
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

  renderSavepoints(savepoints = [], activeSavepointId = null) {
    if (savepoints.length === 0) {
      this.savepointList.innerHTML = '<li class="empty-state">No savepoints</li>';
      return;
    }

    const sorted = [...savepoints].sort((a, b) => b.createdAt - a.createdAt);

    this.savepointList.innerHTML = sorted.map(sp => `
      <li class="savepoint-item ${sp.id === activeSavepointId ? 'active' : ''}" data-id="${sp.id}">
        <span class="savepoint-name">${this.escapeHtml(sp.name)}</span>
        <span class="savepoint-date">${this.formatDate(sp.createdAt)}</span>
      </li>
    `).join('');

    // Auto-expand if there's an active savepoint being viewed
    if (activeSavepointId) {
      this.expandSavepoints();
    }
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
