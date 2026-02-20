"""Factor analyst skill - Quantitative factor calculations for Vietnamese stocks."""

# Re-export commonly used functions for easier imports
# Users can do: from factor_analyst import calculate_factor_scores

__all__ = [
    'calculate_factor_scores',
    'rank_universe',
    'calculate_factor_correlation'
]

# Note: Actual implementations are in scripts/*.py
# Import pattern: from factor_analyst.scripts.calculate_factors import calculate_factor_scores
