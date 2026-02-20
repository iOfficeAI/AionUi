"""Macro regime classification skill for Vietnamese economy."""

# Re-export commonly used functions
from .scripts.classify_regime import classify_regime_dict
from .scripts.fetch_gso_data import fetch_gso_data
from .scripts.fetch_sbv_data import fetch_sbv_data

__all__ = [
    'classify_regime_dict',
    'fetch_gso_data',
    'fetch_sbv_data'
]
