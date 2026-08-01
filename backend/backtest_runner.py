import sys
import os
import math
import pandas as pd
import numpy as np
import backtesting
from backtesting import Backtest, Strategy

def clean_value(val):
    """Converts numpy types and NaNs/Infs to JSON-serializable types."""
    if isinstance(val, (np.integer, np.int64, np.int32)):
        return int(val)
    elif isinstance(val, (np.floating, np.float64, np.float32)):
        if math.isnan(val) or math.isinf(val):
            return None
        return float(val)
    elif isinstance(val, pd.Timestamp):
        return val.isoformat()
    elif isinstance(val, datetime_type_check := (type(None), str, bool, int, float, list, dict)):
        return val
    else:
        return str(val)

def run_backtest_from_code(code_str: str, df: pd.DataFrame, cash: float = 10000.0, commission: float = 0.0002) -> dict:
    """
    Executes generated strategy code dynamically and runs a backtest on df.
    """
    # Create execution namespace
    exec_globals = {
        "__builtins__": __builtins__,
        "pd": pd,
        "np": np,
        "Strategy": Strategy,
        "backtesting": backtesting,
    }
    
    # Also expose helper functions or crossovers if model didn't import them
    from backtesting.lib import crossover
    exec_globals["crossover"] = crossover
    
    local_vars = {}
    
    try:
        # Dynamically execute code
        exec(code_str, exec_globals, local_vars)
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
        
    # Ensure DataFrame is sorted chronologically
    df = df.sort_index()
    
    # Required columns: Open, High, Low, Close, Volume
    for col in ["Open", "High", "Low", "Close", "Volume"]:
        if col not in df.columns:
            raise ValueError(f"Missing required column '{col}' in candle data.")
            
    # Run backtest
    try:
        bt = Backtest(df, strategy_cls, cash=cash, commission=commission, trade_on_close=False)
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
            trades_list.append({
                "id": int(idx),
                "size": clean_value(row["Size"]),
                "entry_price": clean_value(row["EntryPrice"]),
                "exit_price": clean_value(row["ExitPrice"]),
                "entry_time": clean_value(row["EntryTime"]),
                "exit_time": clean_value(row["ExitTime"]),
                "pnl": clean_value(row["PnL"]),
                "return_pct": clean_value(row["ReturnPct"] * 100.0), # convert ratio to percentage
                "duration": str(row["Duration"])
            })
            
    # Extract equity curve
    equity_curve = []
    if "_equity_curve" in stats and stats["_equity_curve"] is not None:
        eq_df = stats["_equity_curve"]
        for dt, row in eq_df.iterrows():
            equity_curve.append({
                "time": dt.isoformat(),
                "equity": clean_value(row["Equity"]),
                "drawdown": clean_value(row["DrawdownPct"] * 100.0) if "DrawdownPct" in row else 0.0
            })
            
    return {
        "metrics": metrics,
        "trades": trades_list,
        "equity_curve": equity_curve
    }
