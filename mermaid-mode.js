// ============================================
// Mermaid Syntax Highlighting Mode for CodeMirror 5
// ============================================

CodeMirror.defineMode('mermaid', function() {
  const diagramTypes = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie|quadrantChart|gitGraph|mindmap|timeline|sankey|xychart-beta)\b/;
  const directions = /^(TB|TD|BT|RL|LR)\b/;
  const keywords = /^(subgraph|end|participant|actor|activate|deactivate|note|loop|alt|else|opt|par|and|rect|critical|break|over|left of|right of|class|style|linkStyle|click|callback|title|section|dateFormat|axisFormat|excludes|todayMarker|state|as|direction)\b/i;
  const arrows = /^(-->|---|\.->\.|===|==>|--x|--o|-\.-|-.->|-->>|->>|<<-->>|<-->|\|>|<\|)/;

  return {
    startState: function() {
      return { inString: false, stringChar: null };
    },
    token: function(stream, state) {
      // Handle strings
      if (state.inString) {
        while (!stream.eol()) {
          const ch = stream.next();
          if (ch === state.stringChar) {
            state.inString = false;
            state.stringChar = null;
            return 'string';
          }
        }
        return 'string';
      }

      // Skip whitespace
      if (stream.eatSpace()) return null;

      // Comments
      if (stream.match(/^%%/)) {
        stream.skipToEnd();
        return 'comment';
      }

      // Annotations/classes
      if (stream.match(/^:::/)) {
        stream.match(/\w+/);
        return 'attribute';
      }

      // Diagram types
      if (stream.match(diagramTypes)) {
        return 'keyword';
      }

      // Directions
      if (stream.match(directions)) {
        return 'atom';
      }

      // Keywords
      if (stream.match(keywords)) {
        return 'keyword';
      }

      // Arrows and connectors
      if (stream.match(arrows)) {
        return 'operator';
      }

      // Strings in quotes
      if (stream.match(/^["']/)) {
        state.inString = true;
        state.stringChar = stream.current();
        return 'string';
      }

      // Text in brackets (node labels)
      if (stream.match(/^\[[^\]]*\]/)) {
        return 'string-2';
      }
      // Text in braces (decision nodes)
      if (stream.match(/^\{[^\}]*\}/)) {
        return 'string-2';
      }
      // Text in parens (rounded nodes)
      if (stream.match(/^\([^\)]*\)/)) {
        return 'string-2';
      }

      // Pipe text |text|
      if (stream.match(/^\|[^|]*\|/)) {
        return 'string';
      }

      // Node IDs
      if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
        return 'variable';
      }

      // Numbers
      if (stream.match(/^\d+/)) {
        return 'number';
      }

      stream.next();
      return null;
    }
  };
});

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
