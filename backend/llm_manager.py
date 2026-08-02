import os
import re
import subprocess
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# Common indicator helper functions to supply to the model
INDICATOR_HELPERS = """
---
Available indicator calculations & helper functions (MUST assign to self.<indicator_name> inside self.I):
1. SMA:
   self.sma = self.I(SMA, self.data.Close, 20)

2. EMA:
   self.ema = self.I(EMA, self.data.Close, 20)

3. RSI:
   self.rsi = self.I(RSI, self.data.Close, 14)

4. ATR (Average True Range):
   self.atr = self.I(ATR, self.data.High, self.data.Low, self.data.Close, 14)

5. Bollinger Bands:
   def bb_upper(close, period=20, num_std=2):
       sma_val = pd.Series(close).rolling(window=period).mean()
       std_val = pd.Series(close).rolling(window=period).std()
       return sma_val + (std_val * num_std)
   def bb_lower(close, period=20, num_std=2):
       sma_val = pd.Series(close).rolling(window=period).mean()
       std_val = pd.Series(close).rolling(window=period).std()
       return sma_val - (std_val * num_std)
   self.bb_up = self.I(bb_upper, self.data.Close, 20, 2)
   self.bb_low = self.I(bb_lower, self.data.Close, 20, 2)

6. Recent High / Low (Highest / Lowest):
   self.recent_high = self.I(get_recent_high, self.data.High, 20)
   self.recent_low = self.I(get_recent_low, self.data.Low, 20)
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
6. CRITICAL: ALWAYS enclose node text labels in double quotes inside shape brackets (e.g. node_id["Label (Extra)"] or node_id["RSI > 50"] or node_id["Buy (Long)"]). Never leave text unquoted if it contains parentheses, comparison operators, spaces, or special symbols.
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
        # CRITICAL: Always assign indicators to self attributes! e.g. self.sma = self.I(SMA, self.data.Close, 20)
        # NEVER assign them to local variables like `sma = self.I(...)`!
        pass
        
    def next(self):
        # Core trade logic.
        # CRITICAL: Always access indicators via self attributes! e.g. self.sma[-1] or crossover(self.sma_fast, self.sma_slow)
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
6. Built-in functions `SMA`, `EMA`, `RSI`, `ATR`, `STD`, `MACD`, `get_recent_high`, `get_recent_low`, `HIGHEST`, `LOWEST` are automatically available in context. Do not import undefined helper modules.

{INDICATOR_HELPERS}
"""

def get_client(api_key: str = None) -> genai.Client:
    """Initializes the google-genai Client."""
    key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise ValueError("Gemini API key not found. Please provide an API key in the UI or set GEMINI_API_KEY in backend environment.")
    return genai.Client(api_key=key)

def call_llm(
    prompt: str,
    system_instruction: str,
    provider: str = "agy_cli",
    api_key: str = None,
    model: str = "gemini-3.1-pro",
    effort: str = None
) -> str:
    """Dispatches LLM calls either through local AGY CLI or Google Gemini API Key."""
    if provider == "agy_cli":
        combined_prompt = f"System Instructions:\n{system_instruction}\n\nTask Request:\n{prompt}"
        cmd = ["agy", "--print", combined_prompt]
        if model:
            cmd.extend(["--model", model])
            # Auto-assign --effort for models requiring it (e.g., gemini-3.1-pro, thinking/pro models)
            eff = effort
            if not eff and ("3.1" in model or "pro" in model or "thinking" in model or "reasoning" in model):
                eff = "high"
            if eff:
                cmd.extend(["--effort", eff])

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=180
            )
            if result.returncode != 0:
                err_detail = result.stderr.strip() or f"AGY CLI returned exit code {result.returncode}"
                raise RuntimeError(f"AGY CLI Error: {err_detail}")
            return result.stdout.strip()
        except FileNotFoundError:
            raise RuntimeError("AGY CLI ('agy') command not found on server system PATH.")
        except subprocess.TimeoutExpired:
            raise RuntimeError("AGY CLI execution timed out after 180 seconds.")
    else:
        client = get_client(api_key)
        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1
            )
        )
        return response.text or ""

def sanitize_mermaid_code(code: str) -> str:
    """Sanitizes Mermaid.js flowchart syntax by wrapping unquoted node and edge labels in double quotes."""
    if not code:
        return code

    # 1. Strip markdown code fences if present
    code = re.sub(r'```mermaid\s*', '', code, flags=re.IGNORECASE)
    code = re.sub(r'```\s*', '', code)
    code = code.strip()

    lines = code.split('\n')
    sanitized_lines = []

    for line in lines:
        stripped = line.strip()
        # Skip comment or graph definition header
        if stripped.startswith('%%') or stripped.startswith('graph ') or stripped.startswith('flowchart '):
            sanitized_lines.append(line)
            continue

        # Step A: Protect/clean edge labels |...| so node regex doesn't match inside them
        edge_placeholders = []
        def protect_edge(m):
            label = m.group(1).strip()
            # Strip double quotes and parentheses inside edge labels |...| to prevent Mermaid syntax parse errors
            clean = label.replace('"', '').replace('(', '').replace(')', '').strip()
            idx = len(edge_placeholders)
            edge_placeholders.append(f'|{clean}|')
            return f'__EDGE_LABEL_{idx}__'

        line_protected = re.sub(r'\|([^|]+)\|', protect_edge, line)

        # Step B: Match node shape definitions on the line
        pattern = (
            r'(\b[a-zA-Z0-9_\-]+\b)\s*'
            r'('
            r'\[\((.*?)\)\]|'
            r'\(\[(.*?)\]\)|'
            r'\[\[(.*?)\]\]|'
            r'\(\((.*?)\)\)|'
            r'\{\{(.*?)\}\}|'
            r'\[(.*?)\]|'
            r'\((.*?)\)|'
            r'\{(.*?)\}|'
            r'>(.*?)\]'
            r')'
        )

        def sub_node(m):
            node_id = m.group(1)
            
            # Identify which shape matched
            if m.group(3) is not None:
                open_str, close_str, content = "[(", ")]", m.group(3)
            elif m.group(4) is not None:
                open_str, close_str, content = "([", "])", m.group(4)
            elif m.group(5) is not None:
                open_str, close_str, content = "[[", "]]", m.group(5)
            elif m.group(6) is not None:
                open_str, close_str, content = "((", "))", m.group(6)
            elif m.group(7) is not None:
                open_str, close_str, content = "{{", "}}", m.group(7)
            elif m.group(8) is not None:
                open_str, close_str, content = "[", "]", m.group(8)
            elif m.group(9) is not None:
                open_str, close_str, content = "(", ")", m.group(9)
            elif m.group(10) is not None:
                open_str, close_str, content = "{", "}", m.group(10)
            elif m.group(11) is not None:
                open_str, close_str, content = ">", "]", m.group(11)

            content_trimmed = content.strip()
            # If already enclosed in quotes, don't double quote
            if content_trimmed.startswith('"') and content_trimmed.endswith('"') and len(content_trimmed) >= 2:
                return f'{node_id}{open_str}{content_trimmed}{close_str}'
            
            clean_content = content_trimmed.replace('"', '\\"')
            return f'{node_id}{open_str}"{clean_content}"{close_str}'

        line_nodes_fixed = re.sub(pattern, sub_node, line_protected)

        # Step C: Restore edge labels
        for idx, placeholder in enumerate(edge_placeholders):
            line_nodes_fixed = line_nodes_fixed.replace(f'__EDGE_LABEL_{idx}__', placeholder)

        sanitized_lines.append(line_nodes_fixed)

    return '\n'.join(sanitized_lines)

def generate_flowchart(
    strategy_desc: str,
    api_key: str = None,
    model: str = "gemini-3.1-pro",
    provider: str = "agy_cli",
    effort: str = None
) -> str:
    """Generates a Mermaid.js flowchart from strategy description."""
    contents = f"Strategy Description: {strategy_desc}\n\nGenerate the flowchart."
    text = call_llm(
        prompt=contents,
        system_instruction=FLOWCHART_SYSTEM_PROMPT,
        provider=provider,
        api_key=api_key,
        model=model,
        effort=effort
    )
    
    # Extract mermaid markdown block if present
    match = re.search(r"```mermaid\s+(.*?)\s+```", text, re.DOTALL | re.IGNORECASE)
    raw_code = match.group(1).strip() if match else text.strip()
    return sanitize_mermaid_code(raw_code)

def generate_strategy_code(
    strategy_desc: str,
    api_key: str = None,
    model: str = "gemini-3.1-pro",
    higher_timeframe: str = None,
    provider: str = "agy_cli",
    effort: str = None
) -> str:
    """Generates backtesting.py compatible python code from strategy description."""
    mtf_text = ""
    if higher_timeframe and higher_timeframe.lower() != "none":
        mtf_text = f"\nMulti-Timeframe Mode Enabled: Higher Timeframe is '{higher_timeframe}'. Higher timeframe price columns are available as self.data.Open_htf, self.data.High_htf, self.data.Low_htf, self.data.Close_htf. Use these columns if higher timeframe trend/filtering is needed in the strategy."
        
    contents = f"Strategy Description: {strategy_desc}{mtf_text}\n\nGenerate the backtesting.py strategy Python class."
    text = call_llm(
        prompt=contents,
        system_instruction=STRATEGY_SYSTEM_PROMPT,
        provider=provider,
        api_key=api_key,
        model=model,
        effort=effort
    )
    
    # Extract python markdown block if present
    match = re.search(r"```python\s+(.*?)\s+```", text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    return text.strip()

