import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, Download } from 'lucide-react';
import type { Trade } from '../api';

interface TradeTableProps {
  trades: Trade[];
}

export const TradeTable: React.FC<TradeTableProps> = ({ trades }) => {
  const [filter, setFilter] = useState<'all' | 'profit' | 'loss'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  const filteredTrades = trades.filter((t) => {
    if (filter === 'profit') return t.pnl > 0;
    if (filter === 'loss') return t.pnl <= 0;
    return true;
  });

  const totalPages = Math.max(Math.ceil(filteredTrades.length / itemsPerPage), 1);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTrades = filteredTrades.slice(startIndex, startIndex + itemsPerPage);

  const formatCurrency = (val: number) => {
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(val));
    return val >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleExportCSV = () => {
    if (trades.length === 0) return;
    const headers = ['ID', 'Type', 'Entry Time', 'Entry Price', 'Exit Time', 'Exit Price', 'Duration', 'Return %', 'PnL ($)'];
    const rows = trades.map(t => [
      t.id,
      t.size > 0 ? 'Buy (Long)' : 'Sell (Short)',
      t.entry_time,
      t.entry_price,
      t.exit_time,
      t.exit_price,
      `"${t.duration}"`,
      t.return_pct.toFixed(2),
      t.pnl.toFixed(2)
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `trade_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Executed Trade Log</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Detailed list of all backtest transaction logs</p>
        </div>
        
        {/* Outcome Filter & CSV Export */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={handleExportCSV}
            disabled={trades.length === 0}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', gap: '0.35rem', borderColor: 'var(--accent-cyan)' }}
            title="Export trade log to CSV"
          >
            <Download size={14} style={{ color: 'var(--accent-cyan)' }} /> Export CSV
          </button>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '2px', borderRadius: '6px' }}>
              <button
                onClick={() => { setFilter('all'); setCurrentPage(1); }}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: 'none', background: filter === 'all' ? 'var(--bg-tertiary)' : 'transparent', color: filter === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer' }}
              >
                All ({trades.length})
              </button>
              <button
                onClick={() => { setFilter('profit'); setCurrentPage(1); }}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: 'none', background: filter === 'profit' ? 'var(--bg-tertiary)' : 'transparent', color: filter === 'profit' ? 'var(--text-primary)' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Profitable ({trades.filter(t => t.pnl > 0).length})
              </button>
              <button
                onClick={() => { setFilter('loss'); setCurrentPage(1); }}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', border: 'none', background: filter === 'loss' ? 'var(--bg-tertiary)' : 'transparent', color: filter === 'loss' ? 'var(--text-primary)' : 'var(--text-secondary)', borderRadius: '4px', cursor: 'pointer' }}
              >
                Losses ({trades.filter(t => t.pnl <= 0).length})
              </button>
            </div>
          </div>
        </div>
      </div>

      {trades.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          No trades executed. Modify your strategy entry conditions to generate transaction logs.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflow: 'hidden' }}>
          {/* Responsive Table wrapper */}
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left', minWidth: '700px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>ID</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Type</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Entry Time / Price</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Exit Time / Price</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Duration</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Return %</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>PnL</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrades.map((trade) => {
                  const isProfit = trade.pnl > 0;
                  const pnlColor = isProfit ? 'var(--color-success)' : 'var(--color-danger)';
                  const direction = trade.size > 0 ? 'Buy (Long)' : 'Sell (Short)';
                  const directionBg = trade.size > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)';
                  const directionText = trade.size > 0 ? 'var(--color-success)' : 'var(--color-danger)';

                  return (
                    <tr key={trade.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                        {trade.id}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <span style={{ background: directionBg, color: directionText, padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          {direction}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <div>{formatDate(trade.entry_time)}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>@{trade.entry_price.toFixed(5)}</div>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem' }}>
                        <div>{formatDate(trade.exit_time)}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>@{trade.exit_price.toFixed(5)}</div>
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                        {trade.duration}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600, color: pnlColor }}>
                        {trade.return_pct.toFixed(2)}%
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 700, color: pnlColor }}>
                        {formatCurrency(trade.pnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-glass)', paddingTop: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredTrades.length)} of {filteredTrades.length} trades
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.5rem' }}
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem 0.5rem' }}
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default TradeTable;
