import os
import lzma
import struct
import requests
import datetime
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

SUPPORTED_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"]

def get_point_divider(symbol: str) -> float:
    """Returns the division factor to convert Dukascopy integer price to float."""
    symbol_upper = symbol.upper()
    if "JPY" in symbol_upper:
        return 1000.0
    elif "XAU" in symbol_upper:
        return 1000.0  # Gold is typically quoted to 3 decimals on Dukascopy
    else:
        return 100000.0  # Standard 5-decimal pairs

def download_hour_ticks(symbol: str, date: datetime.date, hour: int) -> list:
    """
    Downloads and parses tick data for a single hour.
    Dukascopy months are 0-indexed in the URL (Jan = 00, Dec = 11).
    """
    # 0-indexed month
    duka_month = date.month - 1
    url = f"https://datafeed.dukascopy.com/datafeed/{symbol.upper()}/{date.year}/{duka_month:02d}/{date.day:02d}/{hour:02d}h_ticks.bi5"
    
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 404:
            return []  # Weekend or missing data
        response.raise_for_status()
        
        # Decompress LZMA
        decompressed_data = lzma.decompress(response.content)
        
        # Parse 20-byte chunks
        # Format: >IIIff (big-endian: uint32 ms offset, uint32 ask, uint32 bid, float ask vol, float bid vol)
        tick_size = 20
        num_ticks = len(decompressed_data) // tick_size
        
        ticks = []
        divider = get_point_divider(symbol)
        
        # Base datetime for the hour
        base_dt = datetime.datetime(date.year, date.month, date.day, hour, 0, 0)
        
        for i in range(num_ticks):
            offset = i * tick_size
            chunk = decompressed_data[offset:offset+tick_size]
            ms_offset, ask_raw, bid_raw, ask_vol, bid_vol = struct.unpack(">IIIff", chunk)
            
            tick_time = base_dt + datetime.timedelta(milliseconds=ms_offset)
            ask = ask_raw / divider
            bid = bid_raw / divider
            price = (ask + bid) / 2.0
            volume = ask_vol + bid_vol
            
            ticks.append({
                "timestamp": tick_time,
                "price": price,
                "volume": volume
            })
        return ticks
    except Exception as e:
        # Log error or return empty (e.g. network failure)
        print(f"Error downloading {url}: {e}")
        return []

def download_and_cache_day(symbol: str, date: datetime.date) -> pd.DataFrame:
    """
    Downloads all 24 hours of tick data for a given day in parallel,
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
            
    print(f"Downloading data for {symbol} on {date.strftime('%Y-%m-%d')}...")
    
    all_ticks = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(download_hour_ticks, symbol, date, h): h for h in range(24)}
        for future in as_completed(futures):
            hour_ticks = future.result()
            all_ticks.extend(hour_ticks)
            
    if not all_ticks:
        # Save empty file to signify weekend/no data and avoid re-download attempts
        df_empty = pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])
        df_empty.to_csv(cache_path)
        return df_empty
        
    # Convert to DataFrame
    df_ticks = pd.DataFrame(all_ticks)
    df_ticks.set_index("timestamp", inplace=True)
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

def get_ohlcv_data(symbol: str, start_date: datetime.date, end_date: datetime.date, timeframe: str) -> pd.DataFrame:
    """
    Retrieves and aggregates OHLCV data for a given range.
    Enforces the 2026 restriction.
    Timeframe is one of: '1m', '5m', '15m', '1h', '1d'
    """
    symbol = symbol.upper()
    
    # Restrict to year 2026
    start_date = max(start_date, datetime.date(2026, 1, 1))
    end_date = min(end_date, datetime.date(2026, 12, 31))
    
    if start_date > end_date:
        raise ValueError("Invalid date range within 2026.")
        
    delta = end_date - start_date
    daily_dfs = []
    
    # Download/cache day by day
    for i in range(delta.days + 1):
        current_date = start_date + datetime.timedelta(days=i)
        df_day = download_and_cache_day(symbol, current_date)
        if not df_day.empty:
            daily_dfs.append(df_day)
            
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
    
    if offset == "1min":
        return df_all
        
    # Resample to user target timeframe
    resample_rules = {
        "Open": "first",
        "High": "max",
        "Low": "min",
        "Close": "last",
        "Volume": "sum"
    }
    
    df_resampled = df_all.resample(offset).agg(resample_rules)
    df_resampled.dropna(subset=["Open"], inplace=True)
    
    return df_resampled
