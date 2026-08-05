import sys
import os
import math
import pandas as pd
import numpy as np
import backtesting
from backtesting import Backtest, Strategy

def clean_value(val):
    """Converts numpy types and NaNs/Infs to JSON-serializable types."""
    if val is None:
        return None
    elif isinstance(val, (np.integer, np.int64, np.int32)):
        return int(val)
    elif isinstance(val, (float, np.floating, np.float64, np.float32)):
        if math.isnan(val) or math.isinf(val):
            return None
        return float(val)
    elif isinstance(val, pd.Timestamp):
        return val.isoformat()
    elif isinstance(val, (str, bool, int, list, dict)):
        return val
    else:
        return str(val)

import re

def sanitize_strategy_code(code_str: str) -> str:
    """
    Sanitizes strategy code by:
    1. Removing markdown fences.
    2. Converting local indicator assignments in init() (e.g., `sma = self.I(...)`) to instance attributes (`self.sma = self.I(...)`).
    3. Updating un-prefixed references to registered indicators in next() (e.g. `sma[-1]` -> `self.sma[-1]`).
    """
    if not code_str:
        return code_str

    code = re.sub(r'```python\s*', '', code_str, flags=re.IGNORECASE)
    code = re.sub(r'```\s*', '', code).strip()

    # 1. Convert local indicator assignments in init() to self.<var>
    def fix_init_assignment(match):
        indent = match.group(1)
        var_name = match.group(2)
        rest = match.group(3)
        if var_name.startswith('self.'):
            return match.group(0)
        return f'{indent}self.{var_name} = {rest}'

    code = re.sub(
        r'(\n[ \t]+)([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(self\.I\s*\()',
        fix_init_assignment,
        code
    )

    # 2. Identify all self.<attr> defined with self.I
    defined_attrs = set(re.findall(r'self\.([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*self\.I', code))

    # 3. Replace un-prefixed references to those attributes in indexing or crossover calls
    for attr in defined_attrs:
        pattern_bracket = r'(?<![\w\.])' + re.escape(attr) + r'(\s*\[)'
        code = re.sub(pattern_bracket, r'self.' + attr + r'\1', code)

        pattern_cross1 = r'(\bcrossover\(\s*)' + re.escape(attr) + r'(\s*,)'
        code = re.sub(pattern_cross1, r'\1self.' + attr + r'\2', code)
        pattern_cross2 = r'(\bcrossover\([^,]+,\s*)' + re.escape(attr) + r'(\s*\))'
        code = re.sub(pattern_cross2, r'\1self.' + attr + r'\2', code)

    return code


def run_backtest_from_code(code_str: str, df: pd.DataFrame, cash: float = 10000.0, commission: float = 0.0002) -> dict:
    """
    Executes generated strategy code dynamically and runs a backtest on df.
    """
    # Preprocess/sanitize generated strategy code
    code_str = sanitize_strategy_code(code_str)

    # Expose helper indicators that the LLM may reference
    def SMA(array, n):
        return pd.Series(array).rolling(n).mean()

    def EMA(array, n):
        return pd.Series(array).ewm(span=n, adjust=False).mean()

    def RSI(array, period=14):
        delta = pd.Series(array).diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / (loss + 1e-9)
        return 100 - (100 / (1 + rs))

    def ATR(high, low, close, period=14):
        h, l, c = pd.Series(high), pd.Series(low), pd.Series(close)
        tr1 = h - l
        tr2 = (h - c.shift()).abs()
        tr3 = (l - c.shift()).abs()
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        return tr.rolling(period).mean()

    def STD(array, n):
        return pd.Series(array).rolling(n).std()

    def MACD(close, fast=12, slow=26, signal=9):
        c = pd.Series(close)
        fast_ema = c.ewm(span=fast, adjust=False).mean()
        slow_ema = c.ewm(span=slow, adjust=False).mean()
        macd_line = fast_ema - slow_ema
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        return macd_line, signal_line

    def get_recent_high(array, period=None):
        if isinstance(array, (int, float)) and period is None:
            return float(array)
        s = pd.Series(array)
        if period is not None and int(period) > 0:
            return s.rolling(int(period)).max().to_numpy()
        return float(s.max()) if len(s) > 0 else np.nan

    def get_recent_low(array, period=None):
        if isinstance(array, (int, float)) and period is None:
            return float(array)
        s = pd.Series(array)
        if period is not None and int(period) > 0:
            return s.rolling(int(period)).min().to_numpy()
        return float(s.min()) if len(s) > 0 else np.nan

    from backtesting.lib import crossover

    exec_globals = {
        "__builtins__": __builtins__,
        "pd": pd,
        "np": np,
        "Strategy": Strategy,
        "backtesting": backtesting,
        "crossover": crossover,
        "SMA": SMA,
        "sma": SMA,
        "Sma": SMA,
        "EMA": EMA,
        "ema": EMA,
        "Ema": EMA,
        "RSI": RSI,
        "rsi": RSI,
        "Rsi": RSI,
        "ATR": ATR,
        "atr": ATR,
        "Atr": ATR,
        "STD": STD,
        "std": STD,
        "Std": STD,
        "MACD": MACD,
        "macd": MACD,
        "Macd": MACD,
        "get_recent_high": get_recent_high,
        "Get_Recent_High": get_recent_high,
        "GetRecentHigh": get_recent_high,
        "recent_high": get_recent_high,
        "Recent_High": get_recent_high,
        "RecentHigh": get_recent_high,
        "get_recent_low": get_recent_low,
        "Get_Recent_Low": get_recent_low,
        "GetRecentLow": get_recent_low,
        "recent_low": get_recent_low,
        "Recent_Low": get_recent_low,
        "RecentLow": get_recent_low,
        "HIGHEST": get_recent_high,
        "Highest": get_recent_high,
        "highest": get_recent_high,
        "highest_high": get_recent_high,
        "Highest_High": get_recent_high,
        "HighestHigh": get_recent_high,
        "HH": get_recent_high,
        "LOWEST": get_recent_low,
        "Lowest": get_recent_low,
        "lowest": get_recent_low,
        "lowest_low": get_recent_low,
        "Lowest_Low": get_recent_low,
        "LowestLow": get_recent_low,
        "LL": get_recent_low,
        "MAX": get_recent_high,
        "MIN": get_recent_low,
    }

    local_vars = {}

    try:
        # Dynamically execute code
        exec(code_str, exec_globals, local_vars)
        # Update exec_globals with local_vars so methods on GeneratedStrategy can resolve top-level helpers
        exec_globals.update(local_vars)
    except Exception as e:
        raise RuntimeError(f"Syntax error or execution error in generated code: {e}")
        
    # Extract strategy class
    strategy_cls = None
    
    # Search local vars
    for name, obj in local_vars.items():
        if isinstance(obj, type) and issubclass(obj, Strategy) and obj is not Strategy:
            strategy_cls = obj
            break
            
    # Search globals if not found in local vars
    if not strategy_cls:
        for name, obj in exec_globals.items():
            if isinstance(obj, type) and issubclass(obj, Strategy) and obj is not Strategy:
                strategy_cls = obj
                break
                
    if not strategy_cls:
        raise ValueError("Could not find a class inheriting from 'backtesting.Strategy' in the generated code.")

    # Enforce safe 2% account equity risk fallback for buy and sell if size is omitted or 1.0 (all-in)
    orig_buy = strategy_cls.buy
    orig_sell = strategy_cls.sell

    def safe_buy(self, *, size=None, limit=None, stop=None, sl=None, tp=None):
        if size is None or size == 1.0 or (isinstance(size, float) and size >= 0.99):
            price = self.data.Close[-1]
            sl_price = sl if sl is not None else price * 0.98
            price_risk = abs(price - sl_price)
            risk_usd = self.equity * 0.02
            size = max(1000, int(risk_usd / price_risk)) if price_risk > 0 else 10000
        return orig_buy(self, size=size, limit=limit, stop=stop, sl=sl, tp=tp)

    def safe_sell(self, *, size=None, limit=None, stop=None, sl=None, tp=None):
        if size is None or size == 1.0 or (isinstance(size, float) and size >= 0.99):
            price = self.data.Close[-1]
            sl_price = sl if sl is not None else price * 1.02
            price_risk = abs(price - sl_price)
            risk_usd = self.equity * 0.02
            size = max(1000, int(risk_usd / price_risk)) if price_risk > 0 else 10000
        return orig_sell(self, size=size, limit=limit, stop=stop, sl=sl, tp=tp)

    strategy_cls.buy = safe_buy
    strategy_cls.sell = safe_sell
        
    # Ensure DataFrame is sorted chronologically
    df = df.sort_index()
    
    # Required columns: Open, High, Low, Close, Volume
    for col in ["Open", "High", "Low", "Close", "Volume"]:
        if col not in df.columns:
            raise ValueError(f"Missing required column '{col}' in candle data.")
            
    # Run backtest
    try:
        bt = Backtest(
            df,
            strategy_cls,
            cash=cash,
            commission=commission,
            margin=0.01,
            exclusive_orders=True,
            trade_on_close=False,
            finalize_trades=True
        )
        stats = bt.run()
    except Exception as e:
        raise RuntimeError(f"Error during backtest execution: {e}")
        
    # Extract metrics
    metrics = {
        "start_value": clean_value(cash),
        "end_value": clean_value(stats.get("Equity Final [$]")),
        "return_pct": clean_value(stats.get("Return [%]")),
        "buy_and_hold_return": clean_value(stats.get("Buy & Hold Return [%]")),
        "max_drawdown": clean_value(stats.get("Max. Drawdown [%]")),
        "sharpe_ratio": clean_value(stats.get("Sharpe Ratio")),
        "sortino_ratio": clean_value(stats.get("Sortino Ratio")),
        "calmar_ratio": clean_value(stats.get("Calmar Ratio")),
        "profit_factor": clean_value(stats.get("Profit Factor")),
        "win_rate": clean_value(stats.get("Win Rate [%]")),
        "total_trades": clean_value(stats.get("# Trades")),
    }
    
    # Extract trade log
    trades_list = []
    if "_trades" in stats and stats["_trades"] is not None:
        trades_df = stats["_trades"]
        for idx, row in trades_df.iterrows():
            sl_val = clean_value(row["SL"]) if "SL" in row and pd.notna(row["SL"]) else None
            tp_val = clean_value(row["TP"]) if "TP" in row and pd.notna(row["TP"]) else None
            
            pnl_val = clean_value(row["PnL"])
            # Calculate account equity return % for the trade
            equity_return_pct = (pnl_val / cash * 100.0) if (cash and pnl_val is not None) else 0.0
            asset_return_pct = clean_value(row["ReturnPct"] * 100.0) if "ReturnPct" in row else 0.0

            trades_list.append({
                "id": int(idx),
                "size": clean_value(row["Size"]),
                "entry_price": clean_value(row["EntryPrice"]),
                "exit_price": clean_value(row["ExitPrice"]),
                "entry_time": clean_value(row["EntryTime"]),
                "exit_time": clean_value(row["ExitTime"]),
                "pnl": pnl_val,
                "return_pct": clean_value(equity_return_pct),
                "asset_return_pct": asset_return_pct,
                "duration": str(row["Duration"]),
                "sl": sl_val,
                "tp": tp_val
            })
            
    # Extract equity curve
    equity_curve = []
    if "_equity_curve" in stats and stats["_equity_curve"] is not None:
        eq_df = stats["_equity_curve"]
        for dt, row in eq_df.iterrows():
            equity_curve.append({
                "time": dt.isoformat() if hasattr(dt, 'isoformat') else str(dt),
                "equity": clean_value(row["Equity"]),
                "drawdown": clean_value(row["DrawdownPct"] * 100.0) if "DrawdownPct" in row else 0.0
            })
            
    # Extract sampled candle series (up to 2000 points) for chart visualization
    candles_list = []
    step = max(1, len(df) // 1500)
    df_sampled = df.iloc[::step]
    for dt, row in df_sampled.iterrows():
        candles_list.append({
            "time": dt.isoformat() if hasattr(dt, 'isoformat') else str(dt),
            "open": clean_value(row["Open"]),
            "high": clean_value(row["High"]),
            "low": clean_value(row["Low"]),
            "close": clean_value(row["Close"]),
            "volume": clean_value(row["Volume"]) if "Volume" in row else 0
        })

    return {
        "metrics": metrics,
        "trades": trades_list,
        "equity_curve": equity_curve,
        "candles": candles_list
    }
