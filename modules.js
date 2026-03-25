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
    this.setTheme('default');
  },

  setTheme(theme) {
    this.currentTheme = theme;

    // Ocean-inspired theme variables
    // Using system fonts to avoid CORS/canvas tainting issues on export
    const isLight = theme === 'default' || theme === 'neutral';

    const themeVariables = {
      primaryColor: '#00d4aa',
      primaryTextColor: isLight ? '#1a3a4a' : '#e8f4f8',
      primaryBorderColor: '#00a896',
      lineColor: '#5de0c6',
      secondaryColor: '#4ecdc4',
      tertiaryColor: '#ffd93d',
      background: theme === 'default' ? '#ffffff' : theme === 'neutral' ? '#f8f9fa' : theme === 'forest' ? '#1a2520' : '#0d1d34',
      mainBkg: theme === 'default' ? '#f8f2e8' : theme === 'neutral' ? '#eef1f3' : theme === 'forest' ? '#2a3a2f' : '#1a2f4d',
      secondBkg: theme === 'default' ? '#e8e2d0' : theme === 'neutral' ? '#dfe3e6' : theme === 'forest' ? '#1f2d25' : '#152842',
      textColor: isLight ? '#1a3a4a' : '#e8f4f8',
      fontSize: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',

      // Timeline section colors - lighter palette for light themes
      cScale0: isLight ? '#b3e5db' : '#075444',
      cScale1: isLight ? '#a8dcd4' : '#227973',
      cScale2: isLight ? '#ffe8a3' : '#bc9800',
      cScale3: isLight ? '#b3d9e8' : '#063b55',
      cScale4: isLight ? '#d4c5f9' : '#041154',
      cScale5: isLight ? '#e8c5f0' : '#190054',
      cScale6: isLight ? '#ffc5d9' : '#440055',
      cScale7: isLight ? '#c5f0d4' : '#044d3d',
      cScale8: isLight ? '#ffd4b3' : '#8a6d00',
      cScale9: isLight ? '#c5e0f0' : '#053d55',
      cScale10: isLight ? '#e8d4f9' : '#2a0854',
      cScale11: isLight ? '#f0d4c5' : '#54002a',

      // Timeline section text colors
      cScaleLabel0: isLight ? '#0d5a4a' : '#e8f4f8',
      cScaleLabel1: isLight ? '#0d5a4a' : '#e8f4f8',
      cScaleLabel2: isLight ? '#6b5000' : '#1a3a4a',
      cScaleLabel3: isLight ? '#0d3a4a' : '#e8f4f8',
      cScaleLabel4: isLight ? '#3d1f6b' : '#e8f4f8',
      cScaleLabel5: isLight ? '#4a0d3a' : '#e8f4f8',
      cScaleLabel6: isLight ? '#6b0d2a' : '#e8f4f8',
      cScaleLabel7: isLight ? '#0d4a2a' : '#e8f4f8',
      cScaleLabel8: isLight ? '#6b3d00' : '#e8f4f8',
      cScaleLabel9: isLight ? '#0d3a4a' : '#e8f4f8',
      cScaleLabel10: isLight ? '#3d1f6b' : '#e8f4f8',
      cScaleLabel11: isLight ? '#4a1f0d' : '#e8f4f8'
    };

    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: themeVariables,
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
      if (typeof PanZoom !== 'undefined') {
        PanZoom.onDiagramRendered();
      }
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

      // Serialize SVG and sanitize font references to prevent canvas tainting
      let svgData = new XMLSerializer().serializeToString(clonedSvg);
      // Replace all font-family declarations with simple sans-serif
      svgData = svgData.replace(/font-family:[^;}"']+/g, 'font-family:sans-serif');
      // Also replace font-family attributes if any
      svgData = svgData.replace(/font-family="[^"]*"/g, 'font-family="sans-serif"');

      // Use data URI instead of blob URL to avoid CORS issues
      const svgBase64 = btoa(unescape(encodeURIComponent(svgData)));
      const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;

      const img = new Image();

      img.onload = () => {
        canvas.width = exportWidth;
        canvas.height = exportHeight;
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };

      img.onerror = () => {
        reject(new Error('Failed to load SVG'));
      };

      img.src = dataUrl;
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
      // Use toBlob with proper error handling
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create blob from canvas'));
          }
        }, 'image/png');
      });

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      App.showNotification('Copied to clipboard!', 'success');
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
// ShareLink Module
// ============================================
const ShareLink = {
  MAX_URL_LENGTH: 50000,

  /**
   * Compress and encode diagram data for URL
   * @param {Object} data - { name: string, code: string }
   * @returns {string} Base64 URL-safe encoded compressed string
   */
  encode(data) {
    try {
      if (typeof LZString === 'undefined') {
        throw new Error('LZ-string library not loaded. Please refresh the page.');
      }
      const json = JSON.stringify(data);
      const compressed = LZString.compressToEncodedURIComponent(json);
      return compressed;
    } catch (error) {
      console.error('Failed to encode diagram:', error);
      throw new Error('Failed to create shareable link');
    }
  },

  /**
   * Decode and decompress diagram data from URL
   * @param {string} encoded - Encoded string from URL
   * @returns {Object} { name: string, code: string }
   */
  decode(encoded) {
    try {
      if (typeof LZString === 'undefined') {
        throw new Error('LZ-string library not loaded. Please refresh the page.');
      }
      const decompressed = LZString.decompressFromEncodedURIComponent(encoded);
      if (!decompressed) {
        throw new Error('Invalid or corrupted share link');
      }
      const data = JSON.parse(decompressed);

      // Validate structure
      if (!data.code || typeof data.code !== 'string') {
        throw new Error('Invalid diagram data in share link');
      }

      // Set default name if missing
      if (!data.name || typeof data.name !== 'string') {
        data.name = 'Shared Diagram';
      }

      return data;
    } catch (error) {
      console.error('Failed to decode diagram:', error);
      throw new Error('Invalid share link format');
    }
  },

  /**
   * Generate shareable URL for current diagram
   * @param {Object} diagram - Diagram object with name and code
   * @returns {string} Full shareable URL
   */
  generateUrl(diagram) {
    const data = {
      name: diagram.name || 'Untitled Diagram',
      code: diagram.code || ''
    };

    const encoded = this.encode(data);
    const url = `${window.location.origin}${window.location.pathname}#share=${encoded}`;

    // Check URL length
    if (url.length > this.MAX_URL_LENGTH) {
      throw new Error('Diagram is too large to share via URL (exceeds 50,000 characters)');
    }

    return url;
  },

  /**
   * Copy shareable link to clipboard
   * @param {Object} diagram - Diagram object
   * @returns {string} The generated URL
   */
  async copyToClipboard(diagram) {
    try {
      const url = this.generateUrl(diagram);
      await navigator.clipboard.writeText(url);
      return url;
    } catch (error) {
      console.error('Failed to copy link:', error);
      throw error;
    }
  },

  /**
   * Check if current URL contains a shared diagram
   * @returns {string|null} Encoded data from hash, or null
   */
  getSharedDataFromUrl() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#share=')) {
      return null;
    }
    return hash.substring(7); // Remove '#share='
  },

  /**
   * Load shared diagram from URL
   * @returns {Object|null} Decoded diagram data or null
   */
  loadFromUrl() {
    const encoded = this.getSharedDataFromUrl();
    if (!encoded) {
      return null;
    }

    try {
      return this.decode(encoded);
    } catch (error) {
      console.error('Error loading shared diagram:', error);
      return null;
    }
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

  // Split into lines and find first non-comment, non-empty line
  const lines = code.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    // Skip empty lines and comment lines (starting with %%)
    if (!trimmedLine || trimmedLine.startsWith('%%')) {
      continue;
    }
    // Try to match diagram type on this line
    const match = trimmedLine.match(/^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie|quadrantChart|gitGraph|mindmap|timeline|sankey|xychart-beta)\b/);
    if (match) {
      return match[1];
    }
    // If we hit a non-comment line that doesn't match, stop searching
    break;
  }

  return null;
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
    // Update savepoint count badge
    const countElement = document.getElementById('savepointCount');
    if (countElement) {
      countElement.textContent = `(${savepoints.length})`;
    }

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

// Toast Notification System
const Toast = {
  container: null,
  toastCounter: 0,

  init() {
    this.container = document.getElementById('toastContainer');
  },

  show(options = {}) {
    if (!this.container) this.init();

    const {
      type = 'info', // 'success', 'error', 'info'
      title = '',
      message = '',
      icon = '',
      duration = 4000,
      closeable = true
    } = options;

    // Auto-select icon based on type if not provided
    let toastIcon = icon;
    if (!toastIcon) {
      switch (type) {
        case 'success': toastIcon = '✓'; break;
        case 'error': toastIcon = '✕'; break;
        case 'info': toastIcon = 'ℹ'; break;
        default: toastIcon = '•';
      }
    }

    const toastId = `toast-${++this.toastCounter}`;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.id = toastId;

    toast.innerHTML = `
      <div class="toast-icon">${toastIcon}</div>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${this.escapeHtml(title)}</div>` : ''}
        ${message ? `<div class="toast-message">${this.escapeHtml(message)}</div>` : ''}
      </div>
      ${closeable ? '<button class="toast-close" aria-label="Close">×</button>' : ''}
    `;

    this.container.appendChild(toast);

    // Add close button handler if closeable
    if (closeable) {
      const closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', () => this.dismiss(toastId));
    }

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => this.dismiss(toastId), duration);
    }

    return toastId;
  },

  dismiss(toastId) {
    const toast = document.getElementById(toastId);
    if (!toast) return;

    toast.classList.add('toast-exit');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300); // Match animation duration
  },

  success(title, message = '', duration = 4000) {
    return this.show({ type: 'success', title, message, duration });
  },

  error(title, message = '', duration = 4000) {
    return this.show({ type: 'error', title, message, duration });
  },

  info(title, message = '', duration = 4000) {
    return this.show({ type: 'info', title, message, duration });
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// ============================================
// Template Gallery Module
// ============================================
const TemplateGallery = {
  templates: [
    {
      id: 'template-flowchart',
      name: 'Flowchart Example',
      description: 'Decision-making and process flows',
      icon: '📊',
      code: `%% Flowchart example - Decision making process
flowchart TD
    Start([Start Process]) --> Input[/Enter User Input/]
    Input --> Validate{Is Input Valid?}

    Validate -->|No| Error[Display Error Message]
    Error --> Input

    Validate -->|Yes| Process[Process Data]
    Process --> Check{Check Results}

    Check -->|Success| Success[✓ Operation Complete]
    Check -->|Retry| Process
    Check -->|Fail| Failure[✗ Operation Failed]

    Success --> End([End])
    Failure --> End

    %% Styling
    classDef successClass fill:#10b981,stroke:#059669,color:#fff
    classDef errorClass fill:#ef4444,stroke:#dc2626,color:#fff
    class Success successClass
    class Failure,Error errorClass`
    },
    {
      id: 'template-sequence',
      name: 'Sequence Diagram Example',
      description: 'API calls and interactions',
      icon: '🔄',
      code: `%% Sequence Diagram - API Communication
sequenceDiagram
    actor User
    participant Client
    participant API
    participant Database

    User->>Client: Click Submit Button
    activate Client
    Client->>API: POST /api/data
    activate API

    API->>API: Validate Request

    alt Valid Request
        API->>Database: INSERT data
        activate Database
        Database-->>API: Success Response
        deactivate Database
        API-->>Client: 201 Created
        Client-->>User: Show Success Message
    else Invalid Request
        API-->>Client: 400 Bad Request
        Client-->>User: Show Error Message
    end

    deactivate API
    deactivate Client`
    },
    {
      id: 'template-class',
      name: 'Class Diagram Example',
      description: 'Object-oriented design',
      icon: '🏗️',
      code: `%% Class Diagram - E-commerce System
classDiagram
    class User {
        -String id
        -String email
        -String name
        +login()
        +logout()
        +updateProfile()
    }

    class Order {
        -String orderId
        -Date createdAt
        -OrderStatus status
        -float total
        +calculateTotal()
        +updateStatus()
        +cancel()
    }

    class Product {
        -String productId
        -String name
        -float price
        -int stock
        +updateStock()
        +getPrice()
    }

    class Payment {
        -String paymentId
        -String method
        -String status
        +processPayment()
        +refund()
    }

    class PaymentMethod {
        <<interface>>
        +process()
    }

    class OrderStatus {
        <<enumeration>>
        PENDING
        CONFIRMED
        SHIPPED
        DELIVERED
    }

    User "1" --> "*" Order : places
    Order "1" --> "*" Product : contains
    Order "1" --> "1" Payment : has
    Payment --> PaymentMethod : uses
    Order --> OrderStatus : has status`
    },
    {
      id: 'template-state',
      name: 'State Diagram Example',
      description: 'State machines and transitions',
      icon: '🔀',
      code: `%% State Diagram - User Authentication States
stateDiagram-v2
    [*] --> LoggedOut

    LoggedOut --> Authenticating : Submit Credentials
    Authenticating --> LoggedIn : Valid Credentials
    Authenticating --> LoggedOut : Invalid Credentials

    LoggedIn --> Active : User Activity
    LoggedIn --> Idle : No Activity (5 min)

    Active --> Idle : No Activity (5 min)
    Idle --> Active : User Activity
    Idle --> SessionExpired : Timeout (30 min)

    LoggedIn --> LoggedOut : Logout
    SessionExpired --> LoggedOut : Session Cleared

    LoggedOut --> [*]

    note right of Authenticating
        Verify username and password
        Check account status
    end note

    note right of Idle
        Show inactivity warning
        Refresh token if needed
    end note`
    },
    {
      id: 'template-er',
      name: 'ER Diagram Example',
      description: 'Database relationships',
      icon: '🗄️',
      code: `%% Entity Relationship Diagram - Blog Database
erDiagram
    USER ||--o{ POST : creates
    USER ||--o{ COMMENT : writes
    POST ||--o{ COMMENT : has
    POST }o--o{ TAG : tagged-with
    POST }o--|| CATEGORY : belongs-to

    USER {
        uuid id PK
        string email UK
        string username
        string password_hash
        datetime created_at
        boolean is_active
    }

    POST {
        uuid id PK
        uuid author_id FK
        uuid category_id FK
        string title
        text content
        string slug UK
        datetime published_at
        int view_count
    }

    COMMENT {
        uuid id PK
        uuid post_id FK
        uuid user_id FK
        text content
        datetime created_at
        boolean is_approved
    }

    TAG {
        uuid id PK
        string name UK
        string slug UK
    }

    CATEGORY {
        uuid id PK
        string name
        string description
    }`
    },
    {
      id: 'template-timeline',
      name: 'Timeline Example',
      description: 'Project milestones and events',
      icon: '📅',
      code: `%% Timeline - Product Development Roadmap
timeline
    title Product Development Roadmap 2024

    section Q1 Planning
        January : Research Phase
               : Market Analysis
               : Competitor Study
        February : Design Sprint
                : User Interviews
                : Wireframes Complete
        March : Technical Planning
             : Architecture Design
             : Tech Stack Finalized

    section Q2 Development
        April : MVP Development
             : Core Features
             : Database Setup
        May : Feature Implementation
           : User Authentication
           : API Development
        June : Testing Phase
            : Unit Tests
            : Integration Tests

    section Q3 Launch
        July : Beta Release
            : User Feedback
            : Bug Fixes
        August : Marketing Campaign
              : Content Creation
              : Social Media Launch
        September : Public Launch 🚀
                 : Production Deploy
                 : Success Metrics`
    }
  ],

  getAll() {
    return this.templates;
  },

  getById(id) {
    return this.templates.find(t => t.id === id);
  },

  createDiagramFromTemplate(templateId) {
    const template = this.getById(templateId);
    if (!template) return null;

    const diagram = {
      id: generateUUID(),
      name: template.name,
      code: template.code,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      savepoints: []
    };

    return diagram;
  }
};

// ============================================
// PanZoom Module
// Adds mouse-wheel zoom and drag-to-pan to the preview container.
// ============================================
const PanZoom = {
  container: null,
  scale: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  lastMouseX: 0,
  lastMouseY: 0,
  MIN_SCALE: 0.1,
  MAX_SCALE: 10,
  ZOOM_FACTOR: 1.15,
  _boundMouseMove: null,
  _boundMouseUp: null,

  init(container) {
    this.container = container;
    this._boundMouseMove = this._onMouseMove.bind(this);
    this._boundMouseUp = this._onMouseUp.bind(this);
    this._bindEvents();
    this._updateZoomIndicator();
  },

  _getSvg() {
    return this.container ? this.container.querySelector('svg') : null;
  },

  _applyTransform() {
    const svg = this._getSvg();
    if (!svg) return;
    svg.style.transformOrigin = '0 0';
    svg.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    this._updateZoomIndicator();
  },

  _updateZoomIndicator() {
    const el = document.getElementById('zoomLevel');
    if (el) el.textContent = `${Math.round(this.scale * 100)}%`;
  },

  reset() {
    this.scale = 1;
    this.panX = 0;
    this.panY = 0;
    this._applyTransform();
  },

  zoomIn() {
    this._zoomAround(this.ZOOM_FACTOR);
  },

  zoomOut() {
    this._zoomAround(1 / this.ZOOM_FACTOR);
  },

  _zoomAround(factor, clientX, clientY) {
    const newScale = Math.min(this.MAX_SCALE, Math.max(this.MIN_SCALE, this.scale * factor));
    if (newScale === this.scale) return;

    const actualFactor = newScale / this.scale;

    // Determine the focal point in viewport coordinates.
    // Fall back to the container centre when no cursor position is given.
    let cx, cy;
    if (clientX !== undefined && clientY !== undefined) {
      cx = clientX;
      cy = clientY;
    } else {
      const rect = this.container.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
    }

    // Keep the point under the cursor fixed in viewport space.
    // With transform-origin:0 0 and transform:translate(panX,panY) scale(scale),
    // the SVG's visual left = svgNaturalLeft + panX, so:
    //   newPanX = panX + (cx - svgVisualLeft) * (1 - actualFactor)
    const svg = this._getSvg();
    if (svg) {
      const rect = svg.getBoundingClientRect();
      this.panX = this.panX + (cx - rect.left) * (1 - actualFactor);
      this.panY = this.panY + (cy - rect.top) * (1 - actualFactor);
    }

    this.scale = newScale;
    this._applyTransform();
  },

  // Called by Preview.render() after a new SVG is inserted into the container.
  onDiagramRendered() {
    this._applyTransform();
  },

  _bindEvents() {
    // Mouse-wheel zoom (prevent default page scroll)
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? this.ZOOM_FACTOR : 1 / this.ZOOM_FACTOR;
      this._zoomAround(factor, e.clientX, e.clientY);
    }, { passive: false });

    // Drag-to-pan (left mouse button only)
    this.container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      // Ignore clicks on buttons or links inside the container
      if (e.target.closest('button, a')) return;
      this.isPanning = true;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      this.container.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', this._boundMouseMove);
    document.addEventListener('mouseup', this._boundMouseUp);
  },

  _onMouseMove(e) {
    if (!this.isPanning) return;
    this.panX += e.clientX - this.lastMouseX;
    this.panY += e.clientY - this.lastMouseY;
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
    this._applyTransform();
  },

  _onMouseUp() {
    if (this.isPanning) {
      this.isPanning = false;
      // Restore grab cursor; setting to 'grab' is explicit and consistent with
      // the CSS cursor:grab on .preview-container.
      this.container.style.cursor = 'grab';
    }
  }
};
