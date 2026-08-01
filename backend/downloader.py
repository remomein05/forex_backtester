import os
import lzma
import struct
import datetime
import asyncio
import httpx
import pandas as pd
import numpy as np

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

SUPPORTED_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"]

# Structured NumPy dtype matching Dukascopy 20-byte binary struct (>IIIff)
TICK_DTYPE = np.dtype([
    ('ms_offset', '>u4'),
    ('ask_raw', '>u4'),
    ('bid_raw', '>u4'),
    ('ask_vol', '>f4'),
    ('bid_vol', '>f4')
])

def run_async(coro):
    """Runs a coroutine safely in both sync and async environments."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        import threading
        from concurrent.futures import Future

        res_future = Future()

        def run_in_new_loop():
            try:
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                res = new_loop.run_until_complete(coro)
                res_future.set_result(res)
            except Exception as exc:
                res_future.set_exception(exc)
            finally:
                new_loop.close()

        t = threading.Thread(target=run_in_new_loop)
        t.start()
        t.join()
        return res_future.result()
    else:
        return asyncio.run(coro)

def get_point_divider(symbol: str) -> float:
    """Returns the division factor to convert Dukascopy integer price to float."""
    symbol_upper = symbol.upper()
    if "JPY" in symbol_upper:
        return 1000.0
    elif "XAU" in symbol_upper:
        return 1000.0  # Gold is typically quoted to 3 decimals on Dukascopy
    else:
        return 100000.0  # Standard 5-decimal pairs

def get_valid_hours_for_date(date: datetime.date) -> list[int]:
    """
    Returns valid Forex trading hours for a given date.
    - Saturday (weekday 5): 0 hours (market closed)
    - Sunday (weekday 6): hours 21..23 only (Sydney/Tokyo market opens ~21:00 UTC)
    - Mon-Fri (weekdays 0..4): all 24 hours (0..23)
    """
    weekday = date.weekday()
    if weekday == 5:
        return []
    elif weekday == 6:
        return [21, 22, 23]
    return list(range(24))

async def async_download_hour_ticks(symbol: str, date: datetime.date, hour: int, client: httpx.AsyncClient = None) -> pd.DataFrame:
    """
    Downloads and parses tick data for a single hour using vectorized NumPy binary parsing.
    Returns a DataFrame with columns ['price', 'volume'] indexed by timestamp.
    """
    duka_month = date.month - 1
    url = f"https://datafeed.dukascopy.com/datafeed/{symbol.upper()}/{date.year}/{duka_month:02d}/{date.day:02d}/{hour:02d}h_ticks.bi5"
    
    try:
        if client is None:
            async with httpx.AsyncClient(timeout=8.0) as temp_client:
                response = await temp_client.get(url)
        else:
            response = await client.get(url, timeout=8.0)
            
        if response.status_code == 404:
            return pd.DataFrame(columns=["price", "volume"])
        response.raise_for_status()
        
        decompressed_data = lzma.decompress(response.content)
        if not decompressed_data:
            return pd.DataFrame(columns=["price", "volume"])
            
        divider = get_point_divider(symbol)
        
        # Fast vector parsing with NumPy frombuffer
        raw_ticks = np.frombuffer(decompressed_data, dtype=TICK_DTYPE)
        if len(raw_ticks) == 0:
            return pd.DataFrame(columns=["price", "volume"])

        base_dt = pd.Timestamp(date.year, date.month, date.day, hour, 0, 0)
        timestamps = base_dt + pd.to_timedelta(raw_ticks['ms_offset'], unit='ms')
        prices = (raw_ticks['ask_raw'].astype(np.float64) + raw_ticks['bid_raw'].astype(np.float64)) / (2.0 * divider)
        volumes = raw_ticks['ask_vol'] + raw_ticks['bid_vol']
        
        return pd.DataFrame({"price": prices, "volume": volumes}, index=timestamps)
    except Exception as e:
        print(f"Error downloading {url}: {e}")
        return pd.DataFrame(columns=["price", "volume"])

def download_hour_ticks(symbol: str, date: datetime.date, hour: int, session = None) -> pd.DataFrame:
    """Synchronous wrapper for download_hour_ticks."""
    return run_async(async_download_hour_ticks(symbol, date, hour))

def is_day_cached(symbol: str, date: datetime.date) -> bool:
    """Checks whether 1-minute OHLCV data for a given day is already cached locally."""
    symbol_dir = os.path.join(DATA_DIR, symbol.upper())
    cache_path = os.path.join(symbol_dir, f"{date.strftime('%Y_%m_%d')}_1m.csv")
    return os.path.exists(cache_path)

async def async_download_and_cache_day(symbol: str, date: datetime.date, client: httpx.AsyncClient = None) -> pd.DataFrame:
    """
    Downloads all valid trading hours of tick data for a given day in parallel,
    aggregates it into 1-minute OHLCV candles, and caches it as a CSV.
    """
    symbol_dir = os.path.join(DATA_DIR, symbol.upper())
    os.makedirs(symbol_dir, exist_ok=True)
    
    cache_path = os.path.join(symbol_dir, f"{date.strftime('%Y_%m_%d')}_1m.csv")
    
    if os.path.exists(cache_path):
        try:
            df = pd.read_csv(cache_path, index_col=0, parse_dates=True)
            return df
        except Exception as e:
            print(f"Failed to read cache {cache_path}, re-downloading: {e}")

    valid_hours = get_valid_hours_for_date(date)
    if not valid_hours:
        df_empty = pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])
        df_empty.to_csv(cache_path)
        return df_empty
            
    print(f"Downloading data for {symbol} on {date.strftime('%Y-%m-%d')}...")
    
    if client is None:
        async with httpx.AsyncClient(limits=httpx.Limits(max_connections=24, max_keepalive_connections=10)) as temp_client:
            tasks = [async_download_hour_ticks(symbol, date, h, temp_client) for h in valid_hours]
            hour_dfs = await asyncio.gather(*tasks)
    else:
        tasks = [async_download_hour_ticks(symbol, date, h, client) for h in valid_hours]
        hour_dfs = await asyncio.gather(*tasks)
        
    hour_dfs = [df for df in hour_dfs if not df.empty]
            
    if not hour_dfs:
        df_empty = pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])
        df_empty.to_csv(cache_path)
        return df_empty
        
    df_ticks = pd.concat(hour_dfs)
    df_ticks.sort_index(inplace=True)
    
    # Resample to 1-minute candles
    ohlc = df_ticks["price"].resample("1min").ohlc()
    volume = df_ticks["volume"].resample("1min").sum()
    
    df_1m = pd.concat([ohlc, volume], axis=1)
    df_1m.columns = ["Open", "High", "Low", "Close", "Volume"]
    
    # Fill any gaps (e.g. minutes with no ticks) using forward-fill for prices, 0 for volume
    df_1m["Close"] = df_1m["Close"].ffill()
    df_1m["Open"] = df_1m["Open"].fillna(df_1m["Close"])
    df_1m["High"] = df_1m["High"].fillna(df_1m["Close"])
    df_1m["Low"] = df_1m["Low"].fillna(df_1m["Close"])
    df_1m["Volume"] = df_1m["Volume"].fillna(0.0)
    
    df_1m.to_csv(cache_path)
    return df_1m

def download_and_cache_day(symbol: str, date: datetime.date, session = None) -> pd.DataFrame:
    """Synchronous wrapper for download_and_cache_day."""
    return run_async(async_download_and_cache_day(symbol, date))

async def async_get_ohlcv_data(symbol: str, start_date: datetime.date, end_date: datetime.date, timeframe: str, higher_timeframe: str = None) -> pd.DataFrame:
    """
    Retrieves and aggregates OHLCV data for a given range.
    Enforces the 2026 restriction.
    Timeframe is one of: '1m', '5m', '15m', '1h', '1d'
    Higher timeframe (optional) adds merged HTF columns (Open_htf, High_htf, Low_htf, Close_htf).
    """
    symbol = symbol.upper()
    
    # Restrict to year 2026
    start_date = max(start_date, datetime.date(2026, 1, 1))
    end_date = min(end_date, datetime.date(2026, 12, 31))
    
    if start_date > end_date:
        raise ValueError("Invalid date range within 2026.")
        
    delta = end_date - start_date
    total_days = delta.days + 1
    
    # Limit concurrency of daily downloads to 6 to avoid hitting rate limits or overwhelming connection pools
    sem = asyncio.Semaphore(6)
    
    limits = httpx.Limits(max_connections=50, max_keepalive_connections=15)
    async with httpx.AsyncClient(limits=limits, timeout=10.0) as client:
        async def sem_download(date):
            async with sem:
                return await async_download_and_cache_day(symbol, date, client)
                
        tasks = [sem_download(start_date + datetime.timedelta(days=i)) for i in range(total_days)]
        daily_dfs = await asyncio.gather(*tasks)
            
    daily_dfs = [df for df in daily_dfs if df is not None and not df.empty]
            
    if not daily_dfs:
        return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])
        
    df_all = pd.concat(daily_dfs)
    df_all.sort_index(inplace=True)
    
    # Map timeframe string to pandas offset
    tf_map = {
        "1m": "1min",
        "5m": "5min",
        "15m": "15min",
        "1h": "1h",
        "1d": "1D"
    }
    
    offset = tf_map.get(timeframe.lower(), "1D")
    
    resample_rules = {
        "Open": "first",
        "High": "max",
        "Low": "min",
        "Close": "last",
        "Volume": "sum"
    }

    if offset == "1min":
        df_resampled = df_all.copy()
    else:
        df_resampled = df_all.resample(offset).agg(resample_rules)
        df_resampled.dropna(subset=["Open"], inplace=True)

    # Process Higher Timeframe if provided and different from primary timeframe
    if higher_timeframe and higher_timeframe.lower() in tf_map and higher_timeframe.lower() != timeframe.lower():
        htf_offset = tf_map[higher_timeframe.lower()]
        df_htf = df_all.resample(htf_offset).agg(resample_rules).dropna(subset=["Open"])
        df_htf.columns = [f"{col}_htf" for col in df_htf.columns]
        
        # Merge HTF columns into primary DataFrame using reindex + ffill
        df_resampled = pd.merge_asof(
            df_resampled,
            df_htf,
            left_index=True,
            right_index=True,
            direction="backward"
        )
        # Fill any initial NaNs if primary timeframe starts before first HTF candle finishes
        for col in df_htf.columns:
            if col in df_resampled.columns:
                df_resampled[col] = df_resampled[col].bfill().ffill()

    return df_resampled

def get_ohlcv_data(symbol: str, start_date: datetime.date, end_date: datetime.date, timeframe: str, higher_timeframe: str = None) -> pd.DataFrame:
    """Synchronous wrapper for get_ohlcv_data."""
    return run_async(async_get_ohlcv_data(symbol, start_date, end_date, timeframe, higher_timeframe))

