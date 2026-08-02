import os
import json
import datetime
import asyncio
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, HTTPException, Body
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from fastapi.responses import StreamingResponse
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field
from typing import Optional

from downloader import (
    SUPPORTED_PAIRS,
    get_ohlcv_data,
    download_and_cache_day,
    is_day_cached,
    is_symbol_cached,
    async_download_symbol,
)
from llm_manager import (
    generate_flowchart,
    generate_strategy_code
)
from backtest_runner import run_backtest_from_code

app = FastAPI(title="Forex Strategy Backtester API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DownloadRequest(BaseModel):
    symbol: str
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD

class FlowchartRequest(BaseModel):
    strategy_desc: str
    api_key: Optional[str] = None
    model: Optional[str] = "gemini-3.1-pro"
    provider: Optional[str] = "agy_cli"
    effort: Optional[str] = "high"

class StrategyRequest(BaseModel):
    strategy_desc: str
    api_key: Optional[str] = None
    model: Optional[str] = "gemini-3.1-pro"
    higher_timeframe: Optional[str] = None
    provider: Optional[str] = "agy_cli"
    effort: Optional[str] = "high"

class BacktestRequest(BaseModel):
    code: str
    symbol: str
    start_date: str
    end_date: str
    timeframe: str
    higher_timeframe: Optional[str] = None
    cash: Optional[float] = 10000.0
    commission: Optional[float] = 0.0002

@app.get("/api/pairs")
def get_pairs():
    """Returns list of supported forex currency pairs."""
    return {"pairs": SUPPORTED_PAIRS}

@app.post("/api/download")
async def download_data(req: DownloadRequest):
    """
    Downloads ForexSB bar data for the requested symbol.
    Data is fetched as a single bulk file per symbol (not per-day).
    Streams SSE progress events to the client.
    """
    symbol = req.symbol.upper()
    if symbol not in SUPPORTED_PAIRS:
        raise HTTPException(status_code=400, detail=f"Symbol {symbol} is not supported.")

    async def progress_stream():
        already_cached = is_symbol_cached(symbol)
        if already_cached:
            yield f"data: {json.dumps({'progress': 50, 'status': 'cached', 'message': f'{symbol} data already cached locally.'})}\n\n"
        else:
            yield f"data: {json.dumps({'progress': 0, 'status': 'starting', 'message': f'Downloading {symbol} bar data from ForexSB...'})}\n\n"

        try:
            df = await async_download_symbol(symbol)
            candle_count = len(df) if df is not None and not df.empty else 0
            date_from = str(df.index[0].date()) if candle_count > 0 else "N/A"
            date_to   = str(df.index[-1].date()) if candle_count > 0 else "N/A"
            msg = f"{'Loaded from cache' if already_cached else 'Downloaded'}: {candle_count:,} M1 bars ({date_from} -> {date_to})"
            yield f"data: {json.dumps({'progress': 100, 'status': 'completed', 'candle_count': candle_count, 'date_from': date_from, 'date_to': date_to, 'message': msg})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'progress': 100, 'status': 'error', 'message': f'Error: {str(e)}'})}\n\n"

    return StreamingResponse(progress_stream(), media_type="text/event-stream")

@app.post("/api/generate-flowchart")
def handle_generate_flowchart(req: FlowchartRequest):
    """Generates Mermaid flowchart diagram for strategy description."""
    if not req.strategy_desc.strip():
        raise HTTPException(status_code=400, detail="Strategy description cannot be empty.")
        
    try:
        flowchart = generate_flowchart(
            strategy_desc=req.strategy_desc,
            api_key=req.api_key,
            model=req.model,
            provider=req.provider or "agy_cli",
            effort=req.effort or "high"
        )
        return {"flowchart": flowchart}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/generate-strategy")
def handle_generate_strategy(req: StrategyRequest):
    """Generates Python strategy class from strategy description."""
    if not req.strategy_desc.strip():
        raise HTTPException(status_code=400, detail="Strategy description cannot be empty.")
        
    try:
        code = generate_strategy_code(
            strategy_desc=req.strategy_desc,
            api_key=req.api_key,
            model=req.model,
            higher_timeframe=req.higher_timeframe,
            provider=req.provider or "agy_cli",
            effort=req.effort or "high"
        )
        return {"code": code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/backtest")
def handle_backtest(req: BacktestRequest):
    """Runs a backtest using the submitted strategy code and parameters."""
    if not req.code.strip():
        raise HTTPException(status_code=400, detail="Strategy code cannot be empty.")
        
    try:
        start = datetime.datetime.strptime(req.start_date, "%Y-%m-%d").date()
        end = datetime.datetime.strptime(req.end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if start > end:
        raise HTTPException(status_code=400, detail="Start date must be before end date.")
        
    # Get historical data (downloads on-the-fly if not already cached)
    try:
        df = get_ohlcv_data(req.symbol, start, end, req.timeframe, req.higher_timeframe)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch data: {str(e)}")
        
    if df.empty:
        raise HTTPException(status_code=404, detail="No historical price data found for the selected range.")
        
    # Run backtest
    try:
        results = run_backtest_from_code(
            code_str=req.code,
            df=df,
            cash=req.cash,
            commission=req.commission
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Backtest execution failed: {str(e)}")

# --- Strategy Persistence Endpoints ---

STRATEGIES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "saved_strategies.json")

def load_saved_strategies() -> list:
    if not os.path.exists(STRATEGIES_FILE):
        return []
    try:
        with open(STRATEGIES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_saved_strategies(strategies: list):
    os.makedirs(os.path.dirname(STRATEGIES_FILE), exist_ok=True)
    with open(STRATEGIES_FILE, "w", encoding="utf-8") as f:
        json.dump(strategies, f, indent=2)

class SavedStrategy(BaseModel):
    id: Optional[str] = None
    name: str
    description: str
    flowchart_code: Optional[str] = ""
    python_code: Optional[str] = ""
    symbol: Optional[str] = "EURUSD"
    timeframe: Optional[str] = "1h"
    higher_timeframe: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

@app.get("/api/strategies")
def get_strategies():
    """Lists all saved strategies."""
    strategies = load_saved_strategies()
    # Sort by updated_at descending
    strategies.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
    return {"strategies": strategies}

@app.get("/api/strategies/{strategy_id}")
def get_strategy(strategy_id: str):
    """Retrieves a single strategy by ID."""
    strategies = load_saved_strategies()
    for s in strategies:
        if s.get("id") == strategy_id:
            return s
    raise HTTPException(status_code=404, detail="Strategy not found.")

@app.post("/api/strategies")
def save_strategy(req: SavedStrategy):
    """Saves or updates a strategy."""
    import uuid
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="Strategy name is required.")

    strategies = load_saved_strategies()
    now_str = datetime.datetime.now().isoformat()

    target_id = req.id or str(uuid.uuid4())
    existing = False

    for idx, s in enumerate(strategies):
        if s.get("id") == target_id:
            strategies[idx] = {
                "id": target_id,
                "name": req.name.strip(),
                "description": req.description.strip(),
                "flowchart_code": req.flowchart_code or "",
                "python_code": req.python_code or "",
                "symbol": req.symbol or "EURUSD",
                "timeframe": req.timeframe or "1h",
                "higher_timeframe": req.higher_timeframe,
                "created_at": s.get("created_at") or now_str,
                "updated_at": now_str
            }
            existing = True
            saved_item = strategies[idx]
            break

    if not existing:
        saved_item = {
            "id": target_id,
            "name": req.name.strip(),
            "description": req.description.strip(),
            "flowchart_code": req.flowchart_code or "",
            "python_code": req.python_code or "",
            "symbol": req.symbol or "EURUSD",
            "timeframe": req.timeframe or "1h",
            "higher_timeframe": req.higher_timeframe,
            "created_at": now_str,
            "updated_at": now_str
        }
        strategies.append(saved_item)

    save_saved_strategies(strategies)
    return {"status": "success", "strategy": saved_item}

@app.delete("/api/strategies/{strategy_id}")
def delete_strategy(strategy_id: str):
    """Deletes a saved strategy by ID."""
    strategies = load_saved_strategies()
    initial_len = len(strategies)
    strategies = [s for s in strategies if s.get("id") != strategy_id]
    if len(strategies) == initial_len:
        raise HTTPException(status_code=404, detail="Strategy not found.")
    save_saved_strategies(strategies)
    return {"status": "success", "deleted_id": strategy_id}

if __name__ == "__main__":
    # pyrefly: ignore [missing-import]
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
