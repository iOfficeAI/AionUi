#!/usr/bin/env python3
"""
vnstock CLI wrapper for AionUi
Provides command-line interface to vnstock library for Vietnamese stock market data
Compatible with vnstock v3.4.2+
"""

import argparse
import json
import sys
from datetime import datetime
from typing import Any, Dict, Optional

try:
    from vnstock import Vnstock
except ImportError:
    print(json.dumps({
        "success": False,
        "error": "vnstock library not installed. Run: pip install vnstock>=3.4.2"
    }), file=sys.stderr)
    sys.exit(1)


class VnstockCLI:
    """Command-line interface for vnstock operations"""

    def __init__(self):
        self.vnstock = Vnstock()

    def get_quote(self, symbol: str, start: Optional[str] = None, end: Optional[str] = None,
                  interval: str = '1D', source: str = 'KBS') -> Dict[str, Any]:
        """Get historical or intraday price data"""
        try:
            stock = self.vnstock.stock(symbol=symbol, source=source)
            df = stock.quote.history(start=start, end=end, interval=interval)

            if df is None or df.empty:
                return {"success": False, "error": f"No data found for symbol {symbol}"}

            data = df.reset_index().to_dict(orient='records')
            for record in data:
                for key, value in record.items():
                    if hasattr(value, 'isoformat'):
                        record[key] = value.isoformat()
                    elif hasattr(value, 'item'):
                        record[key] = value.item()

            return {
                "success": True,
                "data": data,
                "symbol": symbol,
                "interval": interval,
                "source": source,
                "count": len(data)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_financials(self, symbol: str, statement_type: str = 'balance_sheet',
                      period: str = 'annual', lang: str = 'en') -> Dict[str, Any]:
        """Get financial statements"""
        try:
            stock = self.vnstock.stock(symbol=symbol, source='KBS')

            if statement_type == 'balance_sheet':
                df = stock.finance.balance_sheet(period=period, lang=lang)
            elif statement_type == 'income_statement':
                df = stock.finance.income_statement(period=period, lang=lang)
            elif statement_type == 'cash_flow':
                df = stock.finance.cash_flow(period=period, lang=lang)
            elif statement_type == 'ratio':
                df = stock.finance.ratio(period=period, lang=lang)
            else:
                return {"success": False, "error": f"Invalid statement type: {statement_type}"}

            if df is None or df.empty:
                return {"success": False, "error": f"No {statement_type} data found for {symbol}"}

            data = df.reset_index().to_dict(orient='records')
            for record in data:
                for key, value in record.items():
                    if hasattr(value, 'item'):
                        record[key] = value.item()

            return {
                "success": True,
                "data": data,
                "symbol": symbol,
                "statement_type": statement_type,
                "period": period,
                "lang": lang,
                "count": len(data)
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def list_symbols(self, category: str = 'all', exchange: Optional[str] = None,
                     industry: Optional[str] = None, group: Optional[str] = None) -> Dict[str, Any]:
        """List market symbols"""
        try:
            stock = self.vnstock.stock(symbol='VCB', source='KBS')
            listing = stock.listing

            if category == 'all':
                df = listing.all_symbols()
            elif category == 'exchange':
                df = listing.symbols_by_exchange()
                if exchange and 'exchange' in df.columns:
                    df = df[df['exchange'] == exchange]
            elif category == 'industry':
                df = listing.symbols_by_industries()
                if industry and 'icb_code' in df.columns:
                    df = df[df['icb_code'] == industry]
            elif category == 'group' and group:
                df = listing.symbols_by_group(group=group)
            elif category == 'industry_list':
                df = listing.industries_icb()
            elif category == 'bonds':
                df = listing.all_government_bonds()
            elif category == 'futures':
                df = listing.all_future_indices()
            else:
                return {"success": False, "error": f"Invalid category or missing parameters. Category: {category}"}

            if df is None or df.empty:
                return {"success": False, "error": "No symbols found"}

            # Handle both DataFrame and Series
            if hasattr(df, 'to_dict'):
                if hasattr(df, 'columns'):
                    data = df.to_dict(orient='records')
                else:
                    data = [{"symbol": str(idx), "value": val} for idx, val in df.items()]
            else:
                data = list(df)

            for record in data:
                if isinstance(record, dict):
                    for key, value in record.items():
                        if hasattr(value, 'item'):
                            record[key] = value.item()

            return {"success": True, "data": data, "category": category, "count": len(data)}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_price_board(self, symbols_list: str, source: str = 'KBS') -> Dict[str, Any]:
        """Get real-time price board with bid/ask data"""
        try:
            symbols = [s.strip().upper() for s in symbols_list.split(',')]
            stock = self.vnstock.stock(symbol=symbols[0], source=source)
            trading = stock.trading

            df = trading.price_board(symbols_list=symbols)

            if df is None or df.empty:
                return {"success": False, "error": "No price board data found"}

            data = df.to_dict(orient='records')
            for record in data:
                for key, value in record.items():
                    if hasattr(value, 'item'):
                        record[key] = value.item()

            return {"success": True, "data": data, "symbols": symbols, "source": source, "count": len(data)}
        except Exception as e:
            return {"success": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description='vnstock CLI for Vietnamese stock market data')
    parser.add_argument('command', choices=['quote', 'finance', 'listing', 'trading'],
                       help='Command to execute')
    parser.add_argument('--params', type=str, help='JSON parameters for the command')

    args = parser.parse_args()

    params = {}
    if args.params:
        try:
            params = json.loads(args.params)
        except json.JSONDecodeError as e:
            print(json.dumps({"success": False, "error": f"Invalid JSON parameters: {str(e)}"}))
            sys.exit(1)

    cli = VnstockCLI()

    try:
        if args.command == 'quote':
            result = cli.get_quote(**params)
        elif args.command == 'finance':
            result = cli.get_financials(**params)
        elif args.command == 'listing':
            result = cli.list_symbols(**params)
        elif args.command == 'trading':
            result = cli.get_price_board(**params)
        else:
            result = {"success": False, "error": f"Unknown command: {args.command}"}

        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Command execution failed: {str(e)}"}))
        sys.exit(1)


if __name__ == '__main__':
    main()
