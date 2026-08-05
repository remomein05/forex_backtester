import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Cpu, 
  Home, 
  Layers, 
  Play, 
  CandlestickChart, 
  Code, 
  GitFork, 
  ArrowRight,
  Database,
  Copy,
  Check,
  Zap
} from 'lucide-react';
import { 
  getPairs, 
  generateFlowchart, 
  generateStrategy, 
  runBacktest, 
  downloadData,
  saveStrategy
} from './api';
import type { 
  BacktestResponse,
  SavedStrategy
} from './api';
import ControlPanel, { type DownloadInfo } from './components/ControlPanel';
import StrategyEditor from './components/StrategyEditor';
import FlowchartViewer from './components/FlowchartViewer';
import Dashboard from './components/Dashboard';
import TradeTable from './components/TradeTable';
import ChartViewer from './components/ChartViewer';

export type TabType = 'home' | 'strategy' | 'backtest' | 'chart';

export const App: React.FC = () => {
  // Navigation tab state
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [backtestSubView, setBacktestSubView] = useState<'code' | 'flowchart' | 'none'>('none');
  const [isCopiedCode, setIsCopiedCode] = useState<boolean>(false);

  // Config state
  const [pairs, setPairs] = useState<string[]>(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'XAUUSD']);
  
  const [selectedPair, setSelectedPairState] = useState<string>(() => {
    return localStorage.getItem('forex_backtester_selected_pair') || 'EURUSD';
  });
  const setSelectedPair = (pair: string) => {
    setSelectedPairState(pair);
    localStorage.setItem('forex_backtester_selected_pair', pair);
  };

  const [isCustomPair, setIsCustomPair] = useState<boolean>(false);
  
  const [timeframe, setTimeframeState] = useState<string>(() => {
    return localStorage.getItem('forex_backtester_timeframe') || '1h';
  });
  const setTimeframe = (tf: string) => {
    setTimeframeState(tf);
    localStorage.setItem('forex_backtester_timeframe', tf);
  };

  const [higherTimeframe, setHigherTimeframe] = useState<string>('none');
  
  // Date range initialized with default current date or persisted localStorage value
  const [startDate, setStartDateState] = useState<string>(() => {
    const saved = localStorage.getItem('forex_backtester_start_date');
    if (saved) return saved;
    return '2026-01-20';
  });

  const setStartDate = (date: string) => {
    setStartDateState(date);
    localStorage.setItem('forex_backtester_start_date', date);
  };

  const [endDate, setEndDateState] = useState<string>(() => {
    return localStorage.getItem('forex_backtester_end_date') || '2026-08-03';
  });
  const setEndDate = (date: string) => {
    setEndDateState(date);
    localStorage.setItem('forex_backtester_end_date', date);
  };
  
  const [cash, setCash] = useState<number>(10000);
  const [commission, setCommission] = useState<number>(0.0002);

  // Strategy logic states
  const [strategyDesc, setStrategyDesc] = useState<string>(
    'SMA crossover strategy. Buy long when the 10-period SMA crosses above the 50-period SMA. Sell short (or close long) when the 10-period SMA crosses below the 50-period SMA. Always risk exactly 2% of the account balance per trade (SL set at 2% price distance, TP set at 4% to 5% price distance for a 1:2 risk-to-reward ratio).'
  );
  const [llmProvider, setLlmProvider] = useState<string>('agy_cli');
  const [apiKey, setApiKey] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-pro');

  // Strategy Cache tracking state
  const [activeStrategyId, setActiveStrategyId] = useState<string | null>(null);
  const [activeStrategyName, setActiveStrategyName] = useState<string | null>(null);
  const [lastGeneratedDesc, setLastGeneratedDesc] = useState<string>('');
  
  // Generation & Verification pipeline states
  const [flowchartCode, setFlowchartCode] = useState<string>('');
  const [isFlowchartVerified, setIsFlowchartVerified] = useState<boolean>(false);
  const [generatedCode, setGeneratedCode] = useState<string>('');

  // Auto-save generated flowchart and python code to disk cache
  const autoSaveCurrentStrategy = async (flowchart: string, code: string) => {
    if (!strategyDesc.trim()) return;
    try {
      const payload: SavedStrategy = {
        id: activeStrategyId || undefined,
        name: activeStrategyName || (strategyDesc.trim().slice(0, 30) + ' Strategy'),
        description: strategyDesc.trim(),
        flowchart_code: flowchart,
        python_code: code,
        symbol: selectedPair,
        timeframe: timeframe,
        higher_timeframe: higherTimeframe
      };
      const res = await saveStrategy(payload);
      if (res?.strategy?.id) {
        setActiveStrategyId(res.strategy.id);
        setActiveStrategyName(res.strategy.name);
      }
    } catch (e) {
      console.warn('Auto-save strategy cache warning:', e);
    }
  };
  
  // Backtest results
  const [backtestResults, setBacktestResults] = useState<BacktestResponse | null>(null);

  // Loading & Progress states
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo>({
    candleCount: 0,
    dateFrom: '',
    dateTo: '',
    elapsedSeconds: 0
  });
  const [isDataReady, setIsDataReady] = useState<boolean>(true);
  
  const [isFlowchartLoading, setIsFlowchartLoading] = useState<boolean>(false);
  const [isCodeLoading, setIsCodeLoading] = useState<boolean>(false);
  const [isBacktestRunning, setIsBacktestRunning] = useState<boolean>(false);
  
  const [error, setError] = useState<string | null>(null);

  // Fetch supported pairs on mount
  useEffect(() => {
    getPairs()
      .then(res => {
        if (res.pairs && res.pairs.length > 0) {
          setPairs(res.pairs);
        }
      })
      .catch(err => {
        console.error('Error fetching currency pairs:', err);
      });
  }, []);

  // Action: Download price data from ForexSB
  const handleDownloadData = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStatus('Starting download...');
    setDownloadInfo({
      candleCount: 0,
      dateFrom: '',
      dateTo: '',
      elapsedSeconds: 0
    });
    setError(null);

    const startTime = Date.now();
    const timer = setInterval(() => {
      setDownloadInfo(prev => ({
        ...prev,
        elapsedSeconds: Math.floor((Date.now() - startTime) / 1000)
      }));
    }, 1000);

    try {
      await downloadData(selectedPair, startDate, endDate, (prog: any) => {
        setDownloadProgress(prog.progress || 0);
        if (prog.message) setDownloadStatus(prog.message);

        if (prog.candle_count !== undefined) {
          setDownloadInfo(prev => ({
            ...prev,
            candleCount: prog.candle_count || 0,
            dateFrom: prog.date_from || prev.dateFrom,
            dateTo: prog.date_to || prev.dateTo
          }));
        }
      });
      setIsDataReady(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to download and parse price data.');
    } finally {
      clearInterval(timer);
      setIsDownloading(false);
    }
  };

  // Action: Generate Mermaid flowchart (Uses Cache if unedited, bypasses LLM call)
  const handleGenerateFlowchart = async (forceRegenerate: boolean = false) => {
    // If flowchart already exists and strategy description has NOT been edited, load from cache without LLM call!
    if (!forceRegenerate && flowchartCode && strategyDesc.trim() === lastGeneratedDesc.trim()) {
      setIsFlowchartVerified(true);
      return;
    }

    setIsFlowchartLoading(true);
    setIsFlowchartVerified(false);
    setError(null);

    try {
      const res = await generateFlowchart(strategyDesc, apiKey || undefined, selectedModel, llmProvider);
      setFlowchartCode(res.flowchart);
      setLastGeneratedDesc(strategyDesc.trim());
      // Auto-save generated flowchart to strategy cache
      await autoSaveCurrentStrategy(res.flowchart, generatedCode);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Flowchart generation failed.');
    } finally {
      setIsFlowchartLoading(false);
    }
  };

  // Action: Generate Python Strategy Code (Uses Cache if unedited, bypasses LLM call)
  const handleGenerateStrategyCode = async (forceRegenerate: boolean = false) => {
    if (!isFlowchartVerified) {
      setError('You must confirm the strategy flowchart before writing code.');
      return;
    }

    // If python code already exists and strategy description has NOT been edited, load from cache without LLM call!
    if (!forceRegenerate && generatedCode && strategyDesc.trim() === lastGeneratedDesc.trim()) {
      return;
    }
    
    setIsCodeLoading(true);
    setError(null);

    try {
      const res = await generateStrategy(strategyDesc, apiKey || undefined, selectedModel, higherTimeframe, llmProvider);
      setGeneratedCode(res.code);
      setLastGeneratedDesc(strategyDesc.trim());
      // Auto-save generated python code to strategy cache
      await autoSaveCurrentStrategy(flowchartCode, res.code);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Strategy code generation failed.');
    } finally {
      setIsCodeLoading(false);
    }
  };

  // Action: Execute Backtest
  const handleRunBacktest = async () => {
    if (!generatedCode.trim()) {
      setError('Strategy python code is empty. Please generate strategy code first in the Strategy tab.');
      return;
    }
    if (!isDataReady) {
      setError('Please download historical price data first in the Home tab.');
      return;
    }

    setIsBacktestRunning(true);
    setError(null);

    try {
      const results = await runBacktest(
        generatedCode,
        selectedPair,
        startDate,
        endDate,
        timeframe,
        higherTimeframe,
        cash,
        commission
      );
      setBacktestResults(results);
      // Auto-switch to Backtest tab when execution finishes
      setActiveTab('backtest');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Backtest execution failed.');
    } finally {
      setIsBacktestRunning(false);
    }
  };

  const handleLoadStrategy = (strat: SavedStrategy) => {
    if (strat.id) setActiveStrategyId(strat.id);
    if (strat.name) setActiveStrategyName(strat.name);
    const desc = strat.description || '';
    setStrategyDesc(desc);
    setLastGeneratedDesc(desc);

    if (strat.flowchart_code) {
      setFlowchartCode(strat.flowchart_code);
      setIsFlowchartVerified(true);
    } else {
      setFlowchartCode('');
      setIsFlowchartVerified(false);
    }
    if (strat.python_code) {
      setGeneratedCode(strat.python_code);
    } else {
      setGeneratedCode('');
    }
    if (strat.symbol) setSelectedPair(strat.symbol);
    if (strat.timeframe) setTimeframe(strat.timeframe);
    if (strat.higher_timeframe) setHigherTimeframe(strat.higher_timeframe);
  };

  const handleCopyCode = () => {
    if (!generatedCode) return;
    navigator.clipboard.writeText(generatedCode);
    setIsCopiedCode(true);
    setTimeout(() => setIsCopiedCode(false), 2000);
  };

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Cpu size={28} style={{ color: 'var(--accent-cyan)' }} />
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Forex Strategy Backtester & Compiler
            </h1>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
              AI-Powered Strategy Compiler · Powered by ForexSB Bar Data
            </p>
          </div>
        </div>

        {/* Header Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ 
            fontSize: '0.75rem', 
            padding: '0.3rem 0.65rem', 
            borderRadius: '20px', 
            background: isDataReady ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', 
            border: `1px solid ${isDataReady ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            color: isDataReady ? '#34d399' : '#fbbf24',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}>
            <Database size={12} /> {isDataReady ? `${selectedPair} Data Ready` : 'Data Needed'}
          </span>

          <span style={{ 
            fontSize: '0.75rem', 
            padding: '0.3rem 0.65rem', 
            borderRadius: '20px', 
            background: generatedCode ? 'rgba(6, 182, 212, 0.15)' : 'rgba(255, 255, 255, 0.06)', 
            border: `1px solid ${generatedCode ? 'rgba(6, 182, 212, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
            color: generatedCode ? '#38bdf8' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}>
            <Code size={12} /> {generatedCode ? 'Strategy Compiled' : 'No Code'}
          </span>
        </div>
      </header>

      {/* 4-Tab Navigation Bar */}
      <nav className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <Home size={18} />
          <span>Home</span>
          <span className="tab-badge">Config</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'strategy' ? 'active' : ''}`}
          onClick={() => setActiveTab('strategy')}
        >
          <Layers size={18} />
          <span>Strategy</span>
          <span className="tab-badge">Compiler</span>
        </button>

        <button
          className={`tab-btn ${activeTab === 'backtest' ? 'active' : ''}`}
          onClick={() => setActiveTab('backtest')}
        >
          <Play size={18} />
          <span>Backtest</span>
          {backtestResults && <span className="tab-badge" style={{ background: '#10b981', color: '#0f172a' }}>Results</span>}
        </button>

        <button
          className={`tab-btn ${activeTab === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveTab('chart')}
        >
          <CandlestickChart size={18} />
          <span>Chart</span>
          {backtestResults?.trades && <span className="tab-badge">{backtestResults.trades.length} Trades</span>}
        </button>
      </nav>

      {/* Global Error Banner */}
      {error && (
        <div style={{ margin: '1rem 1.5rem 0 1.5rem', background: 'var(--color-danger-bg)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '0.85rem 1rem', borderRadius: '8px', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <ShieldAlert size={20} style={{ color: 'var(--color-danger)' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{error}</span>
          <button 
            onClick={() => setError(null)} 
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Tab Content View */}
      <main style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', flex: 1 }}>
        
        {/* ================= TAB 1: HOME ================= */}
        {activeTab === 'home' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', alignItems: 'start' }}>
            {/* Backtester Config Panel */}
            <div>
              <ControlPanel
                pairs={pairs}
                selectedPair={selectedPair}
                setSelectedPair={setSelectedPair}
                isCustomPair={isCustomPair}
                setIsCustomPair={setIsCustomPair}
                timeframe={timeframe}
                setTimeframe={setTimeframe}
                higherTimeframe={higherTimeframe}
                setHigherTimeframe={setHigherTimeframe}
                startDate={startDate}
                setStartDate={setStartDate}
                endDate={endDate}
                setEndDate={setEndDate}
                cash={cash}
                setCash={setCash}
                commission={commission}
                setCommission={setCommission}
                onDownloadData={handleDownloadData}
                isDownloading={isDownloading}
                downloadProgress={downloadProgress}
                downloadStatus={downloadStatus}
                downloadInfo={downloadInfo}
                isDataReady={isDataReady}
              />
            </div>

            {/* Home Sidebar Overview / Quick Workflow Guide */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div className="card">
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#f8fafc' }}>
                  <Zap size={18} style={{ color: 'var(--accent-cyan)' }} /> Strategy Workflow Guide
                </h3>
                <ol style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <li>
                    <strong style={{ color: '#f8fafc' }}>Home Tab (Backtester Config):</strong> Select currency pair, date range, timeframe, and click <em>Fetch Price Data</em> to download bar data from ForexSB.
                  </li>
                  <li>
                    <strong style={{ color: '#f8fafc' }}>Strategy Tab (Workspace):</strong> Describe your forex trading logic in plain English, select model runtime, generate & verify the flowchart, then generate Python code.
                  </li>
                  <li>
                    <strong style={{ color: '#f8fafc' }}>Backtest Tab:</strong> Click <em>Execute Backtest</em> to run the strategy against historical bar data, inspect net return, win rate, and drawdown.
                  </li>
                  <li>
                    <strong style={{ color: '#f8fafc' }}>Chart Tab:</strong> Analyze entry markers, Stop Loss (SL) levels, and Take Profit (TP) levels visually on the price chart.
                  </li>
                </ol>
              </div>

              {/* Status Summary Widget */}
              <div className="card" style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 0.75rem 0', color: 'var(--text-muted)' }}>
                  Current System Status
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Target Symbol:</span>
                    <strong style={{ color: 'var(--accent-cyan)' }}>{selectedPair}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Timeframe:</span>
                    <strong style={{ color: '#f8fafc' }}>{timeframe.toUpperCase()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Date Range:</span>
                    <span style={{ color: '#f8fafc' }}>{startDate} to {endDate}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Initial Capital:</span>
                    <span style={{ color: '#34d399', fontWeight: 600 }}>${cash.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Price Data Feed:</span>
                    <span style={{ color: isDataReady ? '#34d399' : '#fbbf24' }}>
                      {isDataReady ? '✓ Loaded (ForexSB)' : 'Pending Download'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('strategy')}
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '1rem', fontSize: '0.85rem', gap: '0.4rem', justifyContent: 'center' }}
                >
                  Proceed to Strategy Tab <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: STRATEGY ================= */}
        {activeTab === 'strategy' && (
          <div className="workspace-grid">
            {/* Strategy Workspace */}
            <StrategyEditor
              strategyDesc={strategyDesc}
              setStrategyDesc={setStrategyDesc}
              llmProvider={llmProvider}
              setLlmProvider={setLlmProvider}
              apiKey={apiKey}
              setApiKey={setApiKey}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              flowchartCode={flowchartCode}
              isFlowchartVerified={isFlowchartVerified}
              setIsFlowchartVerified={setIsFlowchartVerified}
              generatedCode={generatedCode}
              setGeneratedCode={setGeneratedCode}
              onGenerateFlowchart={handleGenerateFlowchart}
              onGenerateStrategyCode={handleGenerateStrategyCode}
              onRunBacktest={handleRunBacktest}
              onLoadStrategy={handleLoadStrategy}
              isFlowchartLoading={isFlowchartLoading}
              isCodeLoading={isCodeLoading}
              isBacktestRunning={isBacktestRunning}
              isDataReady={isDataReady}
            />
            
            {/* Strategy Flowchart */}
            <FlowchartViewer
              chartCode={flowchartCode}
              isVerified={isFlowchartVerified}
              onVerify={setIsFlowchartVerified}
              onRegenerate={handleGenerateFlowchart}
              isLoading={isFlowchartLoading}
            />
          </div>
        )}

        {/* ================= TAB 3: BACKTEST ================= */}
        {activeTab === 'backtest' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Backtest Control & Code Inspection Toolbar */}
            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Play size={20} style={{ color: 'var(--accent-cyan)' }} /> Backtest Execution & Analytics
                </h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                  Symbol: <strong>{selectedPair}</strong> | Timeframe: <strong>{timeframe.toUpperCase()}</strong> | Range: <strong>{startDate} to {endDate}</strong> | Capital: <strong>${cash.toLocaleString()}</strong>
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {/* View Flowchart Option */}
                <button
                  onClick={() => setBacktestSubView(backtestSubView === 'flowchart' ? 'none' : 'flowchart')}
                  className="btn"
                  style={{ 
                    fontSize: '0.8rem', 
                    padding: '0.45rem 0.8rem', 
                    background: backtestSubView === 'flowchart' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.06)',
                    color: backtestSubView === 'flowchart' ? 'var(--accent-cyan)' : '#f8fafc',
                    gap: '0.35rem' 
                  }}
                >
                  <GitFork size={14} /> {backtestSubView === 'flowchart' ? 'Hide Flowchart' : 'View Flowchart'}
                </button>

                {/* View Generated Python Code Option */}
                <button
                  onClick={() => setBacktestSubView(backtestSubView === 'code' ? 'none' : 'code')}
                  className="btn"
                  style={{ 
                    fontSize: '0.8rem', 
                    padding: '0.45rem 0.8rem', 
                    background: backtestSubView === 'code' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.06)',
                    color: backtestSubView === 'code' ? 'var(--accent-purple)' : '#f8fafc',
                    gap: '0.35rem' 
                  }}
                >
                  <Code size={14} /> {backtestSubView === 'code' ? 'Hide Python Code' : 'View Python Code'}
                </button>
              </div>
            </div>

            {/* Optional Collapsible Sub-View: Strategy Flowchart */}
            {backtestSubView === 'flowchart' && (
              <div className="card">
                <FlowchartViewer
                  chartCode={flowchartCode}
                  isVerified={isFlowchartVerified}
                  onVerify={setIsFlowchartVerified}
                  onRegenerate={handleGenerateFlowchart}
                  isLoading={isFlowchartLoading}
                />
              </div>
            )}

            {/* Optional Collapsible Sub-View: Generated Python Code Editor */}
            {backtestSubView === 'code' && (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Code size={16} style={{ color: 'var(--accent-purple)' }} /> Generated Strategy Python Code (backtesting.py)
                  </h3>
                  <button
                    onClick={handleCopyCode}
                    className="btn"
                    style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', gap: '0.3rem', background: 'rgba(255,255,255,0.06)' }}
                  >
                    {isCopiedCode ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
                    {isCopiedCode ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <textarea
                  rows={12}
                  value={generatedCode}
                  onChange={(e) => setGeneratedCode(e.target.value)}
                  style={{ 
                    width: '100%', 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '0.82rem', 
                    background: '#090d16', 
                    color: '#e2e8f0', 
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    padding: '0.75rem'
                  }}
                  placeholder="# Generated strategy Python code will appear here..."
                />
              </div>
            )}

            {/* Backtest Analytics Dashboard (Metrics & Equity Curve) */}
            <Dashboard
              metrics={backtestResults ? backtestResults.metrics : null}
              equityCurve={backtestResults ? backtestResults.equity_curve : []}
              isLoading={isBacktestRunning}
            />

            {/* Trades History Table */}
            {backtestResults && backtestResults.trades && (
              <TradeTable trades={backtestResults.trades} />
            )}
          </div>
        )}

        {/* ================= TAB 4: CHART ================= */}
        {activeTab === 'chart' && (
          <ChartViewer
            candles={backtestResults?.candles}
            trades={backtestResults?.trades}
            symbol={selectedPair}
            timeframe={timeframe}
          />
        )}

      </main>
    </div>
  );
};

export default App;
