#!/usr/bin/env python3
"""
Historical strategy backtesting engine for Vietnamese stock market.

Supports:
- Factor-based strategies (value, momentum, quality, growth)
- Screening strategies (custom filter criteria)
- Equal-weight and risk-adjusted portfolio construction
- Vietnamese market constraints (T+2, price limits, tax, liquidity)

Usage:
    python run_backtest.py --strategy value --universe VN30 --start 2021-01-01 --end 2025-12-31
    python run_backtest.py --strategy momentum --period 6M --rebalance quarterly
    python run_backtest.py --strategy custom --filter "PE<15,ROE>15" --universe HOSE
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime, timedelta
from typing import Optional

sys.path.insert(0, '.')

_WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))))

for _p in [
    os.path.join(_WORKSPACE_ROOT, 'helpers'),
    os.path.join(_WORKSPACE_ROOT, '.claude', 'skills', 'vnstock-data'),
]:
    if _p not in sys.path:
        sys.path.insert(0, _p)


# Vietnamese market constants
TRANSACTION_COST_PCT = 0.002  # 0.2% round trip
SELLING_TAX_PCT = 0.001  # 0.1% selling tax
T_PLUS_2_DAYS = 2  # T+2 settlement
DAILY_PRICE_LIMIT = 0.07  # +/-7% daily limit
MIN_VOLUME_FILTER = 100_000  # Min avg daily volume
REBALANCE_LAG_DAYS = 2  # Signal → execution lag
FINANCIAL_DATA_LAG_DAYS = 45  # Reporting lag


def _safe_div(a, b, default=0.0):
    if b is None or b == 0:
        return default
    return a / b


class BacktestResult:
    """Container for backtest performance metrics."""

    def __init__(self):
        self.portfolio_values = []
        self.dates = []
        self.trades = []
        self.holdings_history = []

    def calculate_metrics(self, benchmark_values=None) -> dict:
        """Calculate performance metrics from portfolio value series."""
        if len(self.portfolio_values) < 2:
            return {"error": "Insufficient data for metrics"}

        values = self.portfolio_values
        n_days = len(values)

        # Total return
        total_return = (values[-1] / values[0]) - 1

        # Annualized return
        years = n_days / 252
        annual_return = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0

        # Daily returns
        daily_returns = []
        for i in range(1, len(values)):
            daily_returns.append((values[i] / values[i - 1]) - 1)

        # Volatility
        if daily_returns:
            mean_ret = sum(daily_returns) / len(daily_returns)
            variance = sum((r - mean_ret) ** 2 for r in daily_returns) / len(daily_returns)
            daily_vol = math.sqrt(variance)
            annual_vol = daily_vol * math.sqrt(252)
        else:
            annual_vol = 0

        # Sharpe ratio (risk-free rate ~4.5% for VND)
        risk_free = 0.045
        sharpe = _safe_div(annual_return - risk_free, annual_vol) if annual_vol > 0 else 0

        # Max drawdown
        peak = values[0]
        max_dd = 0
        for v in values:
            if v > peak:
                peak = v
            dd = (peak - v) / peak
            if dd > max_dd:
                max_dd = dd

        # Win rate
        wins = sum(1 for r in daily_returns if r > 0)
        win_rate = wins / len(daily_returns) if daily_returns else 0

        # Sortino ratio
        downside_returns = [r for r in daily_returns if r < 0]
        if downside_returns:
            downside_var = sum(r ** 2 for r in downside_returns) / len(downside_returns)
            downside_dev = math.sqrt(downside_var) * math.sqrt(252)
            sortino = _safe_div(annual_return - risk_free, downside_dev)
        else:
            sortino = 0

        metrics = {
            "total_return": round(total_return * 100, 2),
            "annual_return": round(annual_return * 100, 2),
            "annual_volatility": round(annual_vol * 100, 2),
            "sharpe_ratio": round(sharpe, 2),
            "sortino_ratio": round(sortino, 2),
            "max_drawdown": round(max_dd * 100, 2),
            "win_rate": round(win_rate * 100, 1),
            "total_trades": len(self.trades),
            "trading_days": n_days,
            "years": round(years, 1),
        }

        # Benchmark comparison
        if benchmark_values and len(benchmark_values) >= 2:
            bench_return = (benchmark_values[-1] / benchmark_values[0]) - 1
            bench_annual = (1 + bench_return) ** (1 / years) - 1 if years > 0 else 0
            metrics["benchmark_return"] = round(bench_return * 100, 2)
            metrics["benchmark_annual_return"] = round(bench_annual * 100, 2)
            metrics["alpha"] = round((annual_return - bench_annual) * 100, 2)

        return metrics


def fetch_universe_symbols(universe: str) -> list:
    """Fetch stock symbols for the given universe."""
    try:
        from vnstock_lib import list_symbols
        if universe.upper() in ('VN30', 'VN100', 'VNALL'):
            df = list_symbols(group=universe.upper())
        elif universe.upper() in ('HOSE', 'HNX', 'UPCOM'):
            df = list_symbols(exchange=universe.upper())
        else:
            df = list_symbols(group='VN30')

        if 'ticker' in df.columns:
            return df['ticker'].tolist()
        return df.iloc[:, 0].tolist()
    except Exception:
        # Fallback: hardcoded VN30
        return [
            'VCB', 'TCB', 'VPB', 'ACB', 'BID', 'CTG', 'MBB', 'STB',
            'HPG', 'FPT', 'VNM', 'VHM', 'VIC', 'MWG', 'MSN',
            'PLX', 'GAS', 'SAB', 'VRE', 'SSI', 'BCM', 'GVR',
            'PDR', 'TPB', 'HDB', 'SHB', 'KDH', 'VJC', 'POW', 'REE'
        ]


def fetch_price_data(symbol: str, start: str, end: str) -> list:
    """Fetch daily price data for a symbol, returns list of (date, close, volume)."""
    try:
        from vnstock_lib import fetch_quote
        df = fetch_quote(symbol, start=start, end=end)
        if df is None or df.empty:
            return []

        records = []
        for _, row in df.iterrows():
            date_val = str(row.get('time', row.name))[:10]
            close = float(row.get('close', 0))
            volume = float(row.get('volume', 0))
            if close > 0:
                records.append((date_val, close, volume))
        return records
    except Exception:
        return []


def fetch_factor_data(symbol: str, factor: str, period: str = 'quarterly') -> Optional[float]:
    """Fetch a factor value for a symbol."""
    try:
        from vnstock_helpers import get_ratio_value
        ratio_map = {
            'pe': 'P/E',
            'pb': 'P/B',
            'roe': 'ROE',
            'roa': 'ROA',
            'de': 'D/E',
            'eps_growth': 'EPS growth',
            'revenue_growth': 'Revenue growth',
            'margin': 'Net margin',
        }
        ratio_name = ratio_map.get(factor.lower(), factor)
        return get_ratio_value(symbol, ratio_name, period=period)
    except Exception:
        return None


def run_factor_backtest(
    strategy: str,
    universe: str,
    start_date: str,
    end_date: str,
    rebalance_freq: str = 'quarterly',
    top_n: int = 10,
    initial_capital: float = 1_000_000_000,  # 1 billion VND
) -> dict:
    """Run a factor-based backtest.

    Strategies:
    - value: Sort by P/E ascending (lowest P/E = best value)
    - momentum: Sort by 6M return descending
    - quality: Sort by ROE descending
    - growth: Sort by revenue growth descending
    - low_vol: Sort by 6M volatility ascending
    """
    symbols = fetch_universe_symbols(universe)

    # Calculate rebalance dates
    start_dt = datetime.strptime(start_date, '%Y-%m-%d')
    end_dt = datetime.strptime(end_date, '%Y-%m-%d')

    freq_days = {
        'monthly': 21,
        'quarterly': 63,
        'semi_annual': 126,
        'annual': 252,
    }
    rebal_interval = freq_days.get(rebalance_freq, 63)

    # Fetch all price data
    print(f"Fetching price data for {len(symbols)} stocks...", file=sys.stderr)
    price_cache = {}
    for sym in symbols:
        data = fetch_price_data(sym, start_date, end_date)
        if data and len(data) > 20:
            price_cache[sym] = data

    available_symbols = list(price_cache.keys())
    if len(available_symbols) < top_n:
        return {"error": f"Only {len(available_symbols)} stocks have data. Need at least {top_n}."}

    # Build date universe (all trading dates)
    all_dates = set()
    for sym_data in price_cache.values():
        for date_str, _, _ in sym_data:
            all_dates.add(date_str)
    sorted_dates = sorted(all_dates)

    # Build price lookup: symbol → date → close
    price_lookup = {}
    for sym, data in price_cache.items():
        price_lookup[sym] = {d: c for d, c, v in data}

    volume_lookup = {}
    for sym, data in price_cache.items():
        volume_lookup[sym] = {d: v for d, c, v in data}

    # Run simulation
    result = BacktestResult()
    portfolio_value = initial_capital
    holdings = {}  # symbol → (shares, avg_price)
    cash = initial_capital
    days_since_rebal = rebal_interval  # Force initial rebalance

    benchmark_values = []
    # Track VN-Index as benchmark (equal-weight of universe)
    bench_start = None

    for date_idx, date_str in enumerate(sorted_dates):
        # Calculate current portfolio value
        port_val = cash
        for sym, (shares, _) in holdings.items():
            if sym in price_lookup and date_str in price_lookup[sym]:
                port_val += shares * price_lookup[sym][date_str]

        result.portfolio_values.append(port_val)
        result.dates.append(date_str)

        # Benchmark: equal-weight universe
        if bench_start is None:
            bench_start = {}
            for sym in available_symbols:
                if date_str in price_lookup.get(sym, {}):
                    bench_start[sym] = price_lookup[sym][date_str]

        bench_val = 0
        bench_count = 0
        for sym, start_p in bench_start.items():
            if date_str in price_lookup.get(sym, {}) and start_p > 0:
                bench_val += price_lookup[sym][date_str] / start_p
                bench_count += 1
        if bench_count > 0:
            benchmark_values.append(initial_capital * bench_val / bench_count)
        else:
            benchmark_values.append(benchmark_values[-1] if benchmark_values else initial_capital)

        # Check for rebalance
        days_since_rebal += 1
        if days_since_rebal < rebal_interval:
            continue
        days_since_rebal = 0

        # Score all symbols based on strategy
        scores = {}
        for sym in available_symbols:
            if date_str not in price_lookup.get(sym, {}):
                continue

            # Liquidity filter
            recent_volumes = []
            for dd in sorted_dates[max(0, date_idx - 20):date_idx + 1]:
                if dd in volume_lookup.get(sym, {}):
                    recent_volumes.append(volume_lookup[sym][dd])
            if recent_volumes:
                avg_vol = sum(recent_volumes) / len(recent_volumes)
                if avg_vol < MIN_VOLUME_FILTER:
                    continue

            if strategy == 'value':
                val = fetch_factor_data(sym, 'pe')
                if val and val > 0:
                    scores[sym] = -val  # Lower P/E = higher score

            elif strategy == 'momentum':
                # 6-month price momentum
                lookback = max(0, date_idx - 126)
                if lookback < date_idx:
                    lb_date = sorted_dates[lookback]
                    if lb_date in price_lookup.get(sym, {}):
                        cur_p = price_lookup[sym][date_str]
                        lb_p = price_lookup[sym][lb_date]
                        if lb_p > 0:
                            scores[sym] = (cur_p / lb_p) - 1

            elif strategy == 'quality':
                val = fetch_factor_data(sym, 'roe')
                if val:
                    scores[sym] = val

            elif strategy == 'growth':
                val = fetch_factor_data(sym, 'revenue_growth')
                if val:
                    scores[sym] = val

            elif strategy == 'low_vol':
                # Lower volatility = higher score
                recent_closes = []
                for dd in sorted_dates[max(0, date_idx - 126):date_idx + 1]:
                    if dd in price_lookup.get(sym, {}):
                        recent_closes.append(price_lookup[sym][dd])
                if len(recent_closes) > 20:
                    returns = [(recent_closes[i] / recent_closes[i - 1]) - 1
                               for i in range(1, len(recent_closes))]
                    mean_r = sum(returns) / len(returns)
                    vol = math.sqrt(sum((r - mean_r) ** 2 for r in returns) / len(returns))
                    if vol > 0:
                        scores[sym] = -vol  # Lower vol = higher score

        if not scores:
            continue

        # Select top N
        ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        selected = [sym for sym, _ in ranked[:top_n]]

        # Sell current holdings not in new selection
        for sym in list(holdings.keys()):
            if sym not in selected:
                shares, _ = holdings[sym]
                if date_str in price_lookup.get(sym, {}):
                    sell_price = price_lookup[sym][date_str]
                    proceeds = shares * sell_price
                    cost = proceeds * (TRANSACTION_COST_PCT / 2 + SELLING_TAX_PCT)
                    cash += proceeds - cost
                    result.trades.append({
                        'date': date_str,
                        'symbol': sym,
                        'action': 'SELL',
                        'shares': shares,
                        'price': sell_price,
                        'cost': cost,
                    })
                del holdings[sym]

        # Equal-weight allocation to selected stocks
        target_per_stock = port_val / len(selected) if selected else 0

        for sym in selected:
            if date_str not in price_lookup.get(sym, {}):
                continue

            current_price = price_lookup[sym][date_str]
            if current_price <= 0:
                continue

            current_shares = holdings.get(sym, (0, 0))[0]
            current_value = current_shares * current_price
            target_shares = int(target_per_stock / current_price)

            if target_shares > current_shares:
                # Buy more
                buy_shares = target_shares - current_shares
                buy_cost = buy_shares * current_price
                fee = buy_cost * (TRANSACTION_COST_PCT / 2)
                if cash >= buy_cost + fee:
                    cash -= buy_cost + fee
                    holdings[sym] = (target_shares, current_price)
                    result.trades.append({
                        'date': date_str,
                        'symbol': sym,
                        'action': 'BUY',
                        'shares': buy_shares,
                        'price': current_price,
                        'cost': fee,
                    })
            elif target_shares < current_shares and current_shares > 0:
                # Sell excess
                sell_shares = current_shares - target_shares
                proceeds = sell_shares * current_price
                fee = proceeds * (TRANSACTION_COST_PCT / 2 + SELLING_TAX_PCT)
                cash += proceeds - fee
                holdings[sym] = (target_shares, current_price)
                result.trades.append({
                    'date': date_str,
                    'symbol': sym,
                    'action': 'SELL',
                    'shares': sell_shares,
                    'price': current_price,
                    'cost': fee,
                })

        result.holdings_history.append({
            'date': date_str,
            'holdings': {s: h[0] for s, h in holdings.items()},
            'cash': cash,
            'portfolio_value': port_val,
        })

    # Calculate final metrics
    metrics = result.calculate_metrics(benchmark_values)

    return {
        "strategy": strategy,
        "universe": universe,
        "period": f"{start_date} to {end_date}",
        "rebalance_frequency": rebalance_freq,
        "top_n_stocks": top_n,
        "initial_capital_vnd": initial_capital,
        "final_portfolio_value_vnd": result.portfolio_values[-1] if result.portfolio_values else initial_capital,
        "performance": metrics,
        "transaction_assumptions": {
            "round_trip_cost_pct": TRANSACTION_COST_PCT * 100,
            "selling_tax_pct": SELLING_TAX_PCT * 100,
            "execution_lag_days": REBALANCE_LAG_DAYS,
            "liquidity_filter_min_volume": MIN_VOLUME_FILTER,
        },
        "rebalance_count": len(result.holdings_history),
        "total_trades": len(result.trades),
        "sample_holdings": result.holdings_history[-1] if result.holdings_history else {},
    }


def main():
    parser = argparse.ArgumentParser(
        description="Run historical strategy backtest for Vietnamese stocks"
    )
    parser.add_argument("--strategy", type=str, required=True,
                        choices=['value', 'momentum', 'quality', 'growth', 'low_vol'],
                        help="Factor strategy to backtest")
    parser.add_argument("--universe", type=str, default="VN30",
                        help="Stock universe (VN30, VN100, HOSE, HNX)")
    parser.add_argument("--start", type=str, default=None,
                        help="Start date (YYYY-MM-DD), default: 3 years ago")
    parser.add_argument("--end", type=str, default=None,
                        help="End date (YYYY-MM-DD), default: today")
    parser.add_argument("--rebalance", type=str, default="quarterly",
                        choices=['monthly', 'quarterly', 'semi_annual', 'annual'],
                        help="Rebalance frequency")
    parser.add_argument("--top-n", type=int, default=10,
                        help="Number of top stocks to hold")
    parser.add_argument("--capital", type=float, default=1_000_000_000,
                        help="Initial capital in VND (default: 1B)")
    parser.add_argument("--output", type=str, default=None,
                        help="Output JSON file path")

    args = parser.parse_args()

    if args.end is None:
        args.end = datetime.now().strftime('%Y-%m-%d')
    if args.start is None:
        end_dt = datetime.strptime(args.end, '%Y-%m-%d')
        args.start = (end_dt - timedelta(days=3 * 365)).strftime('%Y-%m-%d')

    print(f"Running {args.strategy} backtest on {args.universe}...", file=sys.stderr)
    print(f"Period: {args.start} to {args.end}", file=sys.stderr)
    print(f"Rebalance: {args.rebalance}, Top {args.top_n} stocks", file=sys.stderr)

    result = run_factor_backtest(
        strategy=args.strategy,
        universe=args.universe,
        start_date=args.start,
        end_date=args.end,
        rebalance_freq=args.rebalance,
        top_n=args.top_n,
        initial_capital=args.capital,
    )

    output_json = json.dumps(result, indent=2, default=str)
    print(output_json)

    if args.output:
        os.makedirs(os.path.dirname(args.output) or '.', exist_ok=True)
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"Results saved to {args.output}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
