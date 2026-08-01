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

class StrategyRequest(BaseModel):
    strategy_desc: str
    api_key: Optional[str] = None
    model: Optional[str] = "gemini-2.5-flash"
    higher_timeframe: Optional[str] = None

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
            model=req.model
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
            higher_timeframe=req.higher_timeframe
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

if __name__ == "__main__":
    # pyrefly: ignore [missing-import]
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
