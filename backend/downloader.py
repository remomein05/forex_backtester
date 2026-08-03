import os
import gzip
import struct
import datetime
import asyncio
import json
import urllib.request
import httpx
import pandas as pd
import numpy as np

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")

# ---------------------------------------------------------------------------
# ForexSB data source constants
# ---------------------------------------------------------------------------
# Endpoint discovered by reverse-engineering https://data.forexsb.com/assets/js/app.js
FOREXSB_BASE_URL = "https://data.forexsb.com/datafeed/data/dukascopy"
FOREXSB_INFO_URL = "https://data.forexsb.com/datafeed/info/premium.json.gz"

# Browser-like headers required by the ForexSB CDN (blocks plain wget/curl)
FOREXSB_HEADERS = {
    "Accept": "*/*",
    "Accept-Encoding": "identity",
    "Origin": "https://data.forexsb.com",
    "Referer": "https://data.forexsb.com/data-app",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
}

# ---------------------------------------------------------------------------
# ForexSB .lb.gz binary format
# ---------------------------------------------------------------------------
# Each bar is 28 bytes = 7 × int32 little-endian:
#   [0] timestamp  – minutes since Unix epoch (1970-01-01 00:00 UTC)
#   [1] Open       × priceScale (100000 for 5-decimal pairs, 1000 for JPY/XAU)
#   [2] High       × priceScale
#   [3] Low        × priceScale
#   [4] Close      × priceScale
#   [5] Volume     (tick count)
#   [6] Spread     (points)
LB_BAR_STRUCT = struct.Struct("<7i")
LB_BAR_SIZE   = LB_BAR_STRUCT.size  # 28 bytes

# The server only hosts M1(1), M5(5), M15(15), M30(30) as base files.
# H1, H4, D1 are derived by resampling M30 (matching what ForexSB's JS does).
# We use M1 as the base for maximum accuracy, resampling up to any TF we need.
BASE_PERIOD = 1   # minutes  →  fetch EURUSD1.lb.gz

# Price scale by symbol (from info catalog)
#   5-decimal pairs → 100000 | 3-decimal (JPY, XAU) → 1000
def _price_scale(symbol: str) -> int:
    s = symbol.upper()
    if "JPY" in s or "XAU" in s:
        return 1000
    return 100000

get_point_divider = _price_scale


# ---------------------------------------------------------------------------
# Supported pairs  (intersection of our list and ForexSB catalog)
# ---------------------------------------------------------------------------
SUPPORTED_PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "XAUUSD"]

# ---------------------------------------------------------------------------
# Async helper
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------
CACHE_DIR = os.path.join(DATA_DIR, "forexsb")

def _cache_path(symbol: str, period_min: int) -> str:
    """Returns the local cache file path for a symbol+period combo."""
    os.makedirs(os.path.join(CACHE_DIR, symbol.upper()), exist_ok=True)
    return os.path.join(CACHE_DIR, symbol.upper(), f"M{period_min}.parquet")

def is_symbol_cached(symbol: str, period_min: int = BASE_PERIOD) -> bool:
    """Returns True if the base M1 data for this symbol is cached locally."""
    return os.path.exists(_cache_path(symbol, period_min))

# Legacy compat shim: used by main.py's /api/download endpoint
def is_day_cached(symbol: str, date: datetime.date) -> bool:
    """Returns True if base M1 data for this symbol is already downloaded."""
    return is_symbol_cached(symbol, BASE_PERIOD)

# ---------------------------------------------------------------------------
# Core download: fetch one symbol's M1 data from ForexSB and cache it
# ---------------------------------------------------------------------------
async def async_download_symbol(symbol: str, client: httpx.AsyncClient = None) -> pd.DataFrame:
    """
    Downloads ForexSB M1 bar data for the given symbol, parses the proprietary
    .lb.gz binary format, and caches it locally as a Parquet file.

    Returns a DataFrame with DatetimeIndex (UTC) and columns:
        Open, High, Low, Close, Volume
    """
    symbol = symbol.upper()
    cache = _cache_path(symbol, BASE_PERIOD)

    # Return from cache if available
    if os.path.exists(cache):
        try:
            df = pd.read_parquet(cache)
            print(f"[ForexSB] Loaded {symbol} M1 from cache: {len(df)} bars")
            return df
        except Exception as e:
            print(f"[ForexSB] Cache read error for {symbol}, re-downloading: {e}")

    url = f"{FOREXSB_BASE_URL}/{symbol}{BASE_PERIOD}.lb.gz"
    print(f"[ForexSB] Downloading {symbol} M1 from {url} ...")

    # Use urllib.request with Accept-Encoding: identity to prevent auto-decompression.
    # httpx/requests auto-decompress gzip responses which breaks our manual gzip.decompress().
    def _do_download():
        req = urllib.request.Request(url, headers=FOREXSB_HEADERS)
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read()

    try:
        loop = asyncio.get_event_loop()
        gz_bytes = await loop.run_in_executor(None, _do_download)
    except Exception as e:
        print(f"[ForexSB] Download failed for {symbol}: {e}")
        return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])

    # Decompress gzip
    try:
        raw = gzip.decompress(gz_bytes)
    except Exception as e:
        print(f"[ForexSB] Decompression failed for {symbol}: {e}")
        return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])

    # Parse binary bars
    df = _parse_lb_binary(raw, symbol)

    if df.empty:
        print(f"[ForexSB] No bars parsed for {symbol}")
        return df

    # Cache to Parquet (fast columnar storage, no CSV quoting issues)
    try:
        df.to_parquet(cache)
        print(f"[ForexSB] Cached {symbol} M1: {len(df)} bars ({df.index[0]} -> {df.index[-1]})")
    except Exception as e:
        print(f"[ForexSB] Cache write failed for {symbol}: {e}")

    return df

def _parse_lb_binary(raw: bytes, symbol: str) -> pd.DataFrame:
    """
    Parses the ForexSB .lb binary format into a pandas DataFrame.

    Binary layout (28 bytes per bar, little-endian int32 × 7):
        [0] minutes since Unix epoch (1970-01-01 UTC)
        [1] Open  × priceScale
        [2] High  × priceScale
        [3] Low   × priceScale
        [4] Close × priceScale
        [5] Volume (tick count)
        [6] Spread in points (discarded — not needed by backtester)
    """
    n_bars = len(raw) // LB_BAR_SIZE
    if n_bars == 0:
        return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])

    # Vectorized parse with NumPy
    arr = np.frombuffer(raw[: n_bars * LB_BAR_SIZE], dtype="<i4").reshape(n_bars, 7)

    scale = _price_scale(symbol)
    # bar[0] = minutes since 2000-01-01 UTC  (the "millennium" constant in ForexSB's app.js)
    MILLENNIUM_EPOCH = pd.Timestamp("2000-01-01", tz="UTC")
    timestamps = MILLENNIUM_EPOCH + pd.to_timedelta(arr[:, 0].astype("int64"), unit="min")

    df = pd.DataFrame(
        {
            "Open":   arr[:, 1].astype(np.float64) / scale,
            "High":   arr[:, 2].astype(np.float64) / scale,
            "Low":    arr[:, 3].astype(np.float64) / scale,
            "Close":  arr[:, 4].astype(np.float64) / scale,
            "Volume": arr[:, 5].astype(np.float64),
        },
        index=timestamps,
    )

    # Remove timezone info after normalization (backtesting.py expects tz-naive)
    df.index = df.index.tz_localize(None)
    df.sort_index(inplace=True)
    return df

def download_symbol(symbol: str) -> pd.DataFrame:
    """Synchronous wrapper for async_download_symbol."""
    return run_async(async_download_symbol(symbol))

# ---------------------------------------------------------------------------
# Main public API: get_ohlcv_data
# ---------------------------------------------------------------------------
async def async_get_ohlcv_data(
    symbol: str,
    start_date: datetime.date,
    end_date: datetime.date,
    timeframe: str,
    higher_timeframe: str = None,
) -> pd.DataFrame:
    """
    Returns OHLCV data for the given symbol and date range at the requested timeframe.

    1. Downloads (or loads from cache) the full M1 dataset for the symbol.
    2. Filters to the requested date range.
    3. Resamples to the primary timeframe.
    4. Optionally adds Higher Timeframe (HTF) columns.
    """
    symbol = symbol.upper()

    # -- 1. Get M1 base data (cached after first download) --
    df_m1 = await async_download_symbol(symbol)

    if df_m1.empty:
        return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])

    # -- 2. Filter to requested date range --
    start_dt = pd.Timestamp(start_date)
    end_dt   = pd.Timestamp(end_date) + pd.Timedelta(days=1) - pd.Timedelta(seconds=1)
    df_m1 = df_m1[(df_m1.index >= start_dt) & (df_m1.index <= end_dt)]

    if df_m1.empty:
        return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])

    # -- 3. Resample to primary timeframe --
    tf_map = {
        "1m":  "1min",
        "5m":  "5min",
        "15m": "15min",
        "30m": "30min",
        "1h":  "1h",
        "4h":  "4h",
        "1d":  "1D",
    }

    resample_rules = {
        "Open":   "first",
        "High":   "max",
        "Low":    "min",
        "Close":  "last",
        "Volume": "sum",
    }

    offset = tf_map.get(timeframe.lower(), "1D")

    if offset == "1min":
        df_resampled = df_m1.copy()
    else:
        df_resampled = df_m1.resample(offset).agg(resample_rules)
        df_resampled.dropna(subset=["Open"], inplace=True)

    # -- 4. Higher timeframe columns (optional) --
    if (
        higher_timeframe
        and higher_timeframe.lower() in tf_map
        and higher_timeframe.lower() != timeframe.lower()
    ):
        htf_offset = tf_map[higher_timeframe.lower()]
        df_htf = df_m1.resample(htf_offset).agg(resample_rules).dropna(subset=["Open"])
        df_htf.columns = [f"{col}_htf" for col in df_htf.columns]

        df_resampled = pd.merge_asof(
            df_resampled,
            df_htf,
            left_index=True,
            right_index=True,
            direction="backward",
        )
        for col in df_htf.columns:
            if col in df_resampled.columns:
                df_resampled[col] = df_resampled[col].bfill().ffill()

    return df_resampled

def get_ohlcv_data(
    symbol: str,
    start_date: datetime.date,
    end_date: datetime.date,
    timeframe: str,
    higher_timeframe: str = None,
) -> pd.DataFrame:
    """Synchronous wrapper for async_get_ohlcv_data."""
    return run_async(async_get_ohlcv_data(symbol, start_date, end_date, timeframe, higher_timeframe))

# ---------------------------------------------------------------------------
# Legacy shim: download_and_cache_day (used by main.py /api/download SSE)
# ---------------------------------------------------------------------------
def download_and_cache_day(symbol: str, date: datetime.date, session=None) -> pd.DataFrame:
    """
    Legacy compatibility shim. With ForexSB source, data is downloaded per-symbol
    (not per-day). This triggers a full symbol download if not cached.
    """
    return run_async(async_download_symbol(symbol))
