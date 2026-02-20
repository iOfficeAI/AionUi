# Vietnamese Stock Market Assistant (vnstock)

A specialized assistant for analyzing Vietnamese stock market data using the [vnstock](https://github.com/thinh-vu/vnstock) Python library.

## Overview

This assistant provides comprehensive access to Vietnamese stock market data including:

- **Real-time quotes** and historical prices for HOSE, HNX, and UPCOM exchanges
- **Financial statements** (balance sheets, income statements, cash flows, ratios)
- **Market listings** by exchange, industry, or index group (VN30, VNMidCap, etc.)
- **Trading data** with bid/ask price boards
- **Stock screening** capabilities
- **Fund data** for ETFs and mutual funds

## Requirements

### Python

- Python 3.10 or higher
- vnstock library (>=3.4.2)
- Additional dependencies: pandas, requests, beautifulsoup4

### Installation

The vnstock dependencies are automatically installed during `npm install` via the postinstall script.

#### Manual Installation

If automatic installation fails, you can install manually:

```bash
bash scripts/install-vnstock.sh
```

Or install Python dependencies directly:

```bash
pip install -r scripts/requirements-vnstock.txt
```

### Verify Installation

```bash
python3 -c "import vnstock; print(f'vnstock version: {vnstock.__version__}')"
```

## Vietnamese Market Context

### Exchanges

- **HOSE** (Ho Chi Minh Stock Exchange): Main board for large-cap stocks
- **HNX** (Hanoi Stock Exchange): Second board for mid-cap stocks
- **UPCOM**: Unlisted public company market

### Key Indices

- **VNIndex**: Tracks HOSE exchange
- **HNXIndex**: Tracks HNX exchange
- **VN30**: Top 30 largest and most liquid stocks on HOSE
- **VNMidCap**: Mid-cap stocks on HOSE
- **VNSmallCap**: Small-cap stocks on HOSE

### Major Stocks

- **VCB**: Vietcombank (Vietnam Joint Stock Commercial Bank for Foreign Trade)
- **ACB**: Asia Commercial Bank
- **TCB**: Techcombank (Vietnam Technological and Commercial Joint Stock Bank)
- **VNM**: Vinamilk (Vietnam Dairy Products Joint Stock Company)
- **HPG**: Hoa Phat Group (Steel and real estate)
- **VHM**: Vinhomes (Real estate)
- **GAS**: PetroVietnam Gas Joint Stock Corporation

## Usage Examples

### Get Historical Price Data

```
User: "Get historical price data for VCB from 2024-01-01 to today"

Assistant will:
1. Fetch daily price data for VCB
2. Display price trends
3. Calculate key statistics (high, low, average, volatility)
4. Provide market context
```

### Retrieve Financial Statements

```
User: "Show me the balance sheet for ACB"

Assistant will:
1. Fetch latest annual balance sheet
2. Display key financial metrics
3. Highlight important ratios
4. Compare to previous periods if available
```

### List Stocks by Exchange

```
User: "List all stocks on the HOSE exchange"

Assistant will:
1. Retrieve all symbols from HOSE
2. Group by sector/industry
3. Provide summary statistics
4. Highlight notable stocks
```

### Compare Multiple Stocks

```
User: "Compare financial ratios for VCB, ACB, and TCB"

Assistant will:
1. Fetch financial data for all three banks
2. Calculate key ratios (P/E, ROE, ROA, etc.)
3. Present side-by-side comparison
4. Provide analysis and insights
```

## Data Sources

The vnstock library uses **KBS (KB Securities)** as the default data source (since v3.4.0+). VCI (Vietcap Securities) is also supported but may require local installation.

## Rate Limits

### Free Tier Limits

- **Guest** (no account): 20 requests/minute
- **Community** (free account): 60 requests/minute

### Get Higher Limits

Register for a free account at [vnstocks.com](https://vnstocks.com/login) to increase your rate limit from 20 to 60 requests/minute.

## Important Disclaimers

1. **Not for Live Trading**: Data may be incomplete, inconsistent, or delayed
2. **Always Verify**: Cross-check critical data with official sources
3. **Market Data Delay**: Real-time data may have delays
4. **Historical Limitations**: Historical data depth varies by stock and data type
5. **Data Completeness**: Some companies may have missing or incomplete financial data

## Technical Architecture

### Components

1. **Python CLI Wrapper** (`scripts/vnstock_cli.py`):
   - Command-line interface to vnstock library
   - JSON input/output for interoperability
   - Supports all vnstock operations

2. **Node.js Service** (`src/process/services/vnstockService.ts`):
   - TypeScript service layer
   - Spawns Python subprocess for data retrieval
   - Type-safe API for main process

3. **IPC Bridge** (`src/process/bridge/vnstockBridge.ts`):
   - Exposes vnstock service to renderer process
   - Handles async communication

### Data Flow

```
User Request → Renderer → IPC Bridge → vnstockService → Python CLI → vnstock Library → Vietnamese Market Data APIs → Response
```

## Supported Languages

The assistant provides localized rules in:

- English (en-US)
- Chinese Simplified (zh-CN)
- Chinese Traditional (zh-TW)
- Japanese (ja-JP)
- Korean (ko-KR)

## Migration from Finance Assistant

If you previously used the "Finance Research" assistant, it has been replaced by this specialized Vietnamese stock market assistant. The general finance features have been removed to focus exclusively on Vietnamese equities.

### What Changed

- **ID**: `finance` → `vnstock`
- **Focus**: General finance → Vietnamese stock market
- **Features**: Removed investor personas, added vnstock-specific capabilities
- **Data Source**: Financial Datasets API → vnstock library

### Existing Conversations

Existing conversations with the finance assistant will continue to work but will reference the old assistant configuration. Create new conversations to use the vnstock assistant features.

## Troubleshooting

### vnstock Not Installed

**Error**: `vnstock library not installed`

**Solution**:

```bash
bash scripts/install-vnstock.sh
```

### Python Version Too Old

**Error**: `Python 3.10 or higher is required`

**Solution**: Install Python 3.10+ from [python.org](https://www.python.org/downloads/)

### Rate Limit Exceeded

**Error**: `Rate limit exceeded`

**Solution**:

1. Wait before making additional requests
2. Register for a free account at [vnstocks.com](https://vnstocks.com/login)
3. Batch requests to reduce API calls

### No Data Available

**Error**: `No data found for symbol`

**Solution**:

1. Verify symbol is correct (uppercase, no exchange suffix)
2. Try different date range
3. Check if symbol is delisted or suspended
4. Verify exchange (HOSE, HNX, UPCOM)

## Resources

- **vnstock GitHub**: https://github.com/thinh-vu/vnstock
- **vnstock Documentation**: https://docs.vnstocks.com
- **vnstocks.com**: https://vnstocks.com (free account registration)
- **HOSE Website**: https://www.hsx.vn
- **HNX Website**: https://www.hnx.vn

## Version History

### v2.0.0 (2025-02-20)

- Initial release as specialized Vietnamese stock market assistant
- Replaced general Finance Research assistant
- Integrated vnstock library v3.4.2+
- Support for HOSE, HNX, and UPCOM exchanges
- Comprehensive financial data retrieval
- Multi-language support (5 languages)

## Support

For issues related to:

- **AionUi integration**: Report at [AionUi GitHub issues](https://github.com/anthropics/aionui/issues)
- **vnstock library**: Report at [vnstock GitHub issues](https://github.com/thinh-vu/vnstock/issues)
- **Market data**: Contact data providers (KBS, VCI)

## License

This assistant configuration is part of AionUi and follows the Apache-2.0 license.

The vnstock library is licensed separately under MIT license.
