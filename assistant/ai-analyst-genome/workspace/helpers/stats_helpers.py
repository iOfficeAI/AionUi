#!/usr/bin/env python3
"""
Stats Helpers -- Statistical Tests (No ML/Regression)
Vietnamese Stock Market Analyst
Powered by AI Analyst Lab | aianalystlab.ai

STATISTICAL CEILING: t-test, chi-square, confidence intervals, effect sizes ONLY.
NO regression, ANOVA, or ML methods.
"""

import numpy as np
import pandas as pd
from typing import Dict, Any, Optional, List, Tuple
from math import sqrt


def t_test(
    group_a: np.ndarray,
    group_b: np.ndarray,
    alpha: float = 0.05,
    alternative: str = 'two-sided',
) -> Dict[str, Any]:
    """
    Independent two-sample t-test.

    Args:
        group_a: First sample array
        group_b: Second sample array
        alpha: Significance level (default 0.05)
        alternative: 'two-sided', 'less', or 'greater'

    Returns:
        Dictionary with t_statistic, p_value, ci, effect_size, interpretation
    """
    from scipy import stats

    group_a = np.array(group_a, dtype=float)
    group_b = np.array(group_b, dtype=float)

    # Remove NaN
    group_a = group_a[~np.isnan(group_a)]
    group_b = group_b[~np.isnan(group_b)]

    n_a, n_b = len(group_a), len(group_b)

    if n_a < 2 or n_b < 2:
        return {
            'test': 't_test',
            'error': f'Insufficient data: group_a={n_a}, group_b={n_b} (need >=2 each)',
            'valid': False,
        }

    # Run test
    t_stat, p_value = stats.ttest_ind(group_a, group_b, alternative=alternative)

    # Effect size (Cohen's d)
    d = cohens_d(group_a, group_b)

    # Confidence interval for difference of means
    diff = np.mean(group_a) - np.mean(group_b)
    se = sqrt(np.var(group_a, ddof=1) / n_a + np.var(group_b, ddof=1) / n_b)
    df = n_a + n_b - 2
    t_crit = stats.t.ppf(1 - alpha / 2, df)
    ci_lower = diff - t_crit * se
    ci_upper = diff + t_crit * se

    # Interpretation
    significant = p_value < alpha
    effect_label = _interpret_cohens_d(d['d'])

    return {
        'test': 't_test',
        'valid': True,
        't_statistic': round(float(t_stat), 4),
        'p_value': round(float(p_value), 6),
        'significant': significant,
        'alpha': alpha,
        'alternative': alternative,
        'n_a': n_a,
        'n_b': n_b,
        'mean_a': round(float(np.mean(group_a)), 4),
        'mean_b': round(float(np.mean(group_b)), 4),
        'mean_diff': round(float(diff), 4),
        'ci_95': [round(ci_lower, 4), round(ci_upper, 4)],
        'effect_size': d,
        'interpretation': (
            f"{'Significant' if significant else 'Not significant'} difference "
            f"(p={p_value:.4f}, d={d['d']:.2f} [{effect_label}])"
        ),
        'sample_adequate': n_a >= 30 and n_b >= 30,
        'sample_warning': None if (n_a >= 30 and n_b >= 30) else
            f'Small sample sizes (n_a={n_a}, n_b={n_b}); results may be unreliable',
    }


def chi_square_test(
    observed: np.ndarray,
    expected: Optional[np.ndarray] = None,
    alpha: float = 0.05,
) -> Dict[str, Any]:
    """
    Chi-square test of independence or goodness-of-fit.

    Args:
        observed: Observed frequencies (2D array for independence, 1D for GoF)
        expected: Expected frequencies (optional, uses uniform if None)
        alpha: Significance level

    Returns:
        Dictionary with chi2_statistic, p_value, cramers_v, interpretation
    """
    from scipy import stats

    observed = np.array(observed, dtype=float)

    if observed.ndim == 1:
        # Goodness of fit
        if expected is None:
            expected = np.full_like(observed, np.mean(observed))
        else:
            expected = np.array(expected, dtype=float)
        chi2, p_value = stats.chisquare(observed, f_exp=expected)
        df = len(observed) - 1
        v = None
    elif observed.ndim == 2:
        # Test of independence
        chi2, p_value, df, expected = stats.chi2_contingency(observed)
        # Cramer's V
        n = observed.sum()
        min_dim = min(observed.shape[0] - 1, observed.shape[1] - 1)
        v = sqrt(chi2 / (n * min_dim)) if min_dim > 0 and n > 0 else 0
    else:
        return {
            'test': 'chi_square',
            'error': 'Input must be 1D or 2D array',
            'valid': False,
        }

    significant = p_value < alpha

    result = {
        'test': 'chi_square',
        'valid': True,
        'chi2_statistic': round(float(chi2), 4),
        'p_value': round(float(p_value), 6),
        'degrees_of_freedom': int(df),
        'significant': significant,
        'alpha': alpha,
        'interpretation': (
            f"{'Significant' if significant else 'Not significant'} association "
            f"(chi2={chi2:.2f}, p={p_value:.4f})"
        ),
    }

    if v is not None:
        result['cramers_v'] = round(float(v), 4)
        result['effect_label'] = _interpret_cramers_v(v)
        result['interpretation'] += f", Cramer's V={v:.3f} [{_interpret_cramers_v(v)}]"

    return result


def cohens_d(
    group_a: np.ndarray,
    group_b: np.ndarray,
) -> Dict[str, Any]:
    """
    Calculate Cohen's d effect size.

    Returns:
        Dictionary with d value and interpretation
    """
    group_a = np.array(group_a, dtype=float)
    group_b = np.array(group_b, dtype=float)

    group_a = group_a[~np.isnan(group_a)]
    group_b = group_b[~np.isnan(group_b)]

    n_a, n_b = len(group_a), len(group_b)
    if n_a < 2 or n_b < 2:
        return {'d': 0, 'label': 'insufficient_data', 'valid': False}

    mean_a = np.mean(group_a)
    mean_b = np.mean(group_b)
    var_a = np.var(group_a, ddof=1)
    var_b = np.var(group_b, ddof=1)

    # Pooled standard deviation
    pooled_std = sqrt(((n_a - 1) * var_a + (n_b - 1) * var_b) / (n_a + n_b - 2))

    if pooled_std == 0:
        d = 0
    else:
        d = (mean_a - mean_b) / pooled_std

    return {
        'd': round(float(d), 4),
        'abs_d': round(abs(float(d)), 4),
        'label': _interpret_cohens_d(d),
        'valid': True,
    }


def cramers_v(contingency_table: np.ndarray) -> Dict[str, Any]:
    """
    Calculate Cramer's V from a contingency table.

    Returns:
        Dictionary with v value and interpretation
    """
    from scipy import stats

    table = np.array(contingency_table, dtype=float)
    if table.ndim != 2:
        return {'v': 0, 'label': 'invalid_input', 'valid': False}

    chi2, _, _, _ = stats.chi2_contingency(table)
    n = table.sum()
    min_dim = min(table.shape[0] - 1, table.shape[1] - 1)

    if min_dim == 0 or n == 0:
        v = 0
    else:
        v = sqrt(chi2 / (n * min_dim))

    return {
        'v': round(float(v), 4),
        'label': _interpret_cramers_v(v),
        'valid': True,
    }


def confidence_interval(
    data: np.ndarray,
    confidence: float = 0.95,
) -> Dict[str, Any]:
    """
    Calculate confidence interval for mean.

    Args:
        data: Sample data
        confidence: Confidence level (default 0.95)

    Returns:
        Dictionary with mean, ci_lower, ci_upper, margin_of_error
    """
    from scipy import stats

    data = np.array(data, dtype=float)
    data = data[~np.isnan(data)]

    n = len(data)
    if n < 2:
        return {
            'error': f'Insufficient data: n={n} (need >=2)',
            'valid': False,
        }

    mean = np.mean(data)
    se = np.std(data, ddof=1) / sqrt(n)
    df = n - 1

    alpha = 1 - confidence
    t_crit = stats.t.ppf(1 - alpha / 2, df)
    moe = t_crit * se

    return {
        'valid': True,
        'mean': round(float(mean), 4),
        'std': round(float(np.std(data, ddof=1)), 4),
        'n': n,
        'confidence': confidence,
        'ci_lower': round(float(mean - moe), 4),
        'ci_upper': round(float(mean + moe), 4),
        'margin_of_error': round(float(moe), 4),
        'se': round(float(se), 4),
    }


def check_simpson_paradox(
    data: pd.DataFrame,
    value_col: str,
    group_col: str,
    subgroup_col: str,
) -> Dict[str, Any]:
    """
    Check for Simpson's Paradox: aggregate trend reverses in subgroups.

    Args:
        data: DataFrame with values, groups, and subgroups
        value_col: Column with the metric values
        group_col: Column defining the comparison groups
        subgroup_col: Column for segmentation

    Returns:
        Dictionary with paradox_detected, details
    """
    if value_col not in data.columns or group_col not in data.columns or subgroup_col not in data.columns:
        return {
            'error': f'Missing columns. Need: {value_col}, {group_col}, {subgroup_col}',
            'valid': False,
        }

    groups = data[group_col].unique()
    if len(groups) != 2:
        return {
            'error': f'Need exactly 2 groups, found {len(groups)}',
            'valid': False,
        }

    group_a, group_b = groups[0], groups[1]

    # Aggregate trend
    agg_mean_a = data[data[group_col] == group_a][value_col].mean()
    agg_mean_b = data[data[group_col] == group_b][value_col].mean()
    agg_direction = 'A > B' if agg_mean_a > agg_mean_b else 'B > A'

    # Subgroup trends
    subgroups = data[subgroup_col].unique()
    reversals = 0
    subgroup_details = []

    for sg in subgroups:
        sg_data = data[data[subgroup_col] == sg]
        sg_mean_a = sg_data[sg_data[group_col] == group_a][value_col].mean()
        sg_mean_b = sg_data[sg_data[group_col] == group_b][value_col].mean()

        if np.isnan(sg_mean_a) or np.isnan(sg_mean_b):
            continue

        sg_direction = 'A > B' if sg_mean_a > sg_mean_b else 'B > A'

        if sg_direction != agg_direction:
            reversals += 1

        subgroup_details.append({
            'subgroup': str(sg),
            'mean_a': round(float(sg_mean_a), 4),
            'mean_b': round(float(sg_mean_b), 4),
            'direction': sg_direction,
            'reversal': sg_direction != agg_direction,
        })

    valid_subgroups = len(subgroup_details)
    reversal_pct = round(reversals / max(valid_subgroups, 1) * 100, 1)
    paradox_detected = reversal_pct > 50  # Majority of subgroups reverse

    return {
        'valid': True,
        'paradox_detected': paradox_detected,
        'aggregate': {
            'mean_a': round(float(agg_mean_a), 4),
            'mean_b': round(float(agg_mean_b), 4),
            'direction': agg_direction,
        },
        'subgroups': subgroup_details,
        'reversal_count': reversals,
        'total_subgroups': valid_subgroups,
        'reversal_pct': reversal_pct,
        'severity': 'RED' if paradox_detected else 'GREEN',
        'recommendation': (
            'REJECT: Simpson\'s Paradox detected - aggregate trend reverses in majority of subgroups. '
            'Analyze subgroups separately.'
        ) if paradox_detected else (
            'No Simpson\'s Paradox detected. Aggregate trend consistent with subgroup trends.'
        ),
    }


def _interpret_cohens_d(d: float) -> str:
    """Interpret Cohen's d effect size."""
    d = abs(d)
    if d < 0.2:
        return 'negligible'
    elif d < 0.5:
        return 'small'
    elif d < 0.8:
        return 'medium'
    else:
        return 'large'


def _interpret_cramers_v(v: float) -> str:
    """Interpret Cramer's V effect size."""
    v = abs(v)
    if v < 0.1:
        return 'negligible'
    elif v < 0.3:
        return 'small'
    elif v < 0.5:
        return 'medium'
    else:
        return 'large'


# Module self-test
if __name__ == '__main__':
    print("Testing stats_helpers...\n")

    # Generate sample data
    np.random.seed(42)
    group_a = np.random.normal(82000, 5000, 50)
    group_b = np.random.normal(78000, 5000, 50)

    print("1. T-test:")
    result = t_test(group_a, group_b)
    print(f"   {result['interpretation']}")
    print(f"   95% CI: {result['ci_95']}\n")

    print("2. Cohen's d:")
    result = cohens_d(group_a, group_b)
    print(f"   d = {result['d']} ({result['label']})\n")

    print("3. Confidence interval:")
    result = confidence_interval(group_a)
    print(f"   Mean: {result['mean']}, CI: [{result['ci_lower']}, {result['ci_upper']}]\n")

    print("4. Chi-square:")
    observed = np.array([[50, 30], [20, 40]])
    result = chi_square_test(observed)
    print(f"   {result['interpretation']}\n")

    print("5. Simpson's Paradox check:")
    df = pd.DataFrame({
        'value': [10, 20, 30, 40, 15, 25, 35, 45],
        'group': ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'],
        'sector': ['Tech', 'Tech', 'Tech', 'Tech', 'Bank', 'Bank', 'Bank', 'Bank'],
    })
    result = check_simpson_paradox(df, 'value', 'group', 'sector')
    print(f"   Paradox detected: {result['paradox_detected']}")
    print(f"   {result['recommendation']}\n")

    print("All tests completed!")
