export interface PairResponse {
  pairs: string[];
}

export interface FlowchartResponse {
  flowchart: string;
}

export interface StrategyResponse {
  code: string;
}

export interface MetricData {
  start_value: number | null;
  end_value: number | null;
  return_pct: number | null;
  buy_and_hold_return: number | null;
  max_drawdown: number | null;
  sharpe_ratio: number | null;
  sortino_ratio: number | null;
  calmar_ratio: number | null;
  profit_factor: number | null;
  win_rate: number | null;
  total_trades: number | null;
}

export interface Trade {
  id: number;
  size: number;
  entry_price: number;
  exit_price: number;
  entry_time: string;
  exit_time: string;
  pnl: number;
  return_pct: number;
  duration: string;
}

export interface EquityPoint {
  time: string;
  equity: number;
  drawdown: number;
}

export interface BacktestResponse {
  metrics: MetricData;
  trades: Trade[];
  equity_curve: EquityPoint[];
}

export interface DownloadProgress {
  progress: number;
  status: string;
  current_day?: number;
  total_days?: number;
  date?: string;
  is_cached?: boolean;
  candle_count?: number;
  message: string;
}

const API_BASE = '/api';

export async function getPairs(): Promise<PairResponse> {
  const res = await fetch(`${API_BASE}/pairs`);
  if (!res.ok) throw new Error('Failed to fetch currency pairs.');
  return res.json();
}

export async function generateFlowchart(strategyDesc: string, apiKey?: string, model?: string): Promise<FlowchartResponse> {
  const res = await fetch(`${API_BASE}/generate-flowchart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      strategy_desc: strategyDesc, 
      api_key: apiKey || undefined,
      model: model || undefined
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to generate flowchart.');
  }
  return res.json();
}

export async function generateStrategy(strategyDesc: string, apiKey?: string, model?: string, higherTimeframe?: string): Promise<StrategyResponse> {
  const res = await fetch(`${API_BASE}/generate-strategy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      strategy_desc: strategyDesc, 
      api_key: apiKey || undefined,
      model: model || undefined,
      higher_timeframe: higherTimeframe || undefined
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Failed to generate strategy code.');
  }
  return res.json();
}

export async function runBacktest(
  code: string,
  symbol: string,
  startDate: string,
  endDate: string,
  timeframe: string,
  higherTimeframe: string | undefined,
  cash: number,
  commission: number
): Promise<BacktestResponse> {
  const res = await fetch(`${API_BASE}/backtest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      symbol,
      start_date: startDate,
      end_date: endDate,
      timeframe,
      higher_timeframe: higherTimeframe || undefined,
      cash,
      commission,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || 'Backtest failed.');
  }
  return res.json();
}

export async function downloadData(
  symbol: string,
  startDate: string,
  endDate: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<void> {
  const res = await fetch(`${API_BASE}/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, start_date: startDate, end_date: endDate }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'Failed to download data.');
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Response body not readable.');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');

    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim().startsWith('data: ')) {
        try {
          const jsonStr = line.slice(line.indexOf('{'));
          const data: DownloadProgress = JSON.parse(jsonStr);
          onProgress(data);
        } catch (e) {
          console.error('Error parsing SSE stream line:', line, e);
        }
      }
    }
  }
}
