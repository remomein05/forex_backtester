import os
import re
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# Common indicator helper functions to supply to the model
INDICATOR_HELPERS = """
---
Available indicator calculations (copy or use as reference for self.I):
1. SMA:
   self.sma = self.I(lambda: pd.Series(self.data.Close).rolling(window=20).mean())

2. EMA:
   self.ema = self.I(lambda: pd.Series(self.data.Close).ewm(span=20, adjust=False).mean())

3. RSI:
   def calculate_rsi(close, period=14):
       delta = pd.Series(close).diff()
       gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
       loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
       rs = gain / (loss + 1e-9)
       return 100 - (100 / (1 + rs))
   self.rsi = self.I(calculate_rsi, self.data.Close, 14)

4. ATR (Average True Range):
   def calculate_atr(high, low, close, period=14):
       h, l, c = pd.Series(high), pd.Series(low), pd.Series(close)
       tr1 = h - l
       tr2 = (h - c.shift()).abs()
       tr3 = (l - c.shift()).abs()
       tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
       return tr.rolling(period).mean()
   self.atr = self.I(calculate_atr, self.data.High, self.data.Low, self.data.Close, 14)

5. Bollinger Bands:
   def bb_upper(close, period=20, num_std=2):
       sma = pd.Series(close).rolling(window=period).mean()
       std = pd.Series(close).rolling(window=period).std()
       return sma + (std * num_std)
   def bb_lower(close, period=20, num_std=2):
       sma = pd.Series(close).rolling(window=period).mean()
       std = pd.Series(close).rolling(window=period).std()
       return sma - (std * num_std)
   self.bb_up = self.I(bb_upper, self.data.Close, 20, 2)
   self.bb_low = self.I(bb_lower, self.data.Close, 20, 2)
---
"""

FLOWCHART_SYSTEM_PROMPT = """
You are an expert trading strategy architect. Your job is to translate a user's plain English trading strategy description into a valid Mermaid.js flowchart.
The flowchart must strictly depict the decision-making process of the trading strategy, including:
1. Signal Setup and Indicators (e.g. MACD, SMA Crossover, RSI).
2. Market Entry conditions (Buy/Long vs Sell/Short).
3. Risk Management checks (Stop Loss, Take Profit, trailing stops, or entry verification).
4. Market Exit rules (e.g., opposite signal, timed exit, target reached).

Follow these strict rules:
1. Output ONLY a valid Mermaid.js flowchart. It MUST start with ```mermaid and end with ```. Do not provide any conversational text, warnings, or notes.
2. The graph layout should be top-down, starting with `graph TD`.
3. Keep labels inside nodes short and professional (e.g. "EMA 20 > EMA 50?", "RSI < 30?", "Buy (Long)", "Set SL/TP").
4. Label branches clearly (e.g. with `|Yes|`, `|No|`, `|True|`, `|False|`).
5. Ensure all blocks have a logical progression and lead to either Action (Buy/Sell/Hold/Exit) or termination.
6. Do NOT use HTML formatting, parentheses, or brackets inside the flowchart node labels unless they are enclosed in double quotes (e.g., node_id["Label (Extra)"] or node_id["RSI > 50"]).
"""

STRATEGY_SYSTEM_PROMPT = f"""
You are an expert algorithmic trading engineer. Your job is to translate a plain English strategy description into a valid, syntactically correct Python class extending the `backtesting.Strategy` class from the `backtesting` package.

Here is the exact boilerplate for a strategy in backtesting.py:
```python
from backtesting import Strategy
from backtesting.lib import crossover
import pandas as pd
import numpy as np

class GeneratedStrategy(Strategy):
    # Set default hyperparameters as class variables (allows optimizing later)
    # Example:
    # fast_period = 10
    # slow_period = 20
    
    def init(self):
        # Register indicators with self.I.
        # Do not use ta-lib. Use inline custom lambdas or local functions.
        pass
        
    def next(self):
        # Core trade logic.
        # self.buy() to enter long, self.sell() to enter short.
        # self.position.close() to exit existing trade.
        # Note: self.data.Close[-1] is the current candle's close price, self.data.Close[-2] is the previous one.
        pass
```

Additional details on backtesting.py API:
- Buying: `self.buy(sl=stop_loss_price, tp=take_profit_price, size=0.1)` (size is fraction of equity if float < 1.0, e.g. 0.99 for all-in; or exact integer share count).
- Selling: `self.sell(sl=stop_loss_price, tp=take_profit_price, size=0.1)`.
- Checking positions: `self.position.is_long` or `self.position.is_short` or `self.position` (evaluates to True if active position exists).
- Closing positions: `self.position.close()`.

Guidelines:
1. Return ONLY the python code inside a ```python ``` markdown block. No other text or explanations.
2. The class MUST be named `GeneratedStrategy`.
3. Do not import `ta-lib` or any libraries not available in a standard Python environment.
4. Set stop loss (sl) and take profit (tp) if requested. Always calculate them as absolute prices:
   - For long: `sl = self.data.Close[-1] * (1 - 0.02)` (e.g. 2% stop).
   - For short: `sl = self.data.Close[-1] * (1 + 0.02)`.
5. Ensure all data accesses are correct. `self.data.Close` is a series; access the current element as `self.data.Close[-1]`.

{INDICATOR_HELPERS}
"""

def get_client(api_key: str = None) -> genai.Client:
    """Initializes the google-genai Client."""
    # Use user-provided API key, otherwise default to env variable GEMINI_API_KEY or GOOGLE_API_KEY
    key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise ValueError("Gemini API key not found. Please provide an API key in the UI or set GEMINI_API_KEY in backend environment.")
    return genai.Client(api_key=key)

def generate_flowchart(strategy_desc: str, api_key: str = None, model: str = "gemini-2.5-flash") -> str:
    """Generates a Mermaid.js flowchart from strategy description."""
    client = get_client(api_key)
    
    contents = f"Strategy Description: {strategy_desc}\n\nGenerate the flowchart."
    
    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=FLOWCHART_SYSTEM_PROMPT,
            temperature=0.2
        )
    )
    
    text = response.text
    # Extract mermaid markdown block if present
    match = re.search(r"```mermaid\s+(.*?)\s+```", text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    return text.strip()

def generate_strategy_code(strategy_desc: str, api_key: str = None, model: str = "gemini-2.5-flash") -> str:
    """Generates backtesting.py compatible python code from strategy description."""
    client = get_client(api_key)
    
    contents = f"Strategy Description: {strategy_desc}\n\nGenerate the backtesting.py strategy Python class."
    
    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=STRATEGY_SYSTEM_PROMPT,
            temperature=0.1
        )
    )
    
    text = response.text
    # Extract python markdown block if present
    match = re.search(r"```python\s+(.*?)\s+```", text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    return text.strip()
