import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, TrendingUp, BarChart2, ShieldAlert, Award, Calendar } from 'lucide-react';
import type { MetricData, EquityPoint } from '../api';

interface DashboardProps {
  metrics: MetricData | null;
  equityCurve: EquityPoint[];
  isLoading: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ metrics, equityCurve, isLoading }) => {
  const [chartType, setChartType] = useState<'equity' | 'drawdown'>('equity');

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '$--';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  const formatPercent = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '--%';
    return `${val.toFixed(2)}%`;
  };

  const formatNumber = (val: number | null | undefined, decimals: number = 2) => {
    if (val === null || val === undefined) return '--';
    return val.toFixed(decimals);
  };

  if (isLoading) {
    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div className="pulse" style={{ width: '40px', height: '40px', border: '3px solid var(--accent-cyan)', borderTopColor: 'transparent', borderRadius: '50%' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Calculating strategy performance...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', color: 'var(--text-secondary)' }}>
        <TrendingUp size={48} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
        <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>No Backtest Results</h4>
        <p style={{ fontSize: '0.9rem', textAlign: 'center', maxWidth: '380px' }}>
          Once your data is fetched and your flowchart is confirmed, execute the backtest to view performance analytics.
        </p>
      </div>
    );
  }

  // Determine return color
  const returnVal = metrics.return_pct || 0;
  const returnColor = returnVal > 0 ? 'var(--color-success)' : returnVal < 0 ? 'var(--color-danger)' : 'var(--text-primary)';

  // Format date for chart X-Axis
  const formattedChartData = equityCurve.map(point => ({
    ...point,
    shortTime: new Date(point.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit' })
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* Metric Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        {/* End Equity */}
        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.1)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Ending Balance</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{formatCurrency(metrics.end_value)}</span>
          </div>
        </div>

        {/* Net Return */}
        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-purple)' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Net Return</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: returnColor }}>{formatPercent(metrics.return_pct)}</span>
          </div>
        </div>

        {/* Win Rate */}
        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-success)' }}>
            <Award size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Win Rate</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{formatPercent(metrics.win_rate)}</span>
          </div>
        </div>

        {/* Max Drawdown */}
        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-danger)' }}>
            <ShieldAlert size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Max Drawdown</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-danger)' }}>{formatPercent(metrics.max_drawdown)}</span>
          </div>
        </div>

        {/* Sharpe / Profit Factor */}
        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-warning)' }}>
            <BarChart2 size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Sharpe / PF</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>
              {formatNumber(metrics.sharpe_ratio)} / {formatNumber(metrics.profit_factor)}
            </span>
          </div>
        </div>

        {/* Total Trades */}
        <div className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
            <Calendar size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>Total Trades</span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>{metrics.total_trades ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Equity Chart panel */}
      <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Performance Curve</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Visual balance analysis over active range</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '2px', borderRadius: '6px' }}>
            <button 
              onClick={() => setChartType('equity')}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', border: 'none', background: chartType === 'equity' ? 'var(--bg-tertiary)' : 'transparent', color: chartType === 'equity' ? 'var(--text-primary)' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              Equity Curve
            </button>
            <button 
              onClick={() => setChartType('drawdown')}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', border: 'none', background: chartType === 'drawdown' ? 'var(--bg-tertiary)' : 'transparent', color: chartType === 'drawdown' ? 'var(--text-primary)' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              Drawdown
            </button>
          </div>
        </div>

        <div style={{ width: '100%', height: '350px', marginTop: '1rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formattedChartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-purple)" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="var(--accent-purple)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="shortTime" 
                stroke="var(--text-muted)" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
              />
              <YAxis 
                stroke="var(--text-muted)" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false}
                domain={chartType === 'equity' ? ['auto', 'auto'] : [0, 'auto']}
                tickFormatter={(tick) => chartType === 'equity' ? `$${tick}` : `${tick}%`}
              />
              <Tooltip 
                contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', fontSize: '0.85rem' }}
                labelStyle={{ color: 'var(--text-secondary)', fontWeight: 600 }}
                formatter={(value: any) => [
                  chartType === 'equity' ? formatCurrency(Number(value)) : formatPercent(Number(value)),
                  chartType === 'equity' ? 'Equity' : 'Drawdown'
                ]}
              />
              {chartType === 'equity' ? (
                <Area 
                  type="monotone" 
                  dataKey="equity" 
                  stroke="var(--accent-purple)" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorEquity)" 
                />
              ) : (
                <Area 
                  type="monotone" 
                  dataKey="drawdown" 
                  stroke="var(--color-danger)" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorDrawdown)" 
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
export default Dashboard;
