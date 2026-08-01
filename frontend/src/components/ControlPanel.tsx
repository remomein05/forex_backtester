import React, { useState } from 'react';
import { Database, Download, CheckCircle, RefreshCw } from 'lucide-react';

export interface DownloadInfo {
  currentDay: number;
  totalDays: number;
  currentDate: string;
  isCached: boolean;
  candleCount: number;
  totalCandles: number;
  elapsedSeconds: number;
  etaSeconds: number | null;
}

interface ControlPanelProps {
  pairs: string[];
  selectedPair: string;
  setSelectedPair: (pair: string) => void;
  isCustomPair: boolean;
  setIsCustomPair: (custom: boolean) => void;
  timeframe: string;
  setTimeframe: (tf: string) => void;
  higherTimeframe: string;
  setHigherTimeframe: (htf: string) => void;
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
  downloadInfo: DownloadInfo;
  isDataReady: boolean;
}

const formatSeconds = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const ControlPanel: React.FC<ControlPanelProps> = ({
  pairs,
  selectedPair,
  setSelectedPair,
  isCustomPair,
  setIsCustomPair,
  timeframe,
  setTimeframe,
  higherTimeframe,
  setHigherTimeframe,
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
  downloadInfo,
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

      {/* Timeframes (Primary & Higher Timeframe Filter) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label htmlFor="timeframeSelect">Primary Timeframe</label>
          <select id="timeframeSelect" value={timeframe} onChange={(e) => setTimeframe(e.target.value)} style={{ fontSize: '0.85rem' }}>
            <option value="1m">1 Minute</option>
            <option value="5m">5 Minutes</option>
            <option value="15m">15 Minutes</option>
            <option value="1h">1 Hour</option>
            <option value="1d">1 Day</option>
          </select>
        </div>
        <div>
          <label htmlFor="htfSelect">Higher TF (Filter)</label>
          <select id="htfSelect" value={higherTimeframe} onChange={(e) => setHigherTimeframe(e.target.value)} style={{ fontSize: '0.85rem' }}>
            <option value="none">None (Single TF)</option>
            <option value="5m">5 Minutes</option>
            <option value="15m">15 Minutes</option>
            <option value="1h">1 Hour</option>
            <option value="1d">1 Day</option>
          </select>
        </div>
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
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.6rem',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-glass)',
            padding: '0.75rem',
            borderRadius: '8px'
          }}>
            {/* Header: Label & % */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-cyan)' }}>
                <RefreshCw className="pulse" size={14} /> Fetching Tick Data
              </span>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                {downloadProgress}%
              </span>
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div 
                style={{ 
                  width: `${downloadProgress}%`, 
                  height: '100%', 
                  background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-purple))',
                  transition: 'width 0.3s ease-out'
                }}
              />
            </div>

            {/* Detailed Metrics Grid */}
            {downloadInfo && downloadInfo.totalDays > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.2rem', fontSize: '0.75rem' }}>
                
                {/* Day Counter & Status Pill */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Day <strong style={{ color: 'var(--text-primary)' }}>{downloadInfo.currentDay}</strong> of <strong>{downloadInfo.totalDays}</strong>
                    {downloadInfo.currentDate && ` (${downloadInfo.currentDate})`}
                  </span>
                  {downloadInfo.isCached ? (
                    <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 500 }}>
                      ⚡ Cached
                    </span>
                  ) : (
                    <span style={{ background: 'rgba(168, 85, 247, 0.15)', color: '#a855f7', border: '1px solid rgba(168, 85, 247, 0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 500 }}>
                      🌐 Downloading bi5
                    </span>
                  )}
                </div>

                {/* Timers: Elapsed & ETA */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.4rem 0.5rem', borderRadius: '6px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Elapsed Time</span>
                    <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontWeight: 600 }}>
                      {formatSeconds(downloadInfo.elapsedSeconds)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.7rem' }}>Est. Remaining</span>
                    <span style={{ color: 'var(--accent-cyan)', fontFamily: 'monospace', fontWeight: 600 }}>
                      {downloadInfo.etaSeconds !== null ? `~${formatSeconds(downloadInfo.etaSeconds)}` : 'Calculating...'}
                    </span>
                  </div>
                </div>

                {/* Candles fetched count */}
                {downloadInfo.totalCandles > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    <span>Processed OHLCV</span>
                    <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {downloadInfo.totalCandles.toLocaleString()} candles
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Status log text */}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '0.1rem' }}>
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
