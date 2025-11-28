import React, { useEffect, useRef, useState } from 'react';

interface PromQLQueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: string;
}

// Try to use Grafana's CodeEditor if available, otherwise use styled textarea
export const PromQLQueryEditor: React.FC<PromQLQueryEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter PromQL query...',
  height = '200px',
}) => {
  const [useGrafanaEditor, setUseGrafanaEditor] = useState(false);
  const grafanaEditorRef = useRef<any>(null);

  useEffect(() => {
    // Try to access Grafana's CodeEditor from @grafana/ui
    try {
      const grafanaUI = (window as any).__GRAFANA_UI__ || (window as any).require?.('@grafana/ui');
      if (grafanaUI?.CodeEditor) {
        setUseGrafanaEditor(true);
        grafanaEditorRef.current = grafanaUI.CodeEditor;
      }
    } catch (err) {
      // CodeEditor not available, will use textarea
    }
  }, []);

  // Use Grafana's CodeEditor if available
  if (useGrafanaEditor && grafanaEditorRef.current) {
    const CodeEditor = grafanaEditorRef.current;
    return (
      <CodeEditor
        value={value || ''}
        language="promql"
        height={height}
        onBlur={(val: string) => onChange(val)}
        onSave={(val: string) => onChange(val)}
        showMiniMap={false}
        showLineNumbers={true}
      />
    );
  }

  // Fallback: Styled textarea that matches Grafana's query editor appearance
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={8}
      style={{
        width: '100%',
        padding: '8px 12px',
        border: 'none',
        outline: 'none',
        fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", "Consolas", "source-code-pro", monospace',
        fontSize: '13px',
        lineHeight: '1.6',
        background: '#FFFFFF',
        color: '#1F2937',
        resize: 'vertical',
        minHeight: height,
        boxSizing: 'border-box',
      }}
      spellCheck={false}
    />
  );
};

