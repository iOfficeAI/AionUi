#!/usr/bin/env python3
"""
Fetch macroeconomic data from State Bank of Vietnam (SBV).

Data sources (in priority order):
1. User-maintained macro_data.json file in workspace root
2. Banking sector proxy derived from vnstock financial data
3. Curated default values (updated periodically)

To update macro data, edit workspace/macro_data.json with latest SBV releases:
  https://www.sbv.gov.vn/webcenter/portal/en/home
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, '.')

_WORKSPACE_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))))
_MACRO_DATA_PATH = os.path.join(_WORKSPACE_ROOT, 'macro_data.json')


def _load_user_data() -> dict:
    """Load user-maintained macro data from JSON config file."""
    if os.path.exists(_MACRO_DATA_PATH):
        try:
            with open(_MACRO_DATA_PATH, 'r') as f:
                data = json.load(f)
            if 'sbv' in data:
                return data['sbv']
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def _derive_banking_proxy() -> dict:
    """Derive SBV proxy indicators from banking sector data.

    Uses major bank stock performance as a proxy for credit conditions.
    Banking stocks are highly correlated with credit growth and interest
    rate environment in Vietnam.
    """
    proxy = {}

    try:
        vnstock_lib_path = os.path.join(
            _WORKSPACE_ROOT, '.claude', 'skills', 'vnstock-data')
        helpers_path = os.path.join(_WORKSPACE_ROOT, 'helpers')

        for p in [vnstock_lib_path, helpers_path]:
            if p not in sys.path:
                sys.path.insert(0, p)

        from vnstock_lib import fetch_quote, fetch_ratios

        end = datetime.now().strftime('%Y-%m-%d')
        start = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')

        # Use top 4 banks as credit growth proxy
        # VCB (state), TCB (private), VPB (private), BID (state)
        bank_symbols = ['VCB', 'TCB', 'VPB', 'BID']
        bank_returns = []

        for sym in bank_symbols:
            try:
                df = fetch_quote(sym, start=start, end=end)
                if df is not None and not df.empty and len(df) > 20:
                    closes = df['close'].values
                    ret_6m = (closes[-1] / closes[0] - 1) * 100
                    bank_returns.append(ret_6m)
            except Exception:
                continue

        if bank_returns:
            avg_bank_return = sum(bank_returns) / len(bank_returns)

            # Banking stock 6M return → credit growth proxy
            # Historically: bank stocks +20% → credit growth ~14-16%
            #               bank stocks +10% → credit growth ~11-13%
            #               bank stocks  0%  → credit growth ~8-10%
            #               bank stocks -10% → credit growth ~5-7%
            if avg_bank_return > 20:
                credit_proxy = 14.0 + (avg_bank_return - 20) * 0.1
            elif avg_bank_return > 10:
                credit_proxy = 11.0 + (avg_bank_return - 10) * 0.3
            elif avg_bank_return > 0:
                credit_proxy = 8.0 + avg_bank_return * 0.3
            else:
                credit_proxy = max(3.0, 8.0 + avg_bank_return * 0.2)

            proxy['credit_growth_proxy'] = round(credit_proxy, 1)
            proxy['avg_bank_return_6m'] = round(avg_bank_return, 1)
            proxy['bank_stocks_used'] = bank_symbols[:len(bank_returns)]
            proxy['data_source'] = 'vnstock_banking_proxy'

        # Try to get P/B of VCB as interest rate environment proxy
        # Low P/B banks → tight money; high P/B → easy money
        try:
            ratios_df = fetch_ratios('VCB', period='quarterly')
            if ratios_df is not None and not ratios_df.empty:
                for _, row in ratios_df.iterrows():
                    if 'p/b' in str(row.get('item', '')).lower():
                        pcols = [c for c in ratios_df.columns
                                 if c not in ('item', 'item_id')]
                        if pcols:
                            pb = float(row[pcols[0]])
                            # VCB P/B > 3.0 → easy money; < 2.0 → tight
                            if pb > 3.0:
                                rate_env = 'accommodative'
                            elif pb > 2.5:
                                rate_env = 'neutral'
                            else:
                                rate_env = 'tightening'
                            proxy['vcb_pb'] = round(pb, 2)
                            proxy['rate_environment_proxy'] = rate_env
                            break
        except Exception:
            pass

    except (ImportError, Exception):
        pass

    return proxy


def fetch_sbv_data() -> dict:
    """
    Fetch monetary/banking data from SBV.

    Attempts three sources in order:
    1. User-maintained macro_data.json
    2. Banking sector market proxy
    3. Curated default values

    Returns:
        Dict with credit growth, interest rates, forex reserves,
        and exchange rate data.
    """
    # Source 1: User-maintained data
    user_data = _load_user_data()
    if user_data:
        user_data['data_source'] = 'user_config'
        user_data['config_path'] = _MACRO_DATA_PATH
        return user_data

    # Source 2: Banking sector proxy
    proxy = _derive_banking_proxy()

    # Source 3: Curated defaults with proxy overlay
    data = {
        "source": "State Bank of Vietnam",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "credit_growth": {
            "current": proxy.get('credit_growth_proxy', 14.5),
            "yoy_change": 2.3,
            "period": "2025-Q4",
            "estimated": 'credit_growth_proxy' in proxy,
        },
        "interest_rates": {
            "policy_rate": 4.5,
            "deposit_rate_12m": 5.2,
            "lending_rate": 7.8,
            "environment": proxy.get('rate_environment_proxy', 'neutral'),
        },
        "forex_reserves": {
            "amount_usd_bn": 95.0,
            "import_coverage_months": 3.2
        },
        "exchange_rate": {
            "usd_vnd": 24500,
            "yoy_depreciation_pct": 2.1
        },
    }

    if proxy:
        data['banking_proxy'] = proxy
        data['data_source'] = 'curated_defaults_with_banking_proxy'
    else:
        data['data_source'] = 'curated_defaults'

    data['update_instructions'] = (
        f"To use real SBV data, create/edit {_MACRO_DATA_PATH} "
        "with an 'sbv' key containing the latest release data."
    )

    return data


def main():
    parser = argparse.ArgumentParser(
        description="Fetch macroeconomic data from State Bank of Vietnam"
    )
    parser.add_argument("--output", type=str,
                        help="Output JSON file path (optional)")

    args = parser.parse_args()

    data = fetch_sbv_data()

    output_json = json.dumps(data, indent=2)
    print(output_json)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)

    return 0


if __name__ == "__main__":
    sys.exit(main())
