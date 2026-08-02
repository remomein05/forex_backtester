import os
import json
import datetime
import asyncio
from concurrent.futures import ThreadPoolExecutor
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
    is_day_cached
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
    model: Optional[str] = "gemini-2.5-flash"
    provider: Optional[str] = "agy_cli"

class StrategyRequest(BaseModel):
    strategy_desc: str
    api_key: Optional[str] = None
    model: Optional[str] = "gemini-2.5-flash"
    higher_timeframe: Optional[str] = None
    provider: Optional[str] = "agy_cli"

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
    Downloads Dukascopy tick data and aggregates it to 1-minute OHLCV candles.
    Streams progress to the client using Server-Sent Events (SSE).
    """
    symbol = req.symbol.upper()
    if symbol not in SUPPORTED_PAIRS:
        raise HTTPException(status_code=400, detail=f"Symbol {symbol} is not supported.")
        
    try:
        start = datetime.datetime.strptime(req.start_date, "%Y-%m-%d").date()
        end = datetime.datetime.strptime(req.end_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
        
    # Enforce year 2026 constraints
    start = max(start, datetime.date(2026, 1, 1))
    end = min(end, datetime.date(2026, 12, 31))
    
    if start > end:
        raise HTTPException(status_code=400, detail="Start date must be before end date and within the year 2026.")
        
    delta = end - start
    total_days = delta.days + 1
    
    async def progress_stream():
        yield f"data: {json.dumps({'progress': 0, 'status': 'starting', 'current_day': 0, 'total_days': total_days, 'message': f'Initializing multi-day download for {symbol} ({total_days} days)'})}\n\n"
        
        loop = asyncio.get_running_loop()
        completed_days = 0
        all_dates = [start + datetime.timedelta(days=i) for i in range(total_days)]
        
        def process_day(current_date):
            cached = is_day_cached(symbol, current_date)
            df_day = download_and_cache_day(symbol, current_date)
            candle_count = len(df_day) if df_day is not None else 0
            return current_date, cached, candle_count
            
        with ThreadPoolExecutor(max_workers=min(total_days, 6)) as executor:
            tasks = [loop.run_in_executor(executor, process_day, d) for d in all_dates]
            for future in asyncio.as_completed(tasks):
                try:
                    current_date, cached, candle_count = await future
                    completed_days += 1
                    date_str = current_date.strftime("%Y-%m-%d")
                    progress = int((completed_days / total_days) * 100)
                    status_label = "cached" if cached else "downloaded"
                    msg = f"Loaded {date_str} from cache ({candle_count} candles)" if cached else f"Downloaded & aggregated {date_str} ({candle_count} candles)"
                    
                    yield f"data: {json.dumps({'progress': progress, 'status': status_label, 'current_day': completed_days, 'total_days': total_days, 'date': date_str, 'is_cached': cached, 'candle_count': candle_count, 'message': msg})}\n\n"
                except Exception as e:
                    completed_days += 1
                    progress = int((completed_days / total_days) * 100)
                    yield f"data: {json.dumps({'progress': progress, 'status': 'error', 'current_day': completed_days, 'total_days': total_days, 'date': '', 'is_cached': False, 'candle_count': 0, 'message': f'Error: {str(e)}'})}\n\n"
                    
        yield f"data: {json.dumps({'progress': 100, 'status': 'completed', 'current_day': total_days, 'total_days': total_days, 'message': 'Data fetch complete'})}\n\n"
        
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
            provider=req.provider or "agy_cli"
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
            provider=req.provider or "agy_cli"
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
        
    # Clamp dates to 2026
    start = max(start, datetime.date(2026, 1, 1))
    end = min(end, datetime.date(2026, 12, 31))
    
    if start > end:
        raise HTTPException(status_code=400, detail="Invalid date range within 2026.")
        
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
