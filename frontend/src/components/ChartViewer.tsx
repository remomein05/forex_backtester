import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  ComposedChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  ReferenceLine 
} from 'recharts';
import { CandlestickChart, TrendingUp, ArrowUpCircle, ArrowDownCircle, Shield, Target } from 'lucide-react';
import type { Trade, CandlePoint } from '../api';

interface ChartViewerProps {
  candles?: CandlePoint[];
  trades?: Trade[];
  symbol: string;
  timeframe: string;
}

export const ChartViewer: React.FC<ChartViewerProps> = ({
  candles = [],
  trades = [],
  symbol,
  timeframe
}) => {
  const [selectedTradeId, setSelectedTradeId] = useState<number | 'all'>('all');
  const [chartType, setChartType] = useState<'line' | 'ohlc'>('line');

  // Filter or focus on specific trade window if a trade is selected
  const activeTrade = useMemo(() => {
    if (selectedTradeId === 'all') return null;
    return trades.find(t => t.id === selectedTradeId) || null;
  }, [selectedTradeId, trades]);

  // Prepare chart data series
  const chartData = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    
    // Format timestamp display
    return candles.map(c => {
      const dateStr = c.time.replace('T', ' ').slice(0, 16);
      return {
        time: dateStr,
        rawTime: c.time,
        price: c.close,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume
      };
    });
  }, [candles]);

  // Selected trade stats
  const selectedTradeStats = useMemo(() => {
    if (!activeTrade) return null;
    const isLong = activeTrade.size > 0;
    
    // Estimate SL/TP if not explicitly provided by engine
    let sl = activeTrade.sl;
    let tp = activeTrade.tp;
    
    if (sl == null || sl === 0) {
      // Default estimated 1% SL for visualization
      sl = isLong ? activeTrade.entry_price * 0.99 : activeTrade.entry_price * 1.01;
    }
    if (tp == null || tp === 0) {
      // Default estimated 2% TP for visualization
      tp = isLong ? activeTrade.entry_price * 1.02 : activeTrade.entry_price * 0.98;
    }

    return {
      isLong,
      entryPrice: activeTrade.entry_price,
      exitPrice: activeTrade.exit_price,
      entryTime: activeTrade.entry_time.replace('T', ' ').slice(0, 16),
      exitTime: activeTrade.exit_time.replace('T', ' ').slice(0, 16),
      pnl: activeTrade.pnl,
      returnPct: activeTrade.return_pct,
      sl,
      tp
    };
  }, [activeTrade]);

  if (!candles || candles.length === 0) {
    return (
      <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <CandlestickChart size={48} style={{ opacity: 0.3, marginBottom: '1rem', color: 'var(--accent-cyan)' }} />
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>No Price & Trade Chart Available</h3>
        <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', maxWidth: '460px', marginLeft: 'auto', marginRight: 'auto' }}>
          Run a backtest in the <strong>Backtest</strong> tab to generate historical candle price data and visual trade execution overlays.
        </p>
      </div>
    );
  }

  // Find min/max price for Y-Axis domain padding
  const prices = chartData.map(d => d.price).filter(p => p != null && !isNaN(p));
  const minPrice = prices.length ? Math.min(...prices) * 0.998 : 0;
  const maxPrice = prices.length ? Math.max(...prices) * 1.002 : 1;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={22} style={{ color: 'var(--accent-cyan)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
              Price & Trade Overlay Chart ({symbol} - {timeframe.toUpperCase()})
            </h2>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
            Showing {candles.length.toLocaleString()} candles & {trades.length} executed trades with Entry, Stop Loss (SL) & Take Profit (TP) levels.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Trade Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Inspect Trade:</span>
            <select
              value={selectedTradeId}
              onChange={(e) => setSelectedTradeId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: '#f8fafc' }}
            >
              <option value="all">All Executed Trades ({trades.length})</option>
              {trades.map(t => (
                <option key={t.id} value={t.id}>
                  Trade #{t.id} ({t.size > 0 ? 'LONG' : 'SHORT'} | PnL: ${t.pnl >= 0 ? `+${t.pnl.toFixed(2)}` : t.pnl.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          {/* Toggle Chart Mode */}
          <button
            onClick={() => setChartType(chartType === 'line' ? 'ohlc' : 'line')}
            className="btn"
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem', background: 'rgba(255,255,255,0.06)' }}
          >
            {chartType === 'line' ? '📈 Line View' : '🕯️ Candle View'}
          </button>
        </div>
      </div>

      {/* Trade Inspector Banner if specific trade selected */}
      {selectedTradeStats && (
        <div style={{ 
          background: selectedTradeStats.pnl >= 0 ? 'rgba(52, 211, 153, 0.08)' : 'rgba(244, 63, 94, 0.08)',
          border: `1px solid ${selectedTradeStats.pnl >= 0 ? 'rgba(52, 211, 153, 0.25)' : 'rgba(244, 63, 94, 0.25)'}`,
          borderRadius: '8px',
          padding: '0.75rem 1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.75rem',
          fontSize: '0.8rem'
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Direction / Type</span>
            <strong style={{ color: selectedTradeStats.isLong ? '#34d399' : '#f43f5e', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              {selectedTradeStats.isLong ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
              {selectedTradeStats.isLong ? 'LONG BUY' : 'SHORT SELL'}
            </strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Entry Price</span>
            <span style={{ color: '#f8fafc', fontWeight: 600 }}>{selectedTradeStats.entryPrice.toFixed(5)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Exit Price</span>
            <span style={{ color: '#f8fafc', fontWeight: 600 }}>{selectedTradeStats.exitPrice.toFixed(5)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Stop Loss (SL)</span>
            <span style={{ color: '#f43f5e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <Shield size={12} /> {selectedTradeStats.sl?.toFixed(5)}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Take Profit (TP)</span>
            <span style={{ color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              <Target size={12} /> {selectedTradeStats.tp?.toFixed(5)}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Trade Result (PnL)</span>
            <strong style={{ color: selectedTradeStats.pnl >= 0 ? '#34d399' : '#f43f5e' }}>
              ${selectedTradeStats.pnl >= 0 ? `+${selectedTradeStats.pnl.toFixed(2)}` : selectedTradeStats.pnl.toFixed(2)} ({selectedTradeStats.returnPct >= 0 ? `+${selectedTradeStats.returnPct.toFixed(2)}%` : `${selectedTradeStats.returnPct.toFixed(2)}%`})
            </strong>
          </div>
        </div>
      )}

      {/* Main Chart Canvas */}
      <div style={{ width: '100%', height: 420 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 25 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis 
              dataKey="time" 
              stroke="#64748b" 
              fontSize={11} 
              tickLine={false}
              minTickGap={40}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={11} 
              domain={[minPrice, maxPrice]}
              tickFormatter={(v) => typeof v === 'number' ? v.toFixed(4) : v}
              orientation="right"
            />
            <Tooltip 
              contentStyle={{ background: '#0f172a', borderColor: 'rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '0.8rem', color: '#f8fafc' }}
              labelStyle={{ color: '#94a3b8', fontWeight: 600, marginBottom: '0.25rem' }}
              formatter={(val: any) => [typeof val === 'number' ? val.toFixed(5) : val, 'Price']}
            />
            
            {/* Price Line */}
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke="var(--accent-cyan)" 
              strokeWidth={1.5} 
              dot={false}
              activeDot={{ r: 4, stroke: '#38bdf8', strokeWidth: 2 }}
            />

            {/* Overlaid Stop Loss (SL) & Take Profit (TP) reference lines for active trade */}
            {selectedTradeStats && selectedTradeStats.sl && (
              <ReferenceLine 
                y={selectedTradeStats.sl} 
                stroke="#f43f5e" 
                strokeDasharray="4 4" 
                label={{ value: `SL: ${selectedTradeStats.sl.toFixed(5)}`, fill: '#f43f5e', fontSize: 11, position: 'insideRight' }} 
              />
            )}
            {selectedTradeStats && selectedTradeStats.tp && (
              <ReferenceLine 
                y={selectedTradeStats.tp} 
                stroke="#34d399" 
                strokeDasharray="4 4" 
                label={{ value: `TP: ${selectedTradeStats.tp.toFixed(5)}`, fill: '#34d399', fontSize: 11, position: 'insideRight' }} 
              />
            )}
            {selectedTradeStats && selectedTradeStats.entryPrice && (
              <ReferenceLine 
                y={selectedTradeStats.entryPrice} 
                stroke="#38bdf8" 
                strokeDasharray="2 2" 
                label={{ value: `ENTRY: ${selectedTradeStats.entryPrice.toFixed(5)}`, fill: '#38bdf8', fontSize: 11, position: 'insideLeft' }} 
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Trades Summary & Legend */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        fontSize: '0.75rem', 
        color: 'var(--text-muted)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: '0.75rem'
      }}>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)' }}></span>
            Price Series ({symbol})
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '12px', height: '2px', background: '#38bdf8' }}></span>
            Entry Price Level
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '12px', height: '2px', background: '#f43f5e', borderStyle: 'dashed' }}></span>
            Stop Loss (SL)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '12px', height: '2px', background: '#34d399', borderStyle: 'dashed' }}></span>
            Take Profit (TP)
          </span>
        </div>

        <div>
          Total Executed Trades: <strong style={{ color: '#f8fafc' }}>{trades.length}</strong>
        </div>
      </div>
    </div>
  );
};

export default ChartViewer;
