import React, { useState } from 'react';
import { Database, Download, CheckCircle, RefreshCw } from 'lucide-react';

interface ControlPanelProps {
  pairs: string[];
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
  isCustomPair: boolean;
  setIsCustomPair: (custom: boolean) => void;
  timeframe: string;
  setTimeframe: (tf: string) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;
  cash: number;
  setCash: (cash: number) => void;
  commission: number;
  setCommission: (comm: number) => void;
  onDownloadData: () => void;
  isDownloading: boolean;
  downloadProgress: number;
  downloadStatus: string;
  isDataReady: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  pairs,
  selectedPair,
  setSelectedPair,
  isCustomPair,
  setIsCustomPair,
  timeframe,
  setTimeframe,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  cash,
  setCash,
  commission,
  setCommission,
  onDownloadData,
  isDownloading,
  downloadProgress,
  downloadStatus,
  isDataReady
}) => {
  const [customSymbolInput, setCustomSymbolInput] = useState<string>('');

  const handlePairChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'CUSTOM') {
      setIsCustomPair(true);
    } else {
      setIsCustomPair(false);
      setSelectedPair(val);
    }
  };

  const handleCustomSymbolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customSymbolInput.trim()) {
      setSelectedPair(customSymbolInput.trim().toUpperCase());
    }
  };

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem' }}>
        <Database size={20} style={{ color: 'var(--accent-cyan)' }} />
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Backtester Config</h3>
      </div>

      {/* Symbol Selection */}
      <div>
        <label htmlFor="pairSelect">Trading Asset</label>
        {!isCustomPair ? (
          <select id="pairSelect" value={selectedPair} onChange={handlePairChange} style={{ fontSize: '0.9rem' }}>
            {pairs.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
            <option value="CUSTOM">Custom Pair...</option>
          </select>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <form onSubmit={handleCustomSymbolSubmit} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={customSymbolInput}
                onChange={(e) => setCustomSymbolInput(e.target.value)}
                placeholder="Enter Pair (e.g. EURGBP)"
                style={{ fontSize: '0.9rem', textTransform: 'uppercase', flex: 1 }}
              />
              <button type="submit" className="btn btn-secondary" style={{ padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}>
                Set
              </button>
            </form>
            <button
              onClick={() => setIsCustomPair(false)}
              style={{ fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--accent-cyan)', textAlign: 'left', cursor: 'pointer' }}
            >
              Back to preset list
            </button>
          </div>
        )}
        {isCustomPair && selectedPair && (
          <div style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', marginTop: '0.25rem' }}>
            Active Custom Pair: <strong>{selectedPair}</strong>
          </div>
        )}
      </div>

      {/* Timeframe */}
      <div>
        <label htmlFor="timeframeSelect">Candle Timeframe</label>
        <select id="timeframeSelect" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={{ fontSize: '0.9rem' }}>
          <option value="1m">1 Minute</option>
          <option value="5m">5 Minutes</option>
          <option value="15m">15 Minutes</option>
          <option value="1h">1 Hour</option>
          <option value="1d">1 Day</option>
        </select>
      </div>

      {/* Date Range (Strictly limited to 2026) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label htmlFor="startDate">Start Date (2026 Only)</label>
          <input
            id="startDate"
            type="date"
            min="2026-01-01"
            max="2026-12-31"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
        </div>
        <div>
          <label htmlFor="endDate">End Date (2026 Only)</label>
          <input
            id="endDate"
            type="date"
            min="2026-01-01"
            max="2026-12-31"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* Accounts Variables */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label htmlFor="cashInput">Initial Balance</label>
          <input
            id="cashInput"
            type="number"
            value={cash}
            onChange={(e) => setCash(Number(e.target.value))}
            style={{ fontSize: '0.85rem' }}
          />
        </div>
        <div>
          <label htmlFor="commInput">Commission (Ratio)</label>
          <input
            id="commInput"
            type="number"
            step="0.0001"
            value={commission}
            onChange={(e) => setCommission(Number(e.target.value))}
            style={{ fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* Download trigger & Progress status */}
      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <button
          className="btn btn-secondary"
          onClick={onDownloadData}
          disabled={isDownloading || !selectedPair}
          style={{ width: '100%', gap: '0.5rem', border: '1px solid var(--accent-cyan)' }}
        >
          {isDownloading ? (
            <>
              <RefreshCw className="pulse" size={16} /> Fetching Data...
            </>
          ) : (
            <>
              <Download size={16} /> Fetch Price Data
            </>
          )}
        </button>

        {isDownloading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <span>Downloading Ticks</span>
              <span>{downloadProgress}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  width: `${downloadProgress}%`, 
                  height: '100%', 
                  background: 'linear-gradient(to right, var(--accent-cyan), var(--accent-purple))',
                  transition: 'width 0.2s ease-out'
                }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--accent-cyan)', textAlign: 'right', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {downloadStatus}
            </span>
          </div>
        )}

        {isDataReady && !isDownloading && (
          <div style={{ background: 'var(--color-success-bg)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.5rem 0.75rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle size={16} style={{ color: 'var(--color-success)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--color-success)' }}>
              {selectedPair} OHLCV Data Ready
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
export default ControlPanel;
