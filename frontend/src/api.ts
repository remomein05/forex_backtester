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
  sl?: number | null;
  tp?: number | null;
}

export interface EquityPoint {
  time: string;
  equity: number;
  drawdown: number;
}

export interface CandlePoint {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestResponse {
  metrics: MetricData;
  trades: Trade[];
  equity_curve: EquityPoint[];
  candles?: CandlePoint[];
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

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return json.detail || json.message || fallback;
    } catch {
      return text || fallback;
    }
  } catch {
    return fallback;
  }
}

export async function getPairs(): Promise<PairResponse> {
  const res = await fetch(`${API_BASE}/pairs`);
  if (!res.ok) {
    const msg = await parseErrorMessage(res, 'Failed to fetch currency pairs.');
    throw new Error(msg);
  }
  return res.json();
}

export async function generateFlowchart(strategyDesc: string, apiKey?: string, model?: string, provider?: string, effort?: string): Promise<FlowchartResponse> {
  const res = await fetch(`${API_BASE}/generate-flowchart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      strategy_desc: strategyDesc, 
      api_key: apiKey || undefined,
      model: model || undefined,
      provider: provider || 'agy_cli',
      effort: effort || 'high'
    }),
  });
  if (!res.ok) {
    const msg = await parseErrorMessage(res, 'Failed to generate flowchart.');
    throw new Error(msg);
  }
  return res.json();
}

export async function generateStrategy(strategyDesc: string, apiKey?: string, model?: string, higherTimeframe?: string, provider?: string, effort?: string): Promise<StrategyResponse> {
  const res = await fetch(`${API_BASE}/generate-strategy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      strategy_desc: strategyDesc, 
      api_key: apiKey || undefined,
      model: model || undefined,
      higher_timeframe: higherTimeframe || undefined,
      provider: provider || 'agy_cli',
      effort: effort || 'high'
    }),
  });
  if (!res.ok) {
    const msg = await parseErrorMessage(res, 'Failed to generate strategy code.');
    throw new Error(msg);
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
    const msg = await parseErrorMessage(res, 'Backtest failed.');
    throw new Error(msg);
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
          if (data.status === 'error') {
            throw new Error(data.message || 'Data download failed on server.');
          }
          onProgress(data);
        } catch (e: any) {
          if (e.message && (e.message.includes('failed') || e.message.includes('Error:'))) {
            throw e;
          }
          console.error('Error parsing SSE stream line:', line, e);
        }
      }
    }
  }
}

export interface SavedStrategy {
  id?: string;
  name: string;
  description: string;
  flowchart_code?: string;
  python_code?: string;
  symbol?: string;
  timeframe?: string;
  higher_timeframe?: string;
  created_at?: string;
  updated_at?: string;
}

export async function getSavedStrategies(): Promise<{ strategies: SavedStrategy[] }> {
  const res = await fetch(`${API_BASE}/strategies`);
  if (!res.ok) {
    const msg = await parseErrorMessage(res, 'Failed to fetch saved strategies.');
    throw new Error(msg);
  }
  return res.json();
}

export async function saveStrategy(strategy: SavedStrategy): Promise<{ status: string; strategy: SavedStrategy }> {
  const res = await fetch(`${API_BASE}/strategies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(strategy),
  });
  if (!res.ok) {
    const msg = await parseErrorMessage(res, 'Failed to save strategy.');
    throw new Error(msg);
  }
  return res.json();
}

export async function deleteStrategy(strategyId: string): Promise<{ status: string; deleted_id: string }> {
  const res = await fetch(`${API_BASE}/strategies/${strategyId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const msg = await parseErrorMessage(res, 'Failed to delete strategy.');
    throw new Error(msg);
  }
  return res.json();
}
