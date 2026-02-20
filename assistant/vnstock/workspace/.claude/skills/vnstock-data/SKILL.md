# vnstock Data Skill

Vietnamese stock market data access via vnstock library.

## Commands

### Get Quote

```bash
python scripts/vnstock_cli.py quote --params '{"symbol":"VCB","start":"2024-01-01","end":"2025-02-20"}'
```

### Get Financials

```bash
python scripts/vnstock_cli.py finance --params '{"symbol":"VCB","statement_type":"balance_sheet"}'
```

### List Symbols

```bash
python scripts/vnstock_cli.py listing --params '{"category":"all"}'
```

### Get Price Board

```bash
python scripts/vnstock_cli.py trading --params '{"symbols_list":"VCB,ACB,TCB"}'
```
