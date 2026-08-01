import os
import lzma
import struct
import requests
import datetime
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

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

def get_http_session() -> requests.Session:
    """Creates a requests.Session with connection pooling and retry strategy for maximum throughput."""
    session = requests.Session()
    adapter = HTTPAdapter(
        pool_connections=32,
        pool_maxsize=32,
        max_retries=Retry(total=2, backoff_factor=0.1, status_forcelist=[500, 502, 503, 504])
    )
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

HTTP_SESSION = get_http_session()

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

def download_hour_ticks(symbol: str, date: datetime.date, hour: int, session: requests.Session = None) -> pd.DataFrame:
    """
    Downloads and parses tick data for a single hour using vectorized NumPy binary parsing.
    Returns a DataFrame with columns ['price', 'volume'] indexed by timestamp.
    """
    if session is None:
        session = HTTP_SESSION

    duka_month = date.month - 1
    url = f"https://datafeed.dukascopy.com/datafeed/{symbol.upper()}/{date.year}/{duka_month:02d}/{date.day:02d}/{hour:02d}h_ticks.bi5"
    
    try:
        response = session.get(url, timeout=8)
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

def is_day_cached(symbol: str, date: datetime.date) -> bool:
    """Checks whether 1-minute OHLCV data for a given day is already cached locally."""
    symbol_dir = os.path.join(DATA_DIR, symbol.upper())
    cache_path = os.path.join(symbol_dir, f"{date.strftime('%Y_%m_%d')}_1m.csv")
    return os.path.exists(cache_path)

def download_and_cache_day(symbol: str, date: datetime.date, session: requests.Session = None) -> pd.DataFrame:
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

    if session is None:
        session = HTTP_SESSION
            
    print(f"Downloading data for {symbol} on {date.strftime('%Y-%m-%d')}...")
    
    hour_dfs = []
    with ThreadPoolExecutor(max_workers=min(len(valid_hours), 24)) as executor:
        futures = [executor.submit(download_hour_ticks, symbol, date, h, session) for h in valid_hours]
        for future in as_completed(futures):
            df_hour = future.result()
            if not df_hour.empty:
                hour_dfs.append(df_hour)
            
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

def get_ohlcv_data(symbol: str, start_date: datetime.date, end_date: datetime.date, timeframe: str, higher_timeframe: str = None) -> pd.DataFrame:
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
    
    # Download/cache days in parallel (up to 6 days concurrently)
    daily_results = {}
    with ThreadPoolExecutor(max_workers=min(total_days, 6)) as executor:
        futures = {executor.submit(download_and_cache_day, symbol, start_date + datetime.timedelta(days=i)): i for i in range(total_days)}
        for future in as_completed(futures):
            idx = futures[future]
            try:
                df_day = future.result()
                if df_day is not None and not df_day.empty:
                    daily_results[idx] = df_day
            except Exception as e:
                print(f"Error downloading day {idx}: {e}")

    daily_dfs = [daily_results[i] for i in sorted(daily_results.keys()) if i in daily_results]
            
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
