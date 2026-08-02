import React, { useState, useEffect } from 'react';
import { Play, Sparkles, AlertTriangle, Eye, EyeOff, Bookmark, Save, PlusCircle, Check } from 'lucide-react';
import { SavedStrategiesModal } from './SavedStrategiesModal';
import { getSavedStrategies, saveStrategy } from '../api';
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
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategy[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('');
  const [selectedStrategyName, setSelectedStrategyName] = useState<string>('');

  // Quick save dialog state
  const [isSavePromptOpen, setIsSavePromptOpen] = useState<boolean>(false);
  const [saveAsNewMode, setSaveAsNewMode] = useState<boolean>(false);
  const [inputName, setInputName] = useState<string>('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const fetchSavedList = async () => {
    try {
      const res = await getSavedStrategies();
      setSavedStrategies(res.strategies || []);
    } catch (err) {
      console.error('Failed to load saved strategy list:', err);
    }
  };

  useEffect(() => {
    fetchSavedList();
  }, [isModalOpen]);

  const handleDropdownSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) {
      setSelectedStrategyId('');
      setSelectedStrategyName('');
      return;
    }
    const found = savedStrategies.find((s) => s.id === id);
    if (found) {
      setSelectedStrategyId(found.id || '');
      setSelectedStrategyName(found.name);
      onLoadStrategy(found);
    }
  };

  const handleOpenSavePrompt = (saveAsNew: boolean = false) => {
    setSaveAsNewMode(saveAsNew);
    if (saveAsNew || !selectedStrategyId) {
      setInputName(selectedStrategyName ? `${selectedStrategyName} (Copy)` : `Strategy ${new Date().toLocaleDateString()}`);
    } else {
      setInputName(selectedStrategyName);
    }
    setIsSavePromptOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!inputName.trim()) return;
    setIsSaving(true);
    try {
      const payload: SavedStrategy = {
        id: (!saveAsNewMode && selectedStrategyId) ? selectedStrategyId : undefined,
        name: inputName.trim(),
        description: strategyDesc.trim(),
        flowchart_code: flowchartCode,
        python_code: generatedCode,
      };
      const res = await saveStrategy(payload);
      setSelectedStrategyId(res.strategy.id || '');
      setSelectedStrategyName(res.strategy.name);
      setSaveMessage(saveAsNewMode || !selectedStrategyId ? 'Saved as new strategy!' : 'Strategy updated!');
      setTimeout(() => setSaveMessage(null), 3000);
      setIsSavePromptOpen(false);
      await fetchSavedList();
    } catch (err: any) {
      alert(err.message || 'Failed to save strategy.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleModalLoadStrategy = (strat: SavedStrategy) => {
    setSelectedStrategyId(strat.id || '');
    setSelectedStrategyName(strat.name);
    onLoadStrategy(strat);
  };

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
      <SavedStrategiesModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentDesc={strategyDesc}
        currentFlowchart={flowchartCode}
        currentCode={generatedCode}
        onLoadStrategy={handleModalLoadStrategy}
      />

      {/* Inline Save Prompt Modal */}
      {isSavePromptOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div style={{
            background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px',
            padding: '1.25rem', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1rem'
          }}>
            <h4 style={{ margin: 0, color: '#f8fafc', fontSize: '1rem', fontWeight: 600 }}>
              {saveAsNewMode ? 'Save as New Strategy' : 'Save Strategy'}
            </h4>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '0.4rem' }}>Strategy Name</label>
              <input
                type="text"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                placeholder="Enter strategy title..."
                autoFocus
                style={{ width: '100%', fontSize: '0.875rem' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                onClick={() => setIsSavePromptOpen(false)}
                className="btn"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSave}
                disabled={isSaving || !inputName.trim()}
                className="btn btn-primary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

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
          <Bookmark size={15} /> All Saved Strategies
        </button>
      </div>

      {/* Strategy Selector & Quick Save Control Bar */}
      <div style={{ background: 'rgba(30, 41, 59, 0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label htmlFor="savedStrategySelect" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Load / Select Strategy
          </label>

          {selectedStrategyId && (
            <span style={{ fontSize: '0.725rem', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '2px 8px', borderRadius: '4px' }}>
              Loaded: <strong>{selectedStrategyName}</strong>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            id="savedStrategySelect"
            value={selectedStrategyId}
            onChange={handleDropdownSelect}
            style={{ flex: 1, fontSize: '0.85rem' }}
          >
            <option value="">-- Start New Strategy --</option>
            {savedStrategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.updated_at ? new Date(s.updated_at).toLocaleDateString() : 'Saved'})
              </option>
            ))}
          </select>

          {selectedStrategyId ? (
            <>
              <button
                onClick={() => handleConfirmSave()}
                disabled={isSaving}
                className="btn"
                style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem', background: 'var(--accent-purple)', color: '#fff', border: 'none', gap: '0.3rem' }}
              >
                <Save size={14} /> Update
              </button>
              <button
                onClick={() => handleOpenSavePrompt(true)}
                disabled={isSaving}
                className="btn"
                style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem', background: 'rgba(6, 182, 212, 0.15)', color: 'var(--accent-cyan)', border: '1px solid rgba(6, 182, 212, 0.3)', gap: '0.3rem' }}
              >
                <PlusCircle size={14} /> Save as New
              </button>
            </>
          ) : (
            <button
              onClick={() => handleOpenSavePrompt(false)}
              disabled={isSaving || !strategyDesc.trim()}
              className="btn btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem', gap: '0.3rem' }}
            >
              <Save size={14} /> Save Strategy
            </button>
          )}
        </div>

        {saveMessage && (
          <div style={{ fontSize: '0.75rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Check size={12} /> {saveMessage}
          </div>
        )}
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
