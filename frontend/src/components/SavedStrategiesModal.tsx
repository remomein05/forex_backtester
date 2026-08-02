import React, { useState, useEffect } from 'react';
import { Bookmark, Save, FolderOpen, Trash2, Download, Upload, X, Check, Clock, Sparkles } from 'lucide-react';
import { getSavedStrategies, saveStrategy, deleteStrategy } from '../api';
import type { SavedStrategy } from '../api';

interface SavedStrategiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDesc: string;
  currentFlowchart: string;
  currentCode: string;
  onLoadStrategy: (strategy: SavedStrategy) => void;
}

export const SavedStrategiesModal: React.FC<SavedStrategiesModalProps> = ({
  isOpen,
  onClose,
  currentDesc,
  currentFlowchart,
  currentCode,
  onLoadStrategy,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'save'>('list');
  const [strategies, setStrategies] = useState<SavedStrategy[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state for saving
  const [strategyName, setStrategyName] = useState<string>('');
  const [saveDesc, setSaveDesc] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      fetchStrategies();
      setSaveDesc(currentDesc);
      if (!strategyName) {
        setStrategyName(`Strategy ${new Date().toLocaleDateString()}`);
      }
    }
  }, [isOpen, currentDesc]);

  const fetchStrategies = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSavedStrategies();
      setStrategies(res.strategies || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load saved strategies.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strategyName.trim()) {
      setError('Strategy name is required.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload: SavedStrategy = {
        name: strategyName.trim(),
        description: saveDesc.trim(),
        flowchart_code: currentFlowchart,
        python_code: currentCode,
      };
      await saveStrategy(payload);
      setSuccessMsg('Strategy saved successfully!');
      setTimeout(() => setSuccessMsg(null), 3000);
      setStrategyName('');
      setActiveTab('list');
      await fetchStrategies();
    } catch (err: any) {
      setError(err.message || 'Failed to save strategy.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    setLoading(true);
    try {
      await deleteStrategy(id);
      setStrategies((prev) => prev.filter((s) => s.id !== id));
      setSuccessMsg(`Deleted "${name}".`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete strategy.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportJSON = (strat: SavedStrategy) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(strat, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${strat.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_strategy.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed: SavedStrategy = JSON.parse(content);
        if (!parsed.name || !parsed.description) {
          throw new Error('Invalid strategy file format. Must include name and description.');
        }
        await saveStrategy(parsed);
        setSuccessMsg(`Imported strategy "${parsed.name}"!`);
        setTimeout(() => setSuccessMsg(null), 3000);
        await fetchStrategies();
      } catch (err: any) {
        setError(err.message || 'Failed to import JSON file.');
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1000,
      background: 'rgba(5, 7, 15, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem'
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '650px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(30, 41, 59, 0.5)'
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#f8fafc' }}>
            <Bookmark size={20} style={{ color: 'var(--accent-purple)' }} /> Strategy Library
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs & Import Button */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1.5rem',
          background: 'rgba(15, 23, 42, 0.8)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('list')}
              className="btn"
              style={{
                fontSize: '0.825rem',
                padding: '0.4rem 0.85rem',
                background: activeTab === 'list' ? 'var(--accent-purple)' : 'rgba(255, 255, 255, 0.05)',
                color: activeTab === 'list' ? '#fff' : '#94a3b8',
                border: 'none',
                gap: '0.4rem'
              }}
            >
              <FolderOpen size={15} /> Saved Strategies ({strategies.length})
            </button>
            <button
              onClick={() => setActiveTab('save')}
              className="btn"
              style={{
                fontSize: '0.825rem',
                padding: '0.4rem 0.85rem',
                background: activeTab === 'save' ? 'var(--accent-purple)' : 'rgba(255, 255, 255, 0.05)',
                color: activeTab === 'save' ? '#fff' : '#94a3b8',
                border: 'none',
                gap: '0.4rem'
              }}
            >
              <Save size={15} /> Save Current Strategy
            </button>
          </div>

          <label
            className="btn"
            style={{
              fontSize: '0.8rem',
              padding: '0.4rem 0.75rem',
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--accent-cyan)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <Upload size={14} /> Import JSON
            <input type="file" accept=".json" onChange={handleImportJSON} style={{ display: 'none' }} />
          </label>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{ margin: '1rem 1.5rem 0', padding: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', borderRadius: '8px', fontSize: '0.825rem' }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div style={{ margin: '1rem 1.5rem 0', padding: '0.75rem', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#6ee7b7', borderRadius: '8px', fontSize: '0.825rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Check size={16} /> {successMsg}
          </div>
        )}

        {/* Content Body */}
        <div style={{ padding: '1.25rem 1.5rem', flex: 1, overflowY: 'auto' }}>
          {activeTab === 'save' ? (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', marginBottom: '0.4rem', color: '#cbd5e1' }}>Strategy Name</label>
                <input
                  type="text"
                  value={strategyName}
                  onChange={(e) => setStrategyName(e.target.value)}
                  placeholder="e.g. EMA Crossover + RSI Filter"
                  required
                  style={{ width: '100%', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', marginBottom: '0.4rem', color: '#cbd5e1' }}>Description & Rules</label>
                <textarea
                  rows={5}
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  placeholder="Strategy rules..."
                  style={{ width: '100%', fontSize: '0.85rem', lineHeight: '1.4' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', flex: 1 }}>
                  Includes: {currentFlowchart ? '✓ Mermaid Flowchart' : '✗ No Flowchart'} | {currentCode ? '✓ Python Strategy Class' : '✗ No Python Code'}
                </div>
                <button
                  type="submit"
                  disabled={loading || !strategyName.trim()}
                  className="btn btn-primary"
                  style={{ padding: '0.5rem 1.25rem' }}
                >
                  <Save size={16} /> {loading ? 'Saving...' : 'Save Strategy'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {loading && <div style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>Loading saved strategies...</div>}

              {!loading && strategies.length === 0 && (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem 1rem' }}>
                  <Sparkles size={32} style={{ color: 'var(--accent-purple)', opacity: 0.5, marginBottom: '0.5rem' }} />
                  <p style={{ fontSize: '0.9rem' }}>No saved strategies found.</p>
                  <p style={{ fontSize: '0.8rem', color: '#64748b' }}>Create a strategy in the workspace and click "Save Current Strategy".</p>
                </div>
              )}

              {strategies.map((strat) => (
                <div
                  key={strat.id}
                  style={{
                    background: 'rgba(30, 41, 59, 0.4)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '10px',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' }}>{strat.name}</h4>
                      <span style={{ fontSize: '0.725rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '2px' }}>
                        <Clock size={12} /> {strat.updated_at ? new Date(strat.updated_at).toLocaleString() : 'Saved'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={() => {
                          onLoadStrategy(strat);
                          onClose();
                        }}
                        className="btn btn-primary"
                        style={{ fontSize: '0.775rem', padding: '0.35rem 0.75rem' }}
                      >
                        <FolderOpen size={14} /> Load
                      </button>
                      <button
                        onClick={() => handleExportJSON(strat)}
                        className="btn"
                        title="Export strategy as JSON"
                        style={{ fontSize: '0.775rem', padding: '0.35rem 0.6rem', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)' }}
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => strat.id && handleDelete(strat.id, strat.name)}
                        className="btn"
                        title="Delete strategy"
                        style={{ fontSize: '0.775rem', padding: '0.35rem 0.6rem', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <p style={{
                    fontSize: '0.8rem',
                    color: '#94a3b8',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: '1.45'
                  }}>
                    {strat.description}
                  </p>

                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.725rem', marginTop: '4px' }}>
                    <span style={{ background: strat.flowchart_code ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)', color: strat.flowchart_code ? '#34d399' : '#64748b', padding: '2px 8px', borderRadius: '4px' }}>
                      {strat.flowchart_code ? 'Flowchart Ready' : 'No Flowchart'}
                    </span>
                    <span style={{ background: strat.python_code ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255,255,255,0.05)', color: strat.python_code ? '#38bdf8' : '#64748b', padding: '2px 8px', borderRadius: '4px' }}>
                      {strat.python_code ? 'Python Class Ready' : 'No Code'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
