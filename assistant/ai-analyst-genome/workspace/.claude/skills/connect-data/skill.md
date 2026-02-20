# Connect Data Skill

# Add New Dataset Connection

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/connect-data` command
- When user wants to add a new data source

## Command

`/connect-data` - Interactive wizard for adding a data connection
`/connect-data [path]` - Connect to a specific data file or API

## Purpose

Add new data connections beyond the default vnstock platform. Supports CSV files, additional APIs, or alternative data sources. New connections are registered in `data_sources.yaml` and `.knowledge/active.yaml`.

## Supported Connection Types

| Type    | Description                        | Example                                 |
| ------- | ---------------------------------- | --------------------------------------- |
| vnstock | Vietnamese stock library (default) | Already connected                       |
| csv     | Local CSV file                     | `/connect-data data/my_portfolio.csv`   |
| parquet | Local Parquet file                 | `/connect-data data/historical.parquet` |

## Workflow

1. User runs `/connect-data [path]`
2. System validates the file/connection exists
3. Auto-detect schema (columns, types, row count)
4. Create entry in `data_sources.yaml`
5. Create `.knowledge/datasets/[name]/manifest.yaml`
6. Profile the data via data-profiling skill
7. Confirm connection with summary

## Rules

1. **Validate first** - Check file exists and is readable before registering
2. **Schema detection** - Auto-detect column types and expected ranges
3. **No overwrites** - Warn if connection name already exists
4. **Profile on connect** - Run data-profiling automatically for new connections

---

**Powered by AI Analyst Lab | aianalystlab.ai**
