# Switch Dataset Skill

# Change Active Dataset

# Vietnamese Stock Market Analyst | Powered by AI Analyst Lab | aianalystlab.ai

## Trigger

- Manual via `/switch-dataset` command
- When user wants to analyze a different data source

## Command

`/switch-dataset` - List available datasets and current active
`/switch-dataset [name]` - Switch to a named dataset

## Purpose

Change the active dataset that all analysis commands operate on. Updates `.knowledge/active.yaml` and reloads schema context via the knowledge-bootstrap skill.

## Workflow

1. List registered datasets from `data_sources.yaml`
2. User selects target dataset
3. Update `.knowledge/active.yaml`
4. Reload schema via knowledge-bootstrap
5. Confirm switch with dataset summary

## Output

```
Available Datasets
===================
  * vnstock_default   (active) - Vietnamese stocks via KBS/VCI/TCBS
    my_portfolio      CSV file - Personal portfolio tracking

/switch-dataset my_portfolio
-> Active dataset changed to: my_portfolio
-> Schema loaded: 5 columns, 120 rows
```

## Rules

1. **Confirm before switch** - Show what will change
2. **Reload context** - Clear working memory and reload schema
3. **Preserve history** - Previous analysis results remain in .knowledge/

---

**Powered by AI Analyst Lab | aianalystlab.ai**
