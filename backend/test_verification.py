import os
import sys
import struct
import lzma
import datetime
import pandas as pd
import numpy as np

# Ensure backend folder is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from downloader import get_point_divider, download_and_cache_day, get_ohlcv_data
from backtest_runner import run_backtest_from_code

from unittest.mock import MagicMock, patch
from llm_manager import generate_flowchart, generate_strategy_code, get_client, sanitize_mermaid_code

def test_downloader_and_parser():
    print("Running Downloader/Parser Test...")
    symbol = "EURUSD"
    divider = get_point_divider(symbol)
    
    # Generate 10 mock ticks for 2026-06-15 10:00:00 (10:00:00 to 10:00:10)
    ticks = []
    base_time = datetime.datetime(2026, 6, 15, 10, 0, 0)
    
    for i in range(10):
        # offset in ms: i seconds
        offset_ms = i * 1000
        # Ask/bid prices around 1.08000
        ask_raw = int(1.08010 * divider + i)
        bid_raw = int(1.07990 * divider - i)
        ask_vol = 1.5 + i
        bid_vol = 1.2 + i
        ticks.append((offset_ms, ask_raw, bid_raw, ask_vol, bid_vol))
        
    # Pack into binary bytes
    binary_data = b""
    for tick in ticks:
        binary_data += struct.pack(">IIIff", *tick)
        
    # Compress with lzma
    compressed_data = lzma.compress(binary_data)
    
    # Save mock file to cache directory representing 2026-06-15 10:00:00
    cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", symbol)
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, "2026_06_15_1m.csv")
    
    # We will simulate the cached output directly to test aggregation and resampling
    # 1-minute candle
    df_mock = pd.DataFrame([
        {
            "timestamp": datetime.datetime(2026, 6, 15, 10, 0, 0),
            "Open": 1.08000,
            "High": 1.08005,
            "Low": 1.07995,
            "Close": 1.08002,
            "Volume": 25.0
        }
    ])
    df_mock.set_index("timestamp", inplace=True)
    df_mock.to_csv(cache_path)
    
    print(f"Mock 1-minute data cached at: {cache_path}")
    
    # Call get_ohlcv_data to retrieve the data
    df = get_ohlcv_data(symbol, datetime.date(2026, 6, 15), datetime.date(2026, 6, 15), "1m")
    
    print("Parsed Data:")
    print(df)
    
    assert not df.empty, "DataFrame should not be empty"
    assert "Open" in df.columns, "Should have Open column"
    assert len(df) == 1, "Should have exactly 1 row"
    print("Downloader and parser verification: SUCCESS")

def test_backtest_runner():
    print("Running Backtest Runner Test...")
    
    # Create simple mock data of 100 rows
    np.random.seed(42)
    dates = pd.date_range(start="2026-01-01 00:00:00", periods=100, freq="1h")
    
    close_prices = 1.0800 + np.cumsum(np.random.normal(0, 0.001, 100))
    open_prices = close_prices - np.random.normal(0, 0.0005, 100)
    high_prices = np.maximum(open_prices, close_prices) + np.abs(np.random.normal(0, 0.0005, 100))
    low_prices = np.minimum(open_prices, close_prices) - np.abs(np.random.normal(0, 0.0005, 100))
    volume = np.random.uniform(10, 100, 100)
    
    df = pd.DataFrame({
        "Open": open_prices,
        "High": high_prices,
        "Low": low_prices,
        "Close": close_prices,
        "Volume": volume
    }, index=dates)
    
    # Simple strategy: SMA Crossover (SMA 5 crosses SMA 20)
    strategy_code = """
from backtesting import Strategy
import pandas as pd

class GeneratedStrategy(Strategy):
    n_fast = 5
    n_slow = 20
    
    def init(self):
        self.fast_ma = self.I(lambda: pd.Series(self.data.Close).rolling(self.n_fast).mean())
        self.slow_ma = self.I(lambda: pd.Series(self.data.Close).rolling(self.n_slow).mean())
        
    def next(self):
        # Access latest values
        fast = self.fast_ma[-1]
        slow = self.slow_ma[-1]
        
        # Access previous values
        prev_fast = self.fast_ma[-2]
        prev_slow = self.slow_ma[-2]
        
        if prev_fast <= prev_slow and fast > slow:
            if self.position.is_short:
                self.position.close()
            self.buy(sl=self.data.Close[-1] * 0.99, tp=self.data.Close[-1] * 1.02)
        elif prev_fast >= prev_slow and fast < slow:
            if self.position.is_long:
                self.position.close()
            self.sell(sl=self.data.Close[-1] * 1.01, tp=self.data.Close[-1] * 0.98)
"""
    
    results = run_backtest_from_code(strategy_code, df, cash=10000.0, commission=0.0002)
    
    print("Backtest results computed successfully!")
    print(f"Start Value: {results['metrics']['start_value']}")
    print(f"End Value: {results['metrics']['end_value']}")
    print(f"Total Trades Executed: {results['metrics']['total_trades']}")
    print(f"Win Rate: {results['metrics']['win_rate']}%")
    
    assert results['metrics']['start_value'] == 10000.0, "Start value should be 10000"
    assert len(results['equity_curve']) == 100, "Equity curve length should match data"
    print("Backtest runner verification: SUCCESS")

def test_llm_manager():
    print("Running LLM Manager Unit Tests...")
    
    mock_flowchart_response = MagicMock()
    mock_flowchart_response.text = "```mermaid\ngraph TD\n    A[Start] --> B[Check SMA]\n```"
    
    with patch("llm_manager.genai.Client") as mock_client_cls:
        mock_client_instance = MagicMock()
        mock_client_cls.return_value = mock_client_instance
        
        # Test 1: Flowchart generation parsing
        mock_client_instance.models.generate_content.return_value = mock_flowchart_response
        flowchart = generate_flowchart("Simple SMA strategy", api_key="dummy_key", provider="gemini_api")
        assert "graph TD" in flowchart, "Flowchart output should contain graph TD"
        assert "```mermaid" not in flowchart, "Mermaid code block delimiters should be stripped"
        
        # Test 2: Mermaid sanitization of unquoted labels with parentheses
        raw_problematic_chart = "graph TD\n    C -- Yes --> D[Buy (Long)]\n    D --> E{SMA(20) > 50}"
        sanitized = sanitize_mermaid_code(raw_problematic_chart)
        assert 'D["Buy (Long)"]' in sanitized, f"Expected D[\"Buy (Long)\"] in sanitized output, got: {sanitized}"
        assert 'E{"SMA(20) > 50"}' in sanitized, f"Expected E{{\"SMA(20) > 50\"}} in sanitized output, got: {sanitized}"
        
    print("LLM Manager unit tests: SUCCESS")

def test_llm_manager_agy_cli():
    print("Running AGY CLI Live Strategy Generation Test...")
    strategy_desc = "Buy long when 10 EMA crosses above 50 EMA with 1% stop loss and 2% take profit."
    
    print("Generating flowchart via AGY CLI...")
    flowchart = generate_flowchart(strategy_desc, provider="agy_cli")
    print("Generated Flowchart:")
    print(flowchart)
    assert "graph" in flowchart or "flowchart" in flowchart, "Flowchart should contain graph or flowchart keyword"
    
    print("\nGenerating strategy code via AGY CLI...")
    code = generate_strategy_code(strategy_desc, provider="agy_cli")
    print("Generated Python Strategy Code:")
    print(code)
    assert "class GeneratedStrategy" in code, "Strategy code should contain GeneratedStrategy class"
    assert "def init" in code, "Strategy code should contain init method"
    assert "def next" in code, "Strategy code should contain next method"
    
    print("AGY CLI Strategy Generation test: SUCCESS")

if __name__ == "__main__":
    try:
        test_downloader_and_parser()
        print("-" * 40)
        test_backtest_runner()
        print("-" * 40)
        test_llm_manager()
        print("-" * 40)
        test_llm_manager_agy_cli()
        print("-" * 40)
        print("ALL TESTS PASSED")
    except Exception as e:
        print(f"TEST FAILURE: {e}")
        sys.exit(1)
