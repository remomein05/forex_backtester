import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  CandlestickChart, 
  TrendingUp, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  Shield, 
  Target, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw,
  Maximize2,
  Minimize2
} from 'lucide-react';
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
  const [chartType, setChartType] = useState<'ohlc' | 'line'>('ohlc');
  const [chartHeight, setChartHeight] = useState<number>(650);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Zoom & Pan Range state (slice indices of candles array)
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0
  });

  // Track range initialization when candles load
  useEffect(() => {
    if (candles && candles.length > 0) {
      setRange({
        start: Math.max(0, candles.length - 100),
        end: candles.length - 1
      });
    }
  }, [candles]);

  // Dragging state for mouse panning
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragStartRange, setDragStartRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });

  // Ref for chart container measuring
  const containerRef = useRef<HTMLDivElement>(null);

  // Active trade for inspection
  const activeTrade = useMemo(() => {
    if (selectedTradeId === 'all') return null;
    return trades.find(t => t.id === selectedTradeId) || null;
  }, [selectedTradeId, trades]);

  // Handle trade selection & auto-scroll to centered trade window
  const handleSelectTrade = (tradeId: number | 'all') => {
    setSelectedTradeId(tradeId);
    if (tradeId !== 'all' && candles.length > 0) {
      const t = trades.find(tr => tr.id === tradeId);
      if (t) {
        const cleanEntryTime = t.entry_time.replace('T', ' ').slice(0, 13);
        const entryIdx = candles.findIndex(c => c.time.replace('T', ' ').startsWith(cleanEntryTime));
        if (entryIdx !== -1) {
          const span = 80;
          const start = Math.max(0, entryIdx - 20);
          const end = Math.min(candles.length - 1, start + span - 1);
          setRange({ start, end });
        }
      }
    }
  };

  // Zoom In Handler
  const handleZoomIn = () => {
    if (!candles || candles.length === 0) return;
    const currentSpan = range.end - range.start + 1;
    if (currentSpan <= 15) return;

    const newSpan = Math.max(15, Math.floor(currentSpan * 0.7));
    const center = Math.floor((range.start + range.end) / 2);
    let newStart = Math.max(0, center - Math.floor(newSpan / 2));
    let newEnd = Math.min(candles.length - 1, newStart + newSpan - 1);
    if (newEnd - newStart + 1 < newSpan) {
      newStart = Math.max(0, newEnd - newSpan + 1);
    }
    setRange({ start: newStart, end: newEnd });
  };

  // Zoom Out Handler
  const handleZoomOut = () => {
    if (!candles || candles.length === 0) return;
    const currentSpan = range.end - range.start + 1;
    if (currentSpan >= candles.length) return;

    const newSpan = Math.min(candles.length, Math.ceil(currentSpan * 1.4));
    const center = Math.floor((range.start + range.end) / 2);
    let newStart = Math.max(0, center - Math.floor(newSpan / 2));
    let newEnd = Math.min(candles.length - 1, newStart + newSpan - 1);
    if (newEnd >= candles.length - 1) {
      newStart = Math.max(0, candles.length - newSpan);
    }
    setRange({ start: newStart, end: newEnd });
  };

  // Reset View Handler
  const handleResetView = () => {
    if (!candles || candles.length === 0) return;
    setRange({
      start: Math.max(0, candles.length - 100),
      end: candles.length - 1
    });
    setSelectedTradeId('all');
  };

  // Mouse Wheel Zooming
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else if (e.deltaY > 0) {
      handleZoomOut();
    }
  };

  // Mouse Drag Panning
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartRange({ start: range.start, end: range.end });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current || !candles.length) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragStartX;
    const span = dragStartRange.end - dragStartRange.start + 1;
    const candlesShift = Math.round((dx / rect.width) * span);

    let newStart = dragStartRange.start - candlesShift;
    let newEnd = dragStartRange.end - candlesShift;

    if (newStart < 0) {
      newStart = 0;
      newEnd = span - 1;
    }
    if (newEnd >= candles.length) {
      newEnd = candles.length - 1;
      newStart = Math.max(0, newEnd - span + 1);
    }

    setRange({ start: newStart, end: newEnd });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Selected trade stats banner metadata
  const selectedTradeStats = useMemo(() => {
    if (!activeTrade) return null;
    const isLong = activeTrade.size > 0;
    
    let sl = activeTrade.sl;
    let tp = activeTrade.tp;
    
    if (sl == null || sl === 0) {
      sl = isLong ? activeTrade.entry_price * 0.99 : activeTrade.entry_price * 1.01;
    }
    if (tp == null || tp === 0) {
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
          Run a strategy backtest in the <strong>Strategy</strong> tab to generate historical candle price data and visual trade execution overlays.
        </p>
      </div>
    );
  }

  // Slice visible candles according to current zoom range
  const validStart = Math.max(0, Math.min(range.start, candles.length - 1));
  const validEnd = Math.max(validStart, Math.min(range.end, candles.length - 1));
  const visibleCandles = candles.slice(validStart, validEnd + 1);

  // Geometry dimensions for SVG rendering
  const width = 1200;
  const height = isFullscreen ? Math.max(700, window.innerHeight - 200) : chartHeight;
  const padding = { top: 25, right: 75, bottom: 35, left: 15 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Price Y-Domain mapping
  const visiblePrices = visibleCandles.flatMap(c => [c.high, c.low]).filter(p => p != null && !isNaN(p));
  const minP = visiblePrices.length ? Math.min(...visiblePrices) : 1;
  const maxP = visiblePrices.length ? Math.max(...visiblePrices) : 1.1;
  const pMargin = (maxP - minP) * 0.05 || 0.001;
  const yMin = minP - pMargin;
  const yMax = maxP + pMargin;

  const valToY = (val: number) => {
    return padding.top + chartH - ((val - yMin) / (yMax - yMin)) * chartH;
  };

  const idxToX = (index: number) => {
    if (visibleCandles.length <= 1) return padding.left + chartW / 2;
    return padding.left + (index / (visibleCandles.length - 1)) * chartW;
  };

  const candleW = Math.max(2, Math.min(18, (chartW / visibleCandles.length) * 0.7));

  // Build Price Line points string for line view
  const linePoints = visibleCandles.map((c, i) => `${idxToX(i)},${valToY(c.close)}`).join(' ');

  // Match trades to visible candles
  const tradesOnVisibleCandles: { trade: Trade; entryIdx?: number; exitIdx?: number }[] = [];
  trades.forEach(t => {
    if (selectedTradeId !== 'all' && t.id !== selectedTradeId) return;

    const cleanEntry = t.entry_time.replace('T', ' ').slice(0, 13);
    const cleanExit = t.exit_time.replace('T', ' ').slice(0, 13);

    const entryIdx = candles.findIndex(c => c.time.replace('T', ' ').startsWith(cleanEntry));
    const exitIdx = candles.findIndex(c => c.time.replace('T', ' ').startsWith(cleanExit));

    if ((entryIdx >= validStart && entryIdx <= validEnd) || (exitIdx >= validStart && exitIdx <= validEnd)) {
      tradesOnVisibleCandles.push({
        trade: t,
        entryIdx: (entryIdx >= validStart && entryIdx <= validEnd) ? entryIdx - validStart : undefined,
        exitIdx: (exitIdx >= validStart && exitIdx <= validEnd) ? exitIdx - validStart : undefined
      });
    }
  });

  // Generate 5 Y-Axis ticks
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(pct => {
    const val = yMin + pct * (yMax - yMin);
    return { val, y: valToY(val) };
  });

  // Generate X-Axis time label ticks
  const xStep = Math.max(1, Math.floor(visibleCandles.length / 6));
  const xTicks = visibleCandles.filter((_, i) => i % xStep === 0).map((c, idx) => ({
    x: idxToX(idx * xStep),
    label: c.time.replace('T', ' ').slice(0, 16)
  }));

  return (
    <div 
      className="card" 
      style={isFullscreen ? {
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: '#0a0f1d',
        padding: '1.5rem',
        overflowY: 'auto',
        borderRadius: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      } : { 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1.25rem' 
      }}
    >
      {/* Header & Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={22} style={{ color: 'var(--accent-cyan)' }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>
              Price & Trade Overlay Chart ({symbol} - {timeframe.toUpperCase()})
            </h2>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
            Showing {visibleCandles.length} visible candles of {candles.length.toLocaleString()} total | {trades.length} trades loaded. Use mouse wheel to zoom, drag to scroll.
          </p>
        </div>

        {/* Toolbar Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Trade Filter Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Inspect:</span>
            <select
              value={selectedTradeId}
              onChange={(e) => handleSelectTrade(e.target.value === 'all' ? 'all' : Number(e.target.value))}
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

          {/* Toggle Candle / Line Mode */}
          <button
            onClick={() => setChartType(chartType === 'line' ? 'ohlc' : 'line')}
            className="btn"
            style={{ 
              fontSize: '0.78rem', 
              padding: '0.35rem 0.65rem', 
              background: chartType === 'ohlc' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(6, 182, 212, 0.15)', 
              color: chartType === 'ohlc' ? '#34d399' : '#38bdf8',
              border: `1px solid ${chartType === 'ohlc' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(6, 182, 212, 0.3)'}`
            }}
          >
            {chartType === 'line' ? '🕯️ Candlesticks' : '📈 Line View'}
          </button>

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            className="btn"
            title="Zoom In (Scroll Wheel Up)"
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.55rem', background: 'rgba(255,255,255,0.06)' }}
          >
            <ZoomIn size={14} />
          </button>

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            className="btn"
            title="Zoom Out (Scroll Wheel Down)"
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.55rem', background: 'rgba(255,255,255,0.06)' }}
          >
            <ZoomOut size={14} />
          </button>

          {/* Reset View */}
          <button
            onClick={handleResetView}
            className="btn"
            title="Reset View"
            style={{ fontSize: '0.78rem', padding: '0.35rem 0.55rem', background: 'rgba(255,255,255,0.06)' }}
          >
            <RotateCcw size={14} />
          </button>

          {/* Chart Height Preset Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Height:</span>
            <select
              value={chartHeight}
              onChange={(e) => setChartHeight(Number(e.target.value))}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.6rem', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: '#f8fafc' }}
            >
              <option value={550}>Medium (550px)</option>
              <option value={700}>Large (700px)</option>
              <option value={850}>Extra Large (850px)</option>
            </select>
          </div>

          {/* Full Screen Toggle Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="btn"
            title={isFullscreen ? "Exit Fullscreen" : "Maximize / Fullscreen"}
            style={{ 
              fontSize: '0.78rem', 
              padding: '0.35rem 0.65rem', 
              background: isFullscreen ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.06)',
              color: isFullscreen ? 'var(--accent-purple)' : '#f8fafc',
              gap: '0.3rem'
            }}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>

      {/* Selected Trade Inspection Banner */}
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

      {/* SVG Interactive Canvas with Scroll & Zoom */}
      <div 
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ 
          width: '100%', 
          height: height, 
          background: '#090d16', 
          borderRadius: '10px', 
          border: '1px solid rgba(255,255,255,0.08)',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          position: 'relative'
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }}>
          {/* Grid Lines */}
          {yTicks.map((t, idx) => (
            <g key={`grid-y-${idx}`}>
              <line x1={padding.left} y1={t.y} x2={width - padding.right} y2={t.y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <text x={width - padding.right + 6} y={t.y + 4} fill="#64748b" fontSize="10" fontFamily="var(--font-mono)">
                {t.val.toFixed(4)}
              </text>
            </g>
          ))}

          {/* Time Labels */}
          {xTicks.map((t, idx) => (
            <g key={`grid-x-${idx}`}>
              <line x1={t.x} y1={padding.top} x2={t.x} y2={height - padding.bottom} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <text x={t.x} y={height - 10} fill="#64748b" fontSize="10" textAnchor="middle">
                {t.label}
              </text>
            </g>
          ))}

          {/* Overlaid Selected Trade SL & TP Reference Lines */}
          {selectedTradeStats && selectedTradeStats.sl && (
            <g>
              <line 
                x1={padding.left} 
                y1={valToY(selectedTradeStats.sl)} 
                x2={width - padding.right} 
                y2={valToY(selectedTradeStats.sl)} 
                stroke="#f43f5e" 
                strokeWidth={1.5} 
                strokeDasharray="4 4" 
              />
              <text x={width - padding.right - 5} y={valToY(selectedTradeStats.sl) - 5} fill="#f43f5e" fontSize="10" fontWeight="bold" textAnchor="end">
                SL: {selectedTradeStats.sl.toFixed(5)}
              </text>
            </g>
          )}

          {selectedTradeStats && selectedTradeStats.tp && (
            <g>
              <line 
                x1={padding.left} 
                y1={valToY(selectedTradeStats.tp)} 
                x2={width - padding.right} 
                y2={valToY(selectedTradeStats.tp)} 
                stroke="#34d399" 
                strokeWidth={1.5} 
                strokeDasharray="4 4" 
              />
              <text x={width - padding.right - 5} y={valToY(selectedTradeStats.tp) - 5} fill="#34d399" fontSize="10" fontWeight="bold" textAnchor="end">
                TP: {selectedTradeStats.tp.toFixed(5)}
              </text>
            </g>
          )}

          {selectedTradeStats && selectedTradeStats.entryPrice && (
            <g>
              <line 
                x1={padding.left} 
                y1={valToY(selectedTradeStats.entryPrice)} 
                x2={width - padding.right} 
                y2={valToY(selectedTradeStats.entryPrice)} 
                stroke="#38bdf8" 
                strokeWidth={1.5} 
                strokeDasharray="2 2" 
              />
              <text x={padding.left + 5} y={valToY(selectedTradeStats.entryPrice) - 5} fill="#38bdf8" fontSize="10" fontWeight="bold">
                ENTRY: {selectedTradeStats.entryPrice.toFixed(5)}
              </text>
            </g>
          )}

          {/* Render Main Price Data: Candlesticks vs Polyline */}
          {chartType === 'ohlc' ? (
            visibleCandles.map((c, i) => {
              const x = idxToX(i);
              const openY = valToY(c.open);
              const closeY = valToY(c.close);
              const highY = valToY(c.high);
              const lowY = valToY(c.low);
              const isUp = c.close >= c.open;
              const color = isUp ? '#10b981' : '#f43f5e';
              const bodyTop = Math.min(openY, closeY);
              const bodyH = Math.max(2, Math.abs(openY - closeY));

              return (
                <g key={`candle-${i}`}>
                  {/* Wick Line */}
                  <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth={1.2} opacity={0.9} />
                  {/* Candle Body */}
                  <rect
                    x={x - candleW / 2}
                    y={bodyTop}
                    width={candleW}
                    height={bodyH}
                    fill={color}
                    stroke={color}
                    strokeWidth={0.8}
                    rx={1}
                  />
                </g>
              );
            })
          ) : (
            <polyline
              fill="none"
              stroke="var(--accent-cyan)"
              strokeWidth={2}
              points={linePoints}
            />
          )}

          {/* Render Trade Overlays (Long ▲, Short ▼, Exit ●) */}
          {tradesOnVisibleCandles.map(({ trade, entryIdx, exitIdx }) => {
            const isLong = trade.size > 0;

            return (
              <g key={`trade-markers-${trade.id}`}>
                {/* Entry Marker */}
                {entryIdx !== undefined && (
                  <g transform={`translate(${idxToX(entryIdx)}, ${valToY(trade.entry_price)})`}>
                    <polygon 
                      points={isLong ? "0,-12 -7,0 7,0" : "0,12 -7,0 7,0"} 
                      fill={isLong ? '#10b981' : '#f43f5e'} 
                      stroke="#ffffff" 
                      strokeWidth={1}
                    />
                    <text 
                      y={isLong ? -16 : 22} 
                      fill={isLong ? '#34d399' : '#f43f5e'} 
                      fontSize="9" 
                      fontWeight="bold" 
                      textAnchor="middle"
                    >
                      {isLong ? `▲ LONG #${trade.id}` : `▼ SHORT #${trade.id}`}
                    </text>
                  </g>
                )}

                {/* Exit Marker */}
                {exitIdx !== undefined && (
                  <g transform={`translate(${idxToX(exitIdx)}, ${valToY(trade.exit_price)})`}>
                    <circle r={5} fill={trade.pnl >= 0 ? '#34d399' : '#f43f5e'} stroke="#0f172a" strokeWidth={1.5} />
                    <text y={-8} fill="#94a3b8" fontSize="8" textAnchor="middle">
                      Exit {trade.pnl >= 0 ? `+$${trade.pnl.toFixed(1)}` : `-$${Math.abs(trade.pnl).toFixed(1)}`}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Chart Legend & Summary */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        fontSize: '0.75rem', 
        color: 'var(--text-muted)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        paddingTop: '0.75rem'
      }}>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#10b981' }}></span>
            Bullish Candle (Up)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: '#f43f5e' }}></span>
            Bearish Candle (Down)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }}></span>
            ▲ Long Entry
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f43f5e' }}></span>
            ▼ Short Entry
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
