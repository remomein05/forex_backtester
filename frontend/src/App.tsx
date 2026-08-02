import React, { useState, useEffect } from 'react';
import { ShieldAlert, Cpu } from 'lucide-react';
import { 
  getPairs, 
  generateFlowchart, 
  generateStrategy, 
  runBacktest, 
  downloadData 
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

export const App: React.FC = () => {
  // Config state
  const [pairs, setPairs] = useState<string[]>(['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'XAUUSD']);
  const [selectedPair, setSelectedPair] = useState<string>('EURUSD');
  const [isCustomPair, setIsCustomPair] = useState<boolean>(false);
  const [timeframe, setTimeframe] = useState<string>('1h');
  const [higherTimeframe, setHigherTimeframe] = useState<string>('none');
  
  // Date range clamped to 2026
  const [startDate, setStartDate] = useState<string>('2026-01-01');
  const [endDate, setEndDate] = useState<string>('2026-03-31');
  
  const [cash, setCash] = useState<number>(10000);
  const [commission, setCommission] = useState<number>(0.0002);

  // Strategy logic states
  const [strategyDesc, setStrategyDesc] = useState<string>(
    'SMA crossover strategy. Buy long when the 10-period SMA crosses above the 50-period SMA. Sell short (or close long) when the 10-period SMA crosses below the 50-period SMA. Set a 1% stop loss and a 2% take profit on all entries.'
  );
  const [llmProvider, setLlmProvider] = useState<string>('agy_cli');
  const [apiKey, setApiKey] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  
  // Generation & Verification pipeline states
  const [flowchartCode, setFlowchartCode] = useState<string>('');
  const [isFlowchartVerified, setIsFlowchartVerified] = useState<boolean>(false);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  
  // Backtest results
  const [backtestResults, setBacktestResults] = useState<BacktestResponse | null>(null);

  // Loading & Progress states
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [downloadInfo, setDownloadInfo] = useState<DownloadInfo>({
    currentDay: 0,
    totalDays: 0,
    currentDate: '',
    isCached: false,
    candleCount: 0,
    totalCandles: 0,
    elapsedSeconds: 0,
    etaSeconds: null
  });
  const [isDataReady, setIsDataReady] = useState<boolean>(false);
  
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
        // Fail silently and use defaults
      });
  }, []);

  // Action: Download price data from Dukascopy
  const handleDownloadData = async () => {
    setIsDownloading(true);
    setDownloadProgress(0);
    setDownloadStatus('Connecting to Dukascopy feed...');
    setIsDataReady(false);
    setError(null);

    const startTime = Date.now();
    setDownloadInfo({
      currentDay: 0,
      totalDays: 0,
      currentDate: '',
      isCached: false,
      candleCount: 0,
      totalCandles: 0,
      elapsedSeconds: 0,
      etaSeconds: null
    });

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setDownloadInfo(prev => {
        let eta: number | null = null;
        if (prev.totalDays > 0 && prev.currentDay > 0 && prev.currentDay < prev.totalDays) {
          const remainingDays = prev.totalDays - prev.currentDay;
          const secPerDay = elapsed / prev.currentDay;
          eta = Math.max(1, Math.round(remainingDays * secPerDay));
        }
        return {
          ...prev,
          elapsedSeconds: elapsed,
          etaSeconds: eta
        };
      });
    }, 1000);

    try {
      await downloadData(selectedPair, startDate, endDate, (prog) => {
        setDownloadProgress(prog.progress);
        setDownloadStatus(prog.message || prog.status);

        if (prog.current_day !== undefined && prog.total_days !== undefined) {
          setDownloadInfo(prev => ({
            ...prev,
            currentDay: prog.current_day || prev.currentDay,
            totalDays: prog.total_days || prev.totalDays,
            currentDate: prog.date || prev.currentDate,
            isCached: prog.is_cached ?? prev.isCached,
            candleCount: prog.candle_count || 0,
            totalCandles: prev.totalCandles + (prog.candle_count || 0)
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

  // Action: Generate Mermaid flowchart
  const handleGenerateFlowchart = async () => {
    setIsFlowchartLoading(true);
    setIsFlowchartVerified(false);
    setGeneratedCode('');
    setFlowchartCode('');
    setError(null);

    try {
      const res = await generateFlowchart(strategyDesc, apiKey || undefined, selectedModel, llmProvider);
      setFlowchartCode(res.flowchart);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Flowchart generation failed.');
    } finally {
      setIsFlowchartLoading(false);
    }
  };

  // Action: Generate Python Strategy Code
  const handleGenerateStrategyCode = async () => {
    if (!isFlowchartVerified) {
      setError('You must confirm the strategy flowchart before writing code.');
      return;
    }
    
    setIsCodeLoading(true);
    setGeneratedCode('');
    setError(null);

    try {
      const res = await generateStrategy(strategyDesc, apiKey || undefined, selectedModel, higherTimeframe, llmProvider);
      setGeneratedCode(res.code);
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
      setError('Strategy python code is empty.');
      return;
    }
    if (!isDataReady) {
      setError('Please download historical price data first.');
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
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Backtest execution failed.');
    } finally {
      setIsBacktestRunning(false);
    }
  };

  const handleLoadStrategy = (strat: SavedStrategy) => {
    if (strat.description) setStrategyDesc(strat.description);
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

  return (
    <div className="app-container">
      {/* Header Bar */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Cpu size={28} style={{ color: 'var(--accent-cyan)' }} />
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              Forex Strategy Backtester & Compiler
            </h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              AI-Powered Strategy Generation with Dukascopy Tick Precision
            </p>
          </div>
        </div>
      </header>

      {/* Global Error Banner */}
      {error && (
        <div style={{ margin: '1.5rem 1.5rem 0 1.5rem', background: 'var(--color-danger-bg)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '1rem', borderRadius: '8px', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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

      {/* Main Layout Body */}
      <div className="main-layout">
        
        {/* Left Control Sidebar */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
        </aside>

        {/* Right Dashboard and Workspace Panels */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Top Panel: Strategy and Flowchart Side-by-Side */}
          <div className="workspace-grid">
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
            
            <FlowchartViewer
              chartCode={flowchartCode}
              isVerified={isFlowchartVerified}
              onVerify={setIsFlowchartVerified}
              onRegenerate={handleGenerateFlowchart}
              isLoading={isFlowchartLoading}
            />
          </div>

          {/* Bottom Panel: Backtest Analytics Dashboard */}
          <Dashboard
            metrics={backtestResults ? backtestResults.metrics : null}
            equityCurve={backtestResults ? backtestResults.equity_curve : []}
            isLoading={isBacktestRunning}
          />

          {/* Trade Table log */}
          {backtestResults && backtestResults.trades && (
            <TradeTable trades={backtestResults.trades} />
          )}

        </main>
      </div>
    </div>
  );
};
export default App;
