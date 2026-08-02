import React, { useState } from 'react';
import { Play, Sparkles, AlertTriangle, Eye, EyeOff, Bookmark } from 'lucide-react';
import { SavedStrategiesModal } from './SavedStrategiesModal';
import type { SavedStrategy } from '../api';

interface StrategyEditorProps {
  strategyDesc: string;
  setStrategyDesc: (desc: string) => void;
  llmProvider: string;
  setLlmProvider: (provider: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  flowchartCode: string;
  isFlowchartVerified: boolean;
  generatedCode: string;
  setGeneratedCode: (code: string) => void;
  onGenerateFlowchart: () => void;
  onGenerateStrategyCode: () => void;
  onRunBacktest: () => void;
  onLoadStrategy: (strategy: SavedStrategy) => void;
  isFlowchartLoading: boolean;
  isCodeLoading: boolean;
  isBacktestRunning: boolean;
  isDataReady: boolean;
}

export const StrategyEditor: React.FC<StrategyEditorProps> = ({
  strategyDesc,
  setStrategyDesc,
  llmProvider,
  setLlmProvider,
  apiKey,
  setApiKey,
  selectedModel,
  setSelectedModel,
  flowchartCode,
  isFlowchartVerified,
  generatedCode,
  setGeneratedCode,
  onGenerateFlowchart,
  onGenerateStrategyCode,
  onRunBacktest,
  onLoadStrategy,
  isFlowchartLoading,
  isCodeLoading,
  isBacktestRunning,
  isDataReady
}) => {
  const [showKey, setShowKey] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
      <SavedStrategiesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentDesc={strategyDesc}
        currentFlowchart={flowchartCode}
        currentCode={generatedCode}
        onLoadStrategy={onLoadStrategy}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} style={{ color: 'var(--accent-purple)' }} /> Strategy Workspace
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Describe your trading strategy and compile it to code</p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="btn"
          style={{
            fontSize: '0.8rem',
            padding: '0.45rem 0.85rem',
            background: 'rgba(168, 85, 247, 0.15)',
            color: 'var(--accent-purple)',
            border: '1px solid rgba(168, 85, 247, 0.3)',
            gap: '0.4rem'
          }}
        >
          <Bookmark size={15} /> Saved Strategies
        </button>
      </div>

      {/* Provider, API Key and Model configuration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label htmlFor="llmProvider">LLM Engine</label>
          <select 
            id="llmProvider" 
            value={llmProvider} 
            onChange={(e) => setLlmProvider(e.target.value)} 
            style={{ fontSize: '0.85rem' }}
          >
            <option value="agy_cli">AGY CLI (Local)</option>
            <option value="gemini_api">Gemini API Key</option>
          </select>
        </div>

        <div>
          <label htmlFor="apiKey">Gemini API Key</label>
          {llmProvider === 'agy_cli' ? (
            <div style={{ 
              fontSize: '0.78rem', 
              color: 'var(--accent-cyan)', 
              background: 'rgba(6, 182, 212, 0.1)', 
              border: '1px solid rgba(6, 182, 212, 0.25)', 
              padding: '0.45rem 0.6rem', 
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              height: '36px'
            }}>
              ⚡ AGY CLI active (No key needed)
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                id="apiKey"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter GEMINI_API_KEY..."
                style={{ paddingRight: '2.5rem', fontSize: '0.85rem' }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="model">Model</label>
          <select id="model" value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ fontSize: '0.85rem' }}>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          </select>
        </div>
      </div>

      {/* English Description Textbox */}
      <div>
        <label htmlFor="strategyDesc">Strategy Description (English)</label>
        <textarea
          id="strategyDesc"
          rows={6}
          value={strategyDesc}
          onChange={(e) => setStrategyDesc(e.target.value)}
          placeholder="Example: Buy long when the 10-period EMA crosses above the 20-period EMA and the RSI is below 40. Set a Stop Loss at 1.5% below entry price, and a Take Profit at 3% above entry price. Exit long if the 10 EMA crosses back below the 20 EMA."
          style={{ width: '100%', resize: 'vertical', fontSize: '0.9rem', lineHeight: '1.4', fontFamily: 'inherit' }}
        />
      </div>

      {/* Step 1: Flowchart Trigger */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          className="btn btn-primary"
          onClick={onGenerateFlowchart}
          disabled={isFlowchartLoading || isCodeLoading || isBacktestRunning || !strategyDesc.trim()}
          style={{ flex: 1, gap: '0.5rem' }}
        >
          {isFlowchartLoading ? 'Mapping Logic...' : 'Generate Flowchart'}
        </button>
      </div>

      {/* Warning/Gate banner */}
      {flowchartCode && !isFlowchartVerified && (
        <div style={{ background: 'var(--color-danger-bg)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '0.75rem', borderRadius: '8px', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={18} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ fontSize: '0.85rem', color: 'var(--color-danger)', fontWeight: 600 }}>Flowchart Review Required</h4>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>You must inspect the generated flowchart above and click "Confirm Strategy Logic" to unlock Python code generation.</p>
          </div>
        </div>
      )}

      {/* Step 2: Code Generation trigger */}
      {isFlowchartVerified && (
        <button
          className="btn"
          onClick={onGenerateStrategyCode}
          disabled={isCodeLoading || isFlowchartLoading || isBacktestRunning}
          style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)', color: '#fff', gap: '0.5rem' }}
        >
          {isCodeLoading ? 'Compiling Python Class...' : 'Generate Backtest Code'}
        </button>
      )}

      {/* Python Code Editor */}
      {(generatedCode || isCodeLoading) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label htmlFor="codeEditor" style={{ margin: 0 }}>Generated Python Strategy</label>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>GeneratedStrategy(Strategy)</span>
          </div>
          
          <div style={{ position: 'relative', flex: 1, display: 'flex', minHeight: '250px' }}>
            {isCodeLoading ? (
              <div style={{ flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border-glass)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                <span className="pulse">Generating backtesting.py strategy...</span>
              </div>
            ) : (
              <textarea
                id="codeEditor"
                value={generatedCode}
                onChange={(e) => setGeneratedCode(e.target.value)}
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  lineHeight: '1.45',
                  padding: '1rem',
                  background: 'var(--bg-secondary)',
                  color: '#e2e8f0',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  resize: 'none',
                  whiteSpace: 'pre',
                  overflow: 'auto'
                }}
              />
            )}
          </div>

          {/* Step 3: Run Backtest trigger */}
          {!isCodeLoading && generatedCode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              {!isDataReady && (
                <div style={{ color: 'var(--color-warning)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <AlertTriangle size={14} /> Historical price data must be downloaded first.
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={onRunBacktest}
                disabled={isBacktestRunning || !isDataReady || isCodeLoading}
                style={{ gap: '0.5rem', width: '100%', background: 'linear-gradient(135deg, var(--accent-purple), #06b6d4)' }}
              >
                <Play size={16} /> {isBacktestRunning ? 'Running Backtest...' : 'Execute Backtest'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default StrategyEditor;
