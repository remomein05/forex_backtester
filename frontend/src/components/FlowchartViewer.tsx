import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw, Check, RefreshCw, Code } from 'lucide-react';

interface FlowchartViewerProps {
  chartCode: string;
  isVerified: boolean;
  onVerify: (verified: boolean) => void;
  onRegenerate: () => void;
  isLoading: boolean;
}

// Configure Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    background: '#131b2e',
    primaryColor: '#a855f7',
    primaryTextColor: '#f8fafc',
    primaryBorderColor: '#06b6d4',
    lineColor: '#64748b',
    secondaryColor: '#1e293b',
    tertiaryColor: '#0f172a'
  },
  flowchart: {
    useMaxWidth: false,
    htmlLabels: false
  },
  securityLevel: 'loose'
});

export const FlowchartViewer: React.FC<FlowchartViewerProps> = ({
  chartCode,
  isVerified,
  onVerify,
  onRegenerate,
  isLoading
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [showRaw, setShowRaw] = useState<boolean>(false);

  useEffect(() => {
    if (!chartCode || isLoading) {
      setError(null);
      return;
    }

    const renderChart = async () => {
      setError(null);
      if (!containerRef.current) return;

      containerRef.current.innerHTML = '';
      const id = `mermaid-svg-${Math.floor(Math.random() * 100000)}`;

      try {
        const cleanCode = chartCode.trim();
        const { svg, bindFunctions } = await mermaid.render(id, cleanCode);
        
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          if (bindFunctions) {
            bindFunctions(containerRef.current);
          }
        }
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        setError(err.message || 'Syntax error in generated flowchart.');
        
        // Cleanup potential broken elements appended to document body by mermaid
        const badEl = document.getElementById(id);
        if (badEl) badEl.remove();
        
        const badBindEl = document.getElementById(`d${id}`);
        if (badBindEl) badBindEl.remove();
      }
    };

    renderChart();
  }, [chartCode, isLoading]);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.15, 2.5));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.15, 0.5));
  const handleResetZoom = () => setScale(1);

  if (!chartCode && !isLoading) {
    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: 'var(--text-secondary)' }}>
        <p>No strategy loaded yet. Write your trading strategy on the left and click "Generate Flowchart".</p>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '400px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Strategy Flowchart</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Verify logic structure before coding</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem' }} onClick={() => setShowRaw(!showRaw)} title="Toggle Raw Syntax">
            <Code size={16} />
          </button>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem' }} onClick={handleZoomOut} disabled={showRaw || isLoading}>
            <ZoomOut size={16} />
          </button>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem' }} onClick={handleZoomIn} disabled={showRaw || isLoading}>
            <ZoomIn size={16} />
          </button>
          <button className="btn btn-secondary" style={{ padding: '0.4rem 0.6rem' }} onClick={handleResetZoom} disabled={showRaw || isLoading}>
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'auto', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-glass)', minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <RefreshCw className="pulse" size={32} style={{ color: 'var(--accent-cyan)' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Mapping strategy logic...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '1.5rem', color: 'var(--color-danger)', maxWidth: '90%' }}>
            <p style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>Flowchart Render Error:</p>
            <pre style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '4px', fontSize: '0.8rem', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
              {error}
            </pre>
            <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={onRegenerate}>
              Retry Generation
            </button>
          </div>
        ) : showRaw ? (
          <pre style={{ width: '100%', height: '100%', padding: '1rem', margin: 0, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--accent-cyan)', overflow: 'auto', alignSelf: 'stretch', textAlign: 'left', whiteSpace: 'pre-wrap' }}>
            {chartCode}
          </pre>
        ) : (
          <div 
            ref={containerRef} 
            style={{ 
              transform: `scale(${scale})`, 
              transformOrigin: 'center center', 
              transition: 'transform 0.15s ease-out',
              padding: '2rem',
              display: 'inline-block'
            }}
          />
        )}
      </div>

      {!isLoading && !error && chartCode && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '1rem' }}>
          <button 
            className="btn btn-secondary" 
            style={{ gap: '0.4rem', fontSize: '0.85rem' }} 
            onClick={onRegenerate}
          >
            <RefreshCw size={14} /> Re-generate
          </button>
          
          <button 
            className={`btn ${isVerified ? 'btn-secondary' : 'btn-primary'}`}
            style={{ gap: '0.4rem', borderColor: isVerified ? 'var(--color-success)' : undefined }}
            onClick={() => onVerify(!isVerified)}
          >
            <Check size={18} style={{ color: isVerified ? 'var(--color-success)' : undefined }} />
            {isVerified ? 'Flowchart Confirmed' : 'Confirm Strategy Logic'}
          </button>
        </div>
      )}
    </div>
  );
};
export default FlowchartViewer;
