#!/usr/bin/env python3
"""
Blog Quality Analyzer — 5-Category, 100-Point Scoring System

Analyzes blog post files for content quality, SEO optimization, E-E-A-T signals,
technical elements, and AI citation readiness. Returns structured JSON, markdown
reports, or compact tables.

Usage:
    python analyze_blog.py <file>                          # Default JSON output
    python analyze_blog.py <file> --format markdown        # Markdown report
    python analyze_blog.py <file> --format table           # Compact table
    python analyze_blog.py <directory> --batch --sort score # Batch with sorting
    python analyze_blog.py <file> --category seo           # Single category detail
    python analyze_blog.py <file> --fix                    # Output specific fixes

Scoring:
    Content Quality       30 pts   Depth, readability, originality, structure, engagement, grammar
    SEO Optimization      25 pts   Title, headings, keywords, linking, meta, URL
    E-E-A-T Signals       15 pts   Author, citations, trust, experience
    Technical Elements    15 pts   Schema, images, structured data, speed, mobile, social
    AI Citation Readiness 15 pts   Citability, Q&A, entities, extraction, crawler access

Bands:
    90-100  Exceptional
    80-89   Strong
    70-79   Acceptable
    60-69   Below Standard
    <60     Rewrite

Optional dependencies (graceful degradation):
    pip install textstat beautifulsoup4
"""

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Optional dependency detection
# ---------------------------------------------------------------------------

try:
    import textstat
    HAS_TEXTSTAT = True
except ImportError:
    HAS_TEXTSTAT = False

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False


def _print_dependency_notice() -> None:
    """Print missing-dependency notice to stderr so JSON output stays clean."""
    missing: list[str] = []
    if not HAS_TEXTSTAT:
        missing.append('textstat')
    if not HAS_BS4:
        missing.append('beautifulsoup4')
    if missing:
        print(
            f"Note: Optional dependencies not found: {', '.join(missing)}. "
            f"Install with: pip install {' '.join(missing)}",
            file=sys.stderr,
        )


# ---------------------------------------------------------------------------
# AI content detection phrases
# ---------------------------------------------------------------------------

AI_PHRASES = [
    "in today's digital landscape", "it's important to note", "in conclusion",
    "dive into", "game-changer", "navigate the landscape", "revolutionize",
    "leverage", "comprehensive guide", "in the ever-evolving", "seamlessly",
    "cutting-edge", "harness the power", "at its core", "rich tapestry",
    "empower", "state-of-the-art",
]

# AI trigger words (single words that spiked >50% post-ChatGPT)
AI_TRIGGER_WORDS = [
    "delve", "tapestry", "multifaceted", "testament", "pivotal", "robust",
    "cutting-edge", "furthermore", "indeed", "moreover", "utilize", "leverage",
    "comprehensive", "landscape", "crucial", "foster", "illuminate", "underscore",
    "embark", "endeavor", "facilitate", "paramount", "nuanced", "intricate",
    "meticulous", "realm",
]

# Transition words/phrases for readability scoring
TRANSITION_WORDS = [
    "however", "therefore", "furthermore", "moreover", "additionally",
    "consequently", "nevertheless", "meanwhile", "similarly", "likewise",
    "nonetheless", "accordingly", "subsequently", "hence", "thus",
    "in contrast", "on the other hand", "for example", "for instance",
    "in addition", "as a result", "in other words", "that said",
    "in particular", "specifically", "alternatively", "conversely",
    "in fact", "notably", "importantly", "significantly",
]

# ---------------------------------------------------------------------------
# Content type word-count benchmarks
# ---------------------------------------------------------------------------

CONTENT_TYPE_BENCHMARKS: dict[str, tuple[int, int]] = {
    'guide': (2500, 5000),
    'how-to': (1500, 3000),
    'listicle': (1200, 2500),
    'opinion': (800, 1500),
    'case-study': (1500, 3000),
    'news': (600, 1200),
    'review': (1000, 2000),
    'default': (1200, 3000),
}

# ---------------------------------------------------------------------------
# Source tier classification
# ---------------------------------------------------------------------------

TIER1_DOMAINS = [
    'nature.com', 'science.org', 'gov', 'edu', 'who.int', 'nih.gov',
    'cdc.gov', 'bls.gov', 'census.gov', 'europa.eu', 'un.org',
    'ieee.org', 'acm.org', 'arxiv.org', 'pubmed.ncbi',
]

TIER2_DOMAINS = [
    'reuters.com', 'apnews.com', 'bbc.com', 'nytimes.com',
    'washingtonpost.com', 'economist.com', 'forbes.com', 'hbr.org',
    'mckinsey.com', 'gartner.com', 'statista.com', 'pew', 'gallup.com',
]

# ---------------------------------------------------------------------------
# Frontmatter extraction (kept from original)
# ---------------------------------------------------------------------------


def extract_frontmatter(content: str) -> dict[str, Any]:
    """Extract YAML frontmatter from markdown/MDX content."""
    frontmatter: dict[str, Any] = {}
    match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
    if match:
        fm_text = match.group(1)
        for line in fm_text.split('\n'):
            if ':' in line:
                key, _, value = line.partition(':')
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if value:
                    frontmatter[key] = value
    return frontmatter


def strip_frontmatter(content: str) -> str:
    """Remove YAML frontmatter from content."""
    return re.sub(r'^---\s*\n.*?\n---\s*\n', '', content, count=1, flags=re.DOTALL)


# ---------------------------------------------------------------------------
# Heading analysis (extended from original)
# ---------------------------------------------------------------------------


def analyze_headings(content: str) -> dict[str, Any]:
    """Analyze heading structure and keyword placement."""
    headings: list[dict[str, Any]] = []
    for match in re.finditer(r'^(#{1,6})\s+(.+)$', content, re.MULTILINE):
        level = len(match.group(1))
        text = match.group(2).strip()
        is_question = text.rstrip().endswith('?')
        headings.append({
            'level': level,
            'text': text,
            'is_question': is_question,
        })

    h1_count = sum(1 for h in headings if h['level'] == 1)
    h2_count = sum(1 for h in headings if h['level'] == 2)
    h3_count = sum(1 for h in headings if h['level'] == 3)
    h2_questions = sum(1 for h in headings if h['level'] == 2 and h['is_question'])
    question_ratio = h2_questions / h2_count if h2_count > 0 else 0

    # Check for hierarchy skips
    hierarchy_clean = True
    prev_level = 0
    for h in headings:
        if h['level'] > prev_level + 1 and prev_level > 0:
            hierarchy_clean = False
        prev_level = h['level']

    return {
        'headings': headings,
        'h1_count': h1_count,
        'h2_count': h2_count,
        'h3_count': h3_count,
        'h2_question_count': h2_questions,
        'h2_question_ratio': round(question_ratio, 2),
        'hierarchy_clean': hierarchy_clean,
        'total': len(headings),
    }


# ---------------------------------------------------------------------------
# Paragraph analysis (kept from original)
# ---------------------------------------------------------------------------


def analyze_paragraphs(content: str) -> dict[str, Any]:
    """Analyze paragraph lengths."""
    cleaned = re.sub(r'```.*?```', '', content, flags=re.DOTALL)
    cleaned = re.sub(r'<[^>]+>', '', cleaned)
    cleaned = re.sub(r'^#{1,6}\s+.*$', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'!\[.*?\]\(.*?\)', '', cleaned)

    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', cleaned) if p.strip()]

    word_counts: list[int] = []
    over_150 = 0
    over_200 = 0
    in_range = 0  # 40-80 words (ideal paragraph range)

    for p in paragraphs:
        words = len(p.split())
        if words < 5:
            continue
        word_counts.append(words)
        if words > 200:
            over_200 += 1
        if words > 150:
            over_150 += 1
        if 40 <= words <= 80:
            in_range += 1

    total = len(word_counts)
    avg = sum(word_counts) / total if total else 0
    in_range_ratio = in_range / total if total else 0

    return {
        'total_paragraphs': total,
        'avg_word_count': round(avg, 1),
        'over_150_words': over_150,
        'over_200_words': over_200,
        # Backward-compatible aliases
        'over_100_words': over_150,
        'in_ideal_range': in_range,
        'in_40_55_range': in_range,
        'in_range_ratio': round(in_range_ratio, 2),
        'max_word_count': max(word_counts) if word_counts else 0,
        'total_word_count': sum(word_counts),
    }


# ---------------------------------------------------------------------------
# Image analysis (extended from original)
# ---------------------------------------------------------------------------


def analyze_images(content: str) -> dict[str, Any]:
    """Count images and check alt text, formats, optimization signals."""
    md_images = re.findall(r'!\[([^\]]*)\]\(([^)]+)\)', content)
    html_images = re.findall(r'<img[^>]+src=["\']([^"\']+)["\'][^>]*>', content)

    images: list[dict[str, Any]] = []
    for alt, src in md_images:
        ext = Path(src.split('?')[0]).suffix.lower()
        images.append({
            'src': src,
            'has_alt': bool(alt.strip()),
            'alt_length': len(alt.strip()),
            'format': ext,
            'source': 'pixabay' if 'pixabay' in src else
                      'unsplash' if 'unsplash' in src else
                      'pexels' if 'pexels' in src else 'other',
        })

    for src in html_images:
        alt_match = re.search(r'alt=["\']([^"\']*)["\']', content[content.find(src) - 200:content.find(src) + len(src)])
        has_alt = bool(alt_match and alt_match.group(1).strip()) if alt_match else False
        ext = Path(src.split('?')[0]).suffix.lower()
        images.append({
            'src': src,
            'has_alt': has_alt,
            'format': ext,
            'source': 'pixabay' if 'pixabay' in src else
                      'unsplash' if 'unsplash' in src else
                      'pexels' if 'pexels' in src else 'other',
        })

    with_alt = sum(1 for img in images if img['has_alt'])
    modern_formats = sum(1 for img in images if img.get('format') in ('.webp', '.avif', '.svg'))

    return {
        'count': len(images),
        'with_alt_text': with_alt,
        'without_alt_text': len(images) - with_alt,
        'modern_format_count': modern_formats,
        'formats': list(set(img.get('format', '') for img in images)),
        'sources': {s: sum(1 for i in images if i['source'] == s)
                    for s in set(i['source'] for i in images)} if images else {},
    }


# ---------------------------------------------------------------------------
# Chart analysis (kept from original)
# ---------------------------------------------------------------------------


def analyze_charts(content: str) -> dict[str, Any]:
    """Count SVG charts and check for type diversity."""
    svg_count = len(re.findall(r'<svg\b', content, re.IGNORECASE))
    figure_count = len(re.findall(r'<figure\b', content, re.IGNORECASE))

    return {
        'svg_count': svg_count,
        'figure_count': figure_count,
        'chart_count': max(svg_count, figure_count),
    }


# ---------------------------------------------------------------------------
# Citation analysis (extended from original)
# ---------------------------------------------------------------------------


def _classify_source_tier(url: str) -> int:
    """Classify a URL into tier 1, 2, or 3."""
    url_lower = url.lower()
    for domain in TIER1_DOMAINS:
        if domain in url_lower:
            return 1
    for domain in TIER2_DOMAINS:
        if domain in url_lower:
            return 2
    return 3


def analyze_citations(content: str) -> dict[str, Any]:
    """Analyze statistics and their citations with tier classification."""
    stat_patterns = re.findall(r'\d+\.?\d*%', content)

    # Inline citations: [text](url)
    inline_matches = re.findall(r'\[([^\]]+)\]\((https?://[^)]+)\)', content)
    citations_with_urls = [(text, url) for text, url in inline_matches]

    # Parenthetical citations (Source Name, year)
    paren_citations = re.findall(r'\(([^)]*(?:20\d{2})[^)]*)\)', content)

    # Tier classification
    tier_counts = {1: 0, 2: 0, 3: 0}
    for _, url in citations_with_urls:
        tier = _classify_source_tier(url)
        tier_counts[tier] += 1

    # Sourced vs unsourced stats
    sourced_stats = 0
    unsourced_stats = 0
    for stat in stat_patterns:
        pos = content.find(stat)
        if pos >= 0:
            context = content[pos:pos + 200]
            if re.search(r'\[.+\]\(https?://', context) or re.search(r'\([^)]*20\d{2}[^)]*\)', context):
                sourced_stats += 1
            else:
                unsourced_stats += 1

    return {
        'total_statistics': len(stat_patterns),
        'sourced_statistics': sourced_stats,
        'unsourced_statistics': unsourced_stats,
        'inline_citations': len(citations_with_urls),
        'paren_citations': len(paren_citations),
        'unique_sources': len(set(url.lower() for _, url in citations_with_urls)),
        'tier_counts': tier_counts,
    }


# ---------------------------------------------------------------------------
# FAQ analysis (kept from original)
# ---------------------------------------------------------------------------


def analyze_faq(content: str) -> dict[str, Any]:
    """Check for FAQ section and schema."""
    has_faq_section = bool(re.search(r'(?i)#{1,3}\s*(?:FAQ|Frequently Asked)', content))
    has_faq_schema = bool(re.search(r'(?i)FAQSchema|FAQPage|faqpage', content))

    faq_items = 0
    if has_faq_section:
        faq_match = re.search(r'(?i)#{1,3}\s*(?:FAQ|Frequently Asked).*', content, re.DOTALL)
        if faq_match:
            faq_text = faq_match.group()
            faq_items = len(re.findall(r'^#{3,4}\s+.+\?', faq_text, re.MULTILINE))

    return {
        'has_faq_section': has_faq_section,
        'has_faq_schema': has_faq_schema,
        'faq_item_count': faq_items,
    }


# ---------------------------------------------------------------------------
# Freshness analysis (kept from original)
# ---------------------------------------------------------------------------


def analyze_freshness(frontmatter: dict[str, Any]) -> dict[str, Any]:
    """Check freshness signals."""
    return {
        'has_date': 'date' in frontmatter,
        'has_last_updated': 'lastUpdated' in frontmatter or 'last_updated' in frontmatter,
        'date': frontmatter.get('date', ''),
        'last_updated': frontmatter.get('lastUpdated', frontmatter.get('last_updated', '')),
    }


# ---------------------------------------------------------------------------
# Self-promotion analysis (kept from original)
# ---------------------------------------------------------------------------


def analyze_self_promotion(content: str, brand_name: str = '') -> dict[str, Any]:
    """Check self-promotion levels."""
    promo_patterns = [
        r'(?i)at \w+,\s+we',
        r'(?i)our (?:team|company|product|platform|solution)',
        r'(?i)we (?:offer|provide|deliver|help|specialize)',
    ]

    promo_count = sum(len(re.findall(p, content)) for p in promo_patterns)

    return {
        'self_promotion_patterns': promo_count,
        'exceeds_limit': promo_count > 1,
    }


# ---------------------------------------------------------------------------
# NEW: Readability analysis (graceful degradation)
# ---------------------------------------------------------------------------


def analyze_readability(text: str) -> dict[str, Any]:
    """Compute readability metrics using textstat if available, else estimate."""
    words = text.split()
    word_count = len(words)
    sentences = re.findall(r'[.!?]+', text)
    sentence_count = len(sentences) if sentences else 1
    avg_sentence_len = word_count / sentence_count

    if HAS_TEXTSTAT:
        fre = textstat.flesch_reading_ease(text)
        fkg = textstat.flesch_kincaid_grade(text)
        fog = textstat.gunning_fog(text)
        try:
            reading_time = round(textstat.reading_time(text, ms_per_char=14.69) / 60, 1)
        except Exception:
            reading_time = round(word_count / 238, 1)
        return {
            'flesch_reading_ease': round(fre, 1),
            'flesch_kincaid_grade': round(fkg, 1),
            'gunning_fog': round(fog, 1),
            'reading_time_minutes': reading_time,
            'avg_sentence_length': round(avg_sentence_len, 1),
            'estimated': False,
        }
    else:
        # Rough Flesch estimate: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words)
        avg_word_len = len(text) / max(word_count, 1)
        est_syllable_ratio = avg_word_len / 4.7  # crude approximation
        fre = max(0, 206.835 - 1.015 * avg_sentence_len - 84.6 * est_syllable_ratio)
        return {
            'flesch_reading_ease': round(fre, 1),
            'reading_time_minutes': round(word_count / 238, 1),
            'avg_sentence_length': round(avg_sentence_len, 1),
            'estimated': True,
        }


# ---------------------------------------------------------------------------
# NEW: Sentence analysis
# ---------------------------------------------------------------------------


def analyze_sentences(text: str) -> dict[str, Any]:
    """Analyze sentence lengths, burstiness (variance), and engagement."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    lengths = [len(s.split()) for s in sentences if len(s.split()) > 2]
    if not lengths:
        return {
            'count': 0,
            'avg_length': 0,
            'max_length': 0,
            'burstiness': 0.0,
            'std_dev': 0.0,
            'very_long_count': 0,
        }

    avg = sum(lengths) / len(lengths)
    std_dev = (sum((l - avg) ** 2 for l in lengths) / len(lengths)) ** 0.5
    burstiness = std_dev / avg if avg > 0 else 0
    very_long = sum(1 for l in lengths if l > 40)
    over_20 = sum(1 for l in lengths if l > 20)
    over_25 = sum(1 for l in lengths if l > 25)
    total = len(lengths)

    return {
        'count': total,
        'avg_length': round(avg, 1),
        'max_length': max(lengths),
        'burstiness': round(burstiness, 2),
        'std_dev': round(std_dev, 1),
        'very_long_count': very_long,
        'over_20_count': over_20,
        'over_20_pct': round(over_20 / total * 100, 1) if total else 0,
        'over_25_count': over_25,
    }


# ---------------------------------------------------------------------------
# NEW: AI content detection
# ---------------------------------------------------------------------------


def analyze_ai_signals(text: str, sentences_info: dict[str, Any]) -> dict[str, Any]:
    """Detect potential AI-generated content signals."""
    found_phrases: list[dict[str, Any]] = []
    lower_text = text.lower()
    for phrase in AI_PHRASES:
        count = lower_text.count(phrase)
        if count > 0:
            found_phrases.append({'phrase': phrase, 'count': count})

    words = text.split()
    unique = len(set(w.lower() for w in words))
    ttr = unique / len(words) if words else 0

    return {
        'ai_phrases_found': found_phrases,
        'ai_phrase_count': sum(p['count'] for p in found_phrases),
        'vocabulary_diversity_ttr': round(ttr, 3),
        'burstiness': sentences_info.get('burstiness', 0),
        'likely_ai': sentences_info.get('burstiness', 0) < 0.3 and ttr < 0.4,
    }


# ---------------------------------------------------------------------------
# NEW: Passive voice estimation
# ---------------------------------------------------------------------------


def analyze_passive_voice(text: str) -> dict[str, Any]:
    """Estimate passive voice percentage using regex heuristics."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s for s in sentences if len(s.split()) > 2]
    if not sentences:
        return {'passive_count': 0, 'total_sentences': 0, 'passive_pct': 0.0}

    passive_pattern = re.compile(
        r'\b(was|were|been|being|is|are|am|get|got|gets|getting)\s+'
        r'(\w+ly\s+)?'  # optional adverb
        r'(\w+ed|written|spoken|taken|given|made|done|seen|known|shown|built|sent|found|held|told|left|run|set|kept|brought|thought|put)\b',
        re.IGNORECASE,
    )
    passive_count = sum(1 for s in sentences if passive_pattern.search(s))

    return {
        'passive_count': passive_count,
        'total_sentences': len(sentences),
        'passive_pct': round(passive_count / len(sentences) * 100, 1),
    }


# ---------------------------------------------------------------------------
# NEW: Transition word analysis
# ---------------------------------------------------------------------------


def analyze_transition_words(text: str) -> dict[str, Any]:
    """Measure percentage of sentences containing transition words."""
    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s for s in sentences if len(s.split()) > 2]
    if not sentences:
        return {'transition_count': 0, 'total_sentences': 0, 'transition_pct': 0.0}

    lower_sentences = [s.lower() for s in sentences]
    transition_count = 0
    for s in lower_sentences:
        for tw in TRANSITION_WORDS:
            if tw in s:
                transition_count += 1
                break  # count each sentence once

    return {
        'transition_count': transition_count,
        'total_sentences': len(sentences),
        'transition_pct': round(transition_count / len(sentences) * 100, 1),
    }


# ---------------------------------------------------------------------------
# NEW: AI trigger word detection
# ---------------------------------------------------------------------------


def analyze_ai_trigger_words(text: str) -> dict[str, Any]:
    """Count AI trigger words per 1,000 words."""
    words = text.split()
    word_count = len(words)
    if word_count == 0:
        return {'trigger_count': 0, 'per_1k': 0.0, 'found': []}

    lower_text = text.lower()
    found: list[dict[str, Any]] = []
    total = 0
    for tw in AI_TRIGGER_WORDS:
        count = len(re.findall(r'\b' + re.escape(tw) + r'\b', lower_text))
        if count > 0:
            found.append({'word': tw, 'count': count})
            total += count

    per_1k = round(total / word_count * 1000, 1)

    return {
        'trigger_count': total,
        'per_1k': per_1k,
        'found': found,
    }


# ---------------------------------------------------------------------------
# NEW: Schema / structured data detection (graceful degradation)
# ---------------------------------------------------------------------------


def analyze_schema(content: str) -> dict[str, Any]:
    """Detect JSON-LD schema markup in content."""
    schemas: list[str] = []

    if HAS_BS4:
        try:
            soup = BeautifulSoup(content, 'html.parser')
            for script in soup.find_all('script', type='application/ld+json'):
                try:
                    data = json.loads(script.string)
                    if isinstance(data, dict):
                        schemas.append(data.get('@type', 'Unknown'))
                    elif isinstance(data, list):
                        for item in data:
                            if isinstance(item, dict):
                                schemas.append(item.get('@type', 'Unknown'))
                except (json.JSONDecodeError, TypeError):
                    pass
        except Exception:
            pass
    else:
        # Fallback: regex detection
        for match in re.findall(r'"@type"\s*:\s*"([^"]+)"', content):
            schemas.append(match)

    return {
        'schemas_found': schemas,
        'schema_count': len(schemas),
        'has_blogposting': 'BlogPosting' in schemas or 'Article' in schemas,
        'has_faqpage': 'FAQPage' in schemas,
        'has_person': 'Person' in schemas,
    }


# ---------------------------------------------------------------------------
# NEW: Link analysis
# ---------------------------------------------------------------------------


def analyze_links(content: str) -> dict[str, Any]:
    """Analyze internal and external links, anchor quality, and tiers."""
    # Internal links: relative paths (not starting with http or /)
    internal = re.findall(r'\[([^\]]+)\]\((?!https?://|#)([^)]+)\)', content)
    # External links
    external = re.findall(r'\[([^\]]+)\]\((https?://[^)]+)\)', content)

    bad_anchor_keywords = {'click here', 'read more', 'this article', 'here', 'link', 'this'}
    bad_anchors = [a for a, _ in internal + external if a.lower().strip() in bad_anchor_keywords]

    # Tier classification for external links
    tier_counts = {1: 0, 2: 0, 3: 0}
    for _, url in external:
        tier = _classify_source_tier(url)
        tier_counts[tier] += 1

    return {
        'internal_count': len(internal),
        'external_count': len(external),
        'total_links': len(internal) + len(external),
        'bad_anchor_texts': bad_anchors,
        'external_tier_counts': tier_counts,
    }


# ---------------------------------------------------------------------------
# NEW: Originality markers
# ---------------------------------------------------------------------------


def analyze_originality(content: str) -> dict[str, Any]:
    """Detect originality markers: original data, personal experience, first person."""
    markers: list[str] = []

    if re.search(r'\[ORIGINAL DATA\]', content, re.IGNORECASE):
        markers.append('original_data_tag')
    if re.search(r'\[PERSONAL EXPERIENCE\]', content, re.IGNORECASE):
        markers.append('personal_experience_tag')

    first_person_patterns = [
        r'\bI\s+(?:found|discovered|tested|built|created|noticed|learned|experienced)\b',
        r'\b(?:we|our team)\s+(?:tested|built|ran|analyzed|measured|conducted|found|discovered)\b',
        r'\bin (?:my|our) experience\b',
        r'\bfrom (?:my|our) (?:testing|research|analysis|work)\b',
    ]
    first_person_count = 0
    for pattern in first_person_patterns:
        first_person_count += len(re.findall(pattern, content, re.IGNORECASE))
    if first_person_count > 0:
        markers.append('first_person_experience')

    return {
        'markers': markers,
        'marker_count': len(markers),
        'first_person_count': first_person_count,
    }


# ---------------------------------------------------------------------------
# NEW: Engagement elements
# ---------------------------------------------------------------------------


def analyze_engagement(content: str) -> dict[str, Any]:
    """Detect questions in body text, examples, call-to-action patterns."""
    # Questions in body (not in headings)
    body_lines = [l for l in content.split('\n') if not l.strip().startswith('#')]
    body_text = '\n'.join(body_lines)
    questions_in_text = len(re.findall(r'[^#]\?', body_text))

    # Example markers
    example_patterns = [
        r'(?i)\bfor example\b', r'(?i)\bfor instance\b', r'(?i)\bsuch as\b',
        r'(?i)\bconsider\b', r'(?i)\blet\'s say\b', r'(?i)\bimagine\b',
        r'(?i)\bhere\'s (?:an|a) example\b',
    ]
    example_count = sum(len(re.findall(p, content)) for p in example_patterns)

    return {
        'questions_in_text': questions_in_text,
        'example_count': example_count,
    }


# ---------------------------------------------------------------------------
# NEW: AI citation readiness
# ---------------------------------------------------------------------------


def analyze_ai_citation_readiness(content: str, headings_info: dict[str, Any],
                                  faq_info: dict[str, Any]) -> dict[str, Any]:
    """Assess how easily AI systems can cite/extract from this content."""
    # Passage citability: count sections of 120-180 words
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', content) if p.strip()]
    citable_passages = 0
    for p in paragraphs:
        wc = len(p.split())
        if 120 <= wc <= 180:
            citable_passages += 1

    # Q&A detection: question headings followed by direct answers
    qa_pairs = 0
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if re.match(r'^#{2,4}\s+.+\?', line):
            # Check if next non-empty line starts with a direct statement
            for j in range(i + 1, min(i + 5, len(lines))):
                if lines[j].strip():
                    if not lines[j].strip().startswith('#'):
                        qa_pairs += 1
                    break

    # Entity clarity: detect defined terms (bold terms followed by explanations)
    entity_definitions = len(re.findall(r'\*\*[^*]+\*\*\s*(?:is|are|refers to|means)', content))

    # Extraction-friendly structures
    has_tldr = bool(re.search(r'(?i)(?:TL;?DR|key takeaway|summary|at a glance)', content))
    table_count = len(re.findall(r'^\|.+\|$', content, re.MULTILINE))
    list_count = len(re.findall(r'^[\s]*[-*+]\s', content, re.MULTILINE))

    # AI crawler accessibility
    has_robots_meta = bool(re.search(r'(?i)robots|noai|noindex', content))

    return {
        'citable_passages': citable_passages,
        'qa_pairs': qa_pairs,
        'entity_definitions': entity_definitions,
        'has_tldr': has_tldr,
        'table_count': table_count,
        'list_count': list_count,
        'has_robots_restriction': has_robots_meta,
    }


# ---------------------------------------------------------------------------
# NEW: OG / social meta tags
# ---------------------------------------------------------------------------


def analyze_social_meta(content: str, frontmatter: dict[str, Any]) -> dict[str, Any]:
    """Detect Open Graph and social media meta tags."""
    og_tags = re.findall(r'(?:og:|twitter:)\w+', content)

    # Also check frontmatter for common social fields
    social_fields = ['image', 'og_image', 'ogImage', 'twitter_image',
                     'social_image', 'thumbnail', 'cover']
    has_social_image = any(f in frontmatter for f in social_fields)

    return {
        'og_tags_found': len(og_tags),
        'has_social_image': has_social_image,
        'social_fields_in_frontmatter': [f for f in social_fields if f in frontmatter],
    }


# ---------------------------------------------------------------------------
# NEW: Structured data signals (tables, lists)
# ---------------------------------------------------------------------------


def analyze_structured_data(content: str) -> dict[str, Any]:
    """Detect tables, ordered/unordered lists, and other structured elements."""
    table_rows = len(re.findall(r'^\|.+\|$', content, re.MULTILINE))
    tables = 0
    if table_rows > 0:
        # Estimate number of tables (each table has at least a header separator row)
        tables = len(re.findall(r'^\|[-:| ]+\|$', content, re.MULTILINE))

    unordered_items = len(re.findall(r'^[\s]*[-*+]\s', content, re.MULTILINE))
    ordered_items = len(re.findall(r'^[\s]*\d+\.\s', content, re.MULTILINE))
    code_blocks = len(re.findall(r'```', content)) // 2
    blockquotes = len(re.findall(r'^>\s', content, re.MULTILINE))

    return {
        'table_count': tables,
        'table_rows': table_rows,
        'unordered_list_items': unordered_items,
        'ordered_list_items': ordered_items,
        'code_blocks': code_blocks,
        'blockquotes': blockquotes,
    }


# ---------------------------------------------------------------------------
# Scoring: 5-category, 100-point system
# ---------------------------------------------------------------------------


def _detect_content_type(frontmatter: dict[str, Any], headings_info: dict[str, Any],
                         content: str) -> str:
    """Guess the content type from frontmatter or content patterns."""
    category = frontmatter.get('category', '').lower()
    title = frontmatter.get('title', '').lower()
    content_type = frontmatter.get('type', '').lower()

    if content_type and content_type in CONTENT_TYPE_BENCHMARKS:
        return content_type
    if 'guide' in title or 'guide' in category:
        return 'guide'
    if 'how to' in title or 'how-to' in category:
        return 'how-to'
    if re.search(r'^\d+\s', title) or 'listicle' in category:
        return 'listicle'
    if 'review' in title or 'review' in category:
        return 'review'
    if 'case study' in title or 'case-study' in category:
        return 'case-study'
    if 'opinion' in category:
        return 'opinion'
    if 'news' in category:
        return 'news'
    return 'default'


def calculate_score(analysis: dict[str, Any]) -> dict[str, Any]:
    """Calculate the 5-category, 100-point quality score."""
    issues: list[dict[str, Any]] = []
    category_details: dict[str, dict[str, Any]] = {}

    # ===================================================================
    # CONTENT QUALITY (30 pts)
    # ===================================================================
    cq = 0
    cq_breakdown: dict[str, Any] = {}

    # Depth / comprehensiveness: 7 pts
    paras = analysis['paragraphs']
    word_count = paras['total_word_count']
    content_type = _detect_content_type(analysis['frontmatter'], analysis['headings'], '')
    bench_min, bench_max = CONTENT_TYPE_BENCHMARKS.get(content_type, (1200, 3000))
    if bench_min <= word_count <= bench_max:
        depth_score = 7
    elif word_count >= bench_min * 0.7:
        depth_score = 5
    elif word_count >= bench_min * 0.5:
        depth_score = 3
    else:
        depth_score = 1
        issues.append({'category': 'content', 'severity': 'high',
                       'issue': f'Word count ({word_count}) below benchmark ({bench_min}-{bench_max}) for {content_type}'})
    if word_count > bench_max * 1.5:
        depth_score = max(depth_score - 2, 1)
        issues.append({'category': 'content', 'severity': 'medium',
                       'issue': f'Word count ({word_count}) excessively long for {content_type}'})
    cq += depth_score
    cq_breakdown['depth'] = depth_score

    # Readability (Flesch 60-70 ideal): 7 pts
    readability = analysis['readability']
    fre = readability.get('flesch_reading_ease', 50)
    if 60 <= fre <= 70:
        read_score = 7
    elif 55 <= fre <= 75:
        read_score = 5
    elif 45 <= fre <= 80:
        read_score = 3
    else:
        read_score = 1
        issues.append({'category': 'content', 'severity': 'medium',
                       'issue': f'Flesch reading ease ({fre}) outside acceptable range (55-75)'})
    cq += read_score
    cq_breakdown['readability'] = read_score

    # Originality markers: 5 pts
    orig = analysis['originality']
    orig_score = min(orig['marker_count'] * 2 + min(orig['first_person_count'], 3), 5)
    if orig_score == 0:
        issues.append({'category': 'content', 'severity': 'medium',
                       'issue': 'No originality markers found — add [ORIGINAL DATA], personal experience, or first-person language'})
    cq += orig_score
    cq_breakdown['originality'] = orig_score

    # Logical structure: 4 pts
    headings = analysis['headings']
    struct_score = 0
    if headings['h2_count'] >= 3:
        struct_score += 2
    elif headings['h2_count'] >= 1:
        struct_score += 1
    else:
        issues.append({'category': 'content', 'severity': 'high',
                       'issue': 'No H2 headings — add section headings for structure'})
    if headings['hierarchy_clean']:
        struct_score += 1
    else:
        issues.append({'category': 'content', 'severity': 'medium',
                       'issue': 'Heading hierarchy has skips (e.g., H2 to H4)'})
    # Section length variance: check if paragraphs are reasonably distributed
    if paras['total_paragraphs'] >= 5 and paras['max_word_count'] < 200:
        struct_score += 1
    cq += struct_score
    cq_breakdown['structure'] = struct_score

    # Engagement elements: 4 pts
    engagement = analysis['engagement']
    eng_score = 0
    if engagement['questions_in_text'] >= 2:
        eng_score += 2
    elif engagement['questions_in_text'] >= 1:
        eng_score += 1
    if engagement['example_count'] >= 2:
        eng_score += 2
    elif engagement['example_count'] >= 1:
        eng_score += 1
    eng_score = min(eng_score, 4)
    if eng_score < 2:
        issues.append({'category': 'content', 'severity': 'low',
                       'issue': 'Low engagement — add questions and examples in body text'})
    cq += eng_score
    cq_breakdown['engagement'] = eng_score

    # Grammar / anti-pattern: 3 pts
    sentences = analysis['sentences']
    passive = analysis.get('passive_voice', {})
    transitions = analysis.get('transition_words', {})
    ai_triggers = analysis.get('ai_trigger_words', {})
    gram_score = 0
    # 1 pt: burstiness >= 0.4 AND passive voice <= 15%
    passive_pct = passive.get('passive_pct', 0)
    if sentences['burstiness'] >= 0.4 and passive_pct <= 15:
        gram_score += 1
    if passive_pct > 15:
        issues.append({'category': 'content', 'severity': 'high',
                       'issue': f'Passive voice at {passive_pct}% — target ≤10%, max 15%'})
    elif passive_pct > 10:
        issues.append({'category': 'content', 'severity': 'low',
                       'issue': f'Passive voice at {passive_pct}% — ideal is ≤10%'})
    # 1 pt: no sentences > 40 words AND AI trigger words <= 8 per 1K
    trigger_per_1k = ai_triggers.get('per_1k', 0)
    if sentences['very_long_count'] == 0 and trigger_per_1k <= 8:
        gram_score += 1
    if sentences['very_long_count'] > 0:
        issues.append({'category': 'content', 'severity': 'low',
                       'issue': f'{sentences["very_long_count"]} sentences over 40 words — consider splitting'})
    if trigger_per_1k > 8:
        issues.append({'category': 'content', 'severity': 'high',
                       'issue': f'AI trigger words: {trigger_per_1k}/1K — target ≤5, max 8'})
    elif trigger_per_1k > 5:
        issues.append({'category': 'content', 'severity': 'medium',
                       'issue': f'AI trigger words: {trigger_per_1k}/1K — target ≤5'})
    # 1 pt: avg sentence length 12-25 AND transition words 15-35%
    transition_pct = transitions.get('transition_pct', 0)
    if sentences['count'] > 0 and 12 <= sentences['avg_length'] <= 25 and 15 <= transition_pct <= 35:
        gram_score += 1
    if transition_pct < 15:
        issues.append({'category': 'content', 'severity': 'medium',
                       'issue': f'Transition words at {transition_pct}% — target 20-30%'})
    elif transition_pct > 35:
        issues.append({'category': 'content', 'severity': 'medium',
                       'issue': f'Transition words at {transition_pct}% — reads formulaic, target 20-30%'})
    gram_score = min(gram_score, 3)
    cq += gram_score
    cq_breakdown['grammar_antipattern'] = gram_score

    cq = min(cq, 30)
    category_details['content_quality'] = {'score': cq, 'max': 30, 'breakdown': cq_breakdown}

    # ===================================================================
    # SEO OPTIMIZATION (25 pts)
    # ===================================================================
    seo = 0
    seo_breakdown: dict[str, Any] = {}
    fm = analysis['frontmatter']

    # Title tag (40-60 chars, keyword): 4 pts
    title = fm.get('title', '')
    title_len = len(title)
    title_score = 0
    if 40 <= title_len <= 60:
        title_score = 4
    elif 30 <= title_len <= 70:
        title_score = 2
    elif title:
        title_score = 1
    if not title:
        issues.append({'category': 'seo', 'severity': 'high',
                       'issue': 'Missing title in frontmatter'})
    elif title_len < 40 or title_len > 60:
        issues.append({'category': 'seo', 'severity': 'medium',
                       'issue': f'Title length ({title_len} chars) outside ideal 40-60 range'})
    seo += title_score
    seo_breakdown['title'] = title_score

    # Heading hierarchy with keywords: 5 pts
    heading_score = 0
    if headings['h1_count'] == 1:
        heading_score += 1
    elif headings['h1_count'] == 0 and title:
        heading_score += 1  # Title serves as H1
    if headings['h2_count'] >= 3:
        heading_score += 2
    elif headings['h2_count'] >= 1:
        heading_score += 1
    if headings['hierarchy_clean']:
        heading_score += 1
    if headings['h3_count'] >= 1:
        heading_score += 1
    heading_score = min(heading_score, 5)
    seo += heading_score
    seo_breakdown['headings'] = heading_score

    # Keyword placement: 4 pts (in title, first paragraph, headings)
    keyword_score = 0
    # Extract potential keyword from frontmatter
    keyword = fm.get('keyword', fm.get('keywords', '')).split(',')[0].strip().lower() if fm.get('keyword', fm.get('keywords', '')) else ''
    if keyword:
        if keyword in title.lower():
            keyword_score += 2
        # Check first paragraph
        body = analysis.get('_body_text', '')
        first_para = body.split('\n\n')[0] if body else ''
        if keyword in first_para.lower():
            keyword_score += 1
        # Check headings
        h_texts = ' '.join(h['text'].lower() for h in headings['headings'])
        if keyword in h_texts:
            keyword_score += 1
    else:
        keyword_score = 2  # No keyword defined; give partial credit
    keyword_score = min(keyword_score, 4)
    seo += keyword_score
    seo_breakdown['keyword_placement'] = keyword_score

    # Internal linking (3-10 contextual): 4 pts
    links = analysis['links']
    int_score = 0
    ic = links['internal_count']
    if 3 <= ic <= 10:
        int_score = 4
    elif ic >= 1:
        int_score = 2
    else:
        issues.append({'category': 'seo', 'severity': 'high',
                       'issue': 'No internal links — add 3-10 contextual internal links'})
    if links['bad_anchor_texts']:
        int_score = max(int_score - 1, 0)
        issues.append({'category': 'seo', 'severity': 'low',
                       'issue': f'Bad anchor texts found: {links["bad_anchor_texts"]}'})
    seo += int_score
    seo_breakdown['internal_linking'] = int_score

    # Meta description (150-160 chars, stat): 3 pts
    desc = fm.get('description', fm.get('meta_description', ''))
    desc_len = len(desc)
    meta_score = 0
    if 150 <= desc_len <= 160:
        meta_score = 3
    elif 120 <= desc_len <= 170:
        meta_score = 2
    elif desc:
        meta_score = 1
    else:
        issues.append({'category': 'seo', 'severity': 'high',
                       'issue': 'Missing meta description in frontmatter'})
    # Bonus if description contains a stat
    if desc and re.search(r'\d', desc):
        meta_score = min(meta_score + 1, 3)
    seo += meta_score
    seo_breakdown['meta_description'] = meta_score

    # External linking (tier 1-3): 2 pts
    ext_score = 0
    if links['external_count'] >= 2:
        ext_score += 1
    tier_ext = links.get('external_tier_counts', {})
    if tier_ext.get(1, 0) >= 1 or tier_ext.get(2, 0) >= 1:
        ext_score += 1
    seo += ext_score
    seo_breakdown['external_linking'] = ext_score

    # URL structure: 3 pts (from frontmatter slug)
    slug = fm.get('slug', fm.get('url', ''))
    url_score = 0
    if slug:
        if len(slug) <= 60:
            url_score += 1
        if '-' in slug and ' ' not in slug:
            url_score += 1
        if not re.search(r'\d{8,}', slug):  # No long numeric strings
            url_score += 1
    else:
        url_score = 1  # Partial credit; many static site generators auto-generate
    url_score = min(url_score, 3)
    seo += url_score
    seo_breakdown['url_structure'] = url_score

    seo = min(seo, 25)
    category_details['seo_optimization'] = {'score': seo, 'max': 25, 'breakdown': seo_breakdown}

    # ===================================================================
    # E-E-A-T SIGNALS (15 pts)
    # ===================================================================
    eeat = 0
    eeat_breakdown: dict[str, Any] = {}

    # Author attribution: 4 pts
    author = fm.get('author', fm.get('authors', ''))
    author_score = 0
    if author and author.lower() not in ('admin', 'administrator', 'staff', 'team', ''):
        author_score = 4
    elif author:
        author_score = 1
        issues.append({'category': 'eeat', 'severity': 'medium',
                       'issue': f'Generic author name "{author}" — use a real person name'})
    else:
        issues.append({'category': 'eeat', 'severity': 'high',
                       'issue': 'No author attribution in frontmatter'})
    eeat += author_score
    eeat_breakdown['author'] = author_score

    # Source citations: 4 pts (tier-aware)
    cit = analysis['citations']
    cit_score = 0
    total_citations = cit['inline_citations'] + cit['paren_citations']
    if total_citations >= 5:
        cit_score += 2
    elif total_citations >= 2:
        cit_score += 1
    # Tier bonus
    tier_c = cit.get('tier_counts', {})
    if tier_c.get(1, 0) >= 1:
        cit_score += 2
    elif tier_c.get(2, 0) >= 1:
        cit_score += 1
    cit_score = min(cit_score, 4)
    if total_citations == 0:
        issues.append({'category': 'eeat', 'severity': 'high',
                       'issue': 'No source citations — add inline citations to credible sources'})
    eeat += cit_score
    eeat_breakdown['citations'] = cit_score

    # Trust indicators: 4 pts (about/contact links, editorial mentions)
    trust_score = 0
    body = analysis.get('_body_text', '')
    if re.search(r'(?i)\babout\s+(?:us|the author|me)\b', body) or re.search(r'/about', body):
        trust_score += 2
    if re.search(r'(?i)\bcontact\b', body) or re.search(r'/contact', body):
        trust_score += 1
    if re.search(r'(?i)\b(?:editorial|reviewed by|fact.?check|editor)\b', body):
        trust_score += 1
    trust_score = min(trust_score, 4)
    eeat += trust_score
    eeat_breakdown['trust'] = trust_score

    # Experience signals: 3 pts
    orig = analysis['originality']
    exp_score = 0
    if orig['first_person_count'] >= 3:
        exp_score = 3
    elif orig['first_person_count'] >= 1:
        exp_score = 2
    elif 'first_person_experience' in orig['markers']:
        exp_score = 1
    if exp_score == 0:
        issues.append({'category': 'eeat', 'severity': 'medium',
                       'issue': 'No experience signals — add "we tested", "in our experience" language'})
    eeat += exp_score
    eeat_breakdown['experience'] = exp_score

    eeat = min(eeat, 15)
    category_details['eeat_signals'] = {'score': eeat, 'max': 15, 'breakdown': eeat_breakdown}

    # ===================================================================
    # TECHNICAL ELEMENTS (15 pts)
    # ===================================================================
    tech = 0
    tech_breakdown: dict[str, Any] = {}

    # Schema markup (JSON-LD): 4 pts
    schema = analysis['schema']
    schema_score = 0
    if schema['has_blogposting']:
        schema_score += 2
    if schema['has_faqpage']:
        schema_score += 1
    if schema['has_person']:
        schema_score += 1
    if schema['schema_count'] == 0:
        # Check if there are any schema signals at all
        if re.search(r'(?i)json-ld|structured.?data|schema\.org', analysis.get('_raw_content', '')):
            schema_score = 1
    schema_score = min(schema_score, 4)
    if schema_score == 0:
        issues.append({'category': 'technical', 'severity': 'medium',
                       'issue': 'No JSON-LD schema markup detected — add BlogPosting schema'})
    tech += schema_score
    tech_breakdown['schema'] = schema_score

    # Image optimization (alt text, formats): 3 pts
    images = analysis['images']
    img_score = 0
    if images['count'] > 0:
        alt_ratio = images['with_alt_text'] / images['count']
        if alt_ratio == 1.0:
            img_score += 2
        elif alt_ratio >= 0.8:
            img_score += 1
        else:
            issues.append({'category': 'technical', 'severity': 'medium',
                           'issue': f'{images["without_alt_text"]} images missing alt text'})
        if images['modern_format_count'] > 0:
            img_score += 1
    else:
        img_score = 1  # No images is OK for some content types
    img_score = min(img_score, 3)
    tech += img_score
    tech_breakdown['images'] = img_score

    # Structured data (tables, lists): 2 pts
    struct_data = analysis['structured_data']
    sdata_score = 0
    if struct_data['table_count'] >= 1:
        sdata_score += 1
    if struct_data['unordered_list_items'] + struct_data['ordered_list_items'] >= 3:
        sdata_score += 1
    sdata_score = min(sdata_score, 2)
    tech += sdata_score
    tech_breakdown['structured_data'] = sdata_score

    # Page speed signals: 2 pts
    speed_score = 0
    # Check for lazy loading
    if re.search(r'loading=["\']lazy["\']', analysis.get('_raw_content', '')):
        speed_score += 1
    # Check for modern image formats or optimization attributes
    if images.get('modern_format_count', 0) > 0:
        speed_score += 1
    elif images['count'] == 0:
        speed_score = 1  # No images to slow things down
    speed_score = min(speed_score, 2)
    tech += speed_score
    tech_breakdown['page_speed'] = speed_score

    # Mobile-friendly: 2 pts
    mobile_score = 0
    # Reasonable line lengths (no extremely long paragraphs without breaks)
    if paras['max_word_count'] <= 100:
        mobile_score += 1
    # Responsive patterns (picture element, srcset)
    if re.search(r'srcset|<picture', analysis.get('_raw_content', ''), re.IGNORECASE):
        mobile_score += 1
    elif paras['total_paragraphs'] > 0:
        mobile_score += 1  # Reasonable paragraph structure = OK for mobile
    mobile_score = min(mobile_score, 2)
    tech += mobile_score
    tech_breakdown['mobile'] = mobile_score

    # OG/social meta tags: 2 pts
    social = analysis['social_meta']
    social_score = 0
    if social['og_tags_found'] >= 2:
        social_score += 1
    if social['has_social_image']:
        social_score += 1
    elif any(f in fm for f in ('image', 'thumbnail', 'cover')):
        social_score += 1
    social_score = min(social_score, 2)
    tech += social_score
    tech_breakdown['social_meta'] = social_score

    tech = min(tech, 15)
    category_details['technical_elements'] = {'score': tech, 'max': 15, 'breakdown': tech_breakdown}

    # ===================================================================
    # AI CITATION READINESS (15 pts)
    # ===================================================================
    ai = 0
    ai_breakdown: dict[str, Any] = {}
    ai_ready = analysis['ai_citation_readiness']

    # Passage citability (120-180 word sections): 4 pts
    cite_score = 0
    cp = ai_ready['citable_passages']
    if cp >= 5:
        cite_score = 4
    elif cp >= 3:
        cite_score = 3
    elif cp >= 1:
        cite_score = 2
    else:
        cite_score = 0
        issues.append({'category': 'ai_citation', 'severity': 'medium',
                       'issue': 'No passages in the 120-180 word sweet spot for AI citations'})
    ai += cite_score
    ai_breakdown['citability'] = cite_score

    # Q&A sections: 3 pts
    qa_score = 0
    qap = ai_ready['qa_pairs']
    faq = analysis['faq']
    if qap >= 5 or faq['has_faq_section']:
        qa_score = 3
    elif qap >= 3:
        qa_score = 2
    elif qap >= 1:
        qa_score = 1
    ai += qa_score
    ai_breakdown['qa_sections'] = qa_score

    # Entity clarity: 3 pts
    ent_score = 0
    ed = ai_ready['entity_definitions']
    if ed >= 3:
        ent_score = 3
    elif ed >= 1:
        ent_score = 2
    else:
        ent_score = 0
        issues.append({'category': 'ai_citation', 'severity': 'low',
                       'issue': 'No entity definitions found — use **term** is/are patterns'})
    ai += ent_score
    ai_breakdown['entity_clarity'] = ent_score

    # Content structure for extraction: 3 pts
    ext_score = 0
    if ai_ready['has_tldr']:
        ext_score += 1
    if ai_ready['table_count'] >= 3:
        ext_score += 1
    elif ai_ready['list_count'] >= 5:
        ext_score += 1
    if struct_data['table_count'] >= 1 and struct_data['unordered_list_items'] >= 3:
        ext_score += 1
    ext_score = min(ext_score, 3)
    ai += ext_score
    ai_breakdown['extraction'] = ext_score

    # AI crawler accessibility: 2 pts
    crawl_score = 2  # Default: accessible
    if ai_ready['has_robots_restriction']:
        crawl_score = 0
        issues.append({'category': 'ai_citation', 'severity': 'medium',
                       'issue': 'Robots/noai restriction detected — may block AI crawlers'})
    ai += crawl_score
    ai_breakdown['crawler_access'] = crawl_score

    ai = min(ai, 15)
    category_details['ai_citation_readiness'] = {'score': ai, 'max': 15, 'breakdown': ai_breakdown}

    # ===================================================================
    # TOTAL
    # ===================================================================
    total = cq + seo + eeat + tech + ai

    if total >= 90:
        rating = 'Exceptional'
    elif total >= 80:
        rating = 'Strong'
    elif total >= 70:
        rating = 'Acceptable'
    elif total >= 60:
        rating = 'Below Standard'
    else:
        rating = 'Rewrite'

    # Sort issues by severity
    severity_order = {'high': 0, 'medium': 1, 'low': 2}
    issues.sort(key=lambda x: severity_order.get(x.get('severity', 'low'), 3))

    return {
        'total': total,
        'rating': rating,
        'categories': {
            'content_quality': cq,
            'seo_optimization': seo,
            'eeat_signals': eeat,
            'technical_elements': tech,
            'ai_citation_readiness': ai,
        },
        'category_details': category_details,
        'issues': issues,
        'content_type': _detect_content_type(analysis['frontmatter'], analysis['headings'], ''),
    }


# ---------------------------------------------------------------------------
# File analysis orchestrator
# ---------------------------------------------------------------------------


def analyze_file(file_path: str) -> dict[str, Any]:
    """Analyze a single blog file with all analyzers."""
    path = Path(file_path)
    if not path.exists():
        return {'error': f'File not found: {file_path}'}

    content = path.read_text(encoding='utf-8')
    frontmatter = extract_frontmatter(content)
    body = strip_frontmatter(content)

    # Strip markdown formatting for plain-text analysis
    plain_text = re.sub(r'```.*?```', '', body, flags=re.DOTALL)
    plain_text = re.sub(r'<[^>]+>', '', plain_text)
    plain_text = re.sub(r'!\[.*?\]\(.*?\)', '', plain_text)
    plain_text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', plain_text)
    plain_text = re.sub(r'^#{1,6}\s+', '', plain_text, flags=re.MULTILINE)
    plain_text = re.sub(r'\n{3,}', '\n\n', plain_text).strip()

    headings_info = analyze_headings(body)
    sentences_info = analyze_sentences(plain_text)
    faq_info = analyze_faq(body)

    analysis: dict[str, Any] = {
        'file': str(path),
        'format': path.suffix,
        'frontmatter': frontmatter,
        'headings': headings_info,
        'paragraphs': analyze_paragraphs(body),
        'images': analyze_images(content),
        'charts': analyze_charts(content),
        'citations': analyze_citations(body),
        'faq': faq_info,
        'freshness': analyze_freshness(frontmatter),
        'self_promotion': analyze_self_promotion(body),
        'readability': analyze_readability(plain_text),
        'sentences': sentences_info,
        'ai_signals': analyze_ai_signals(plain_text, sentences_info),
        'passive_voice': analyze_passive_voice(plain_text),
        'transition_words': analyze_transition_words(plain_text),
        'ai_trigger_words': analyze_ai_trigger_words(plain_text),
        'schema': analyze_schema(content),
        'links': analyze_links(body),
        'originality': analyze_originality(body),
        'engagement': analyze_engagement(body),
        'ai_citation_readiness': analyze_ai_citation_readiness(body, headings_info, faq_info),
        'social_meta': analyze_social_meta(content, frontmatter),
        'structured_data': analyze_structured_data(body),
        # Internal refs used by scoring (not included in output)
        '_body_text': body,
        '_raw_content': content,
    }

    analysis['score'] = calculate_score(analysis)

    # Remove internal-only keys before returning
    analysis.pop('_body_text', None)
    analysis.pop('_raw_content', None)

    return analysis


# ---------------------------------------------------------------------------
# Output formatters
# ---------------------------------------------------------------------------


def _format_markdown(result: dict[str, Any]) -> str:
    """Format analysis result as a human-readable markdown report."""
    if 'error' in result:
        return f"## Error\n\n{result['error']}"

    score = result['score']
    lines: list[str] = []
    filename = Path(result['file']).name

    lines.append(f"## Blog Quality Report: {filename}")
    lines.append('')
    lines.append(f"### Overall Score: {score['total']}/100 — {score['rating']}")
    lines.append('')

    # Category table
    lines.append('| Category | Score | Max |')
    lines.append('|----------|------:|----:|')
    cat_names = {
        'content_quality': 'Content Quality',
        'seo_optimization': 'SEO Optimization',
        'eeat_signals': 'E-E-A-T Signals',
        'technical_elements': 'Technical Elements',
        'ai_citation_readiness': 'AI Citation Readiness',
    }
    cat_maxes = {
        'content_quality': 30,
        'seo_optimization': 25,
        'eeat_signals': 15,
        'technical_elements': 15,
        'ai_citation_readiness': 15,
    }
    for key, label in cat_names.items():
        s = score['categories'].get(key, 0)
        m = cat_maxes[key]
        lines.append(f'| {label} | {s} | {m} |')
    lines.append('')

    # AI content detection
    ai_sig = result.get('ai_signals', {})
    burstiness = ai_sig.get('burstiness', 0)
    if burstiness >= 0.5:
        burst_label = 'Natural'
    elif burstiness >= 0.3:
        burst_label = 'Borderline'
    else:
        burst_label = 'Flagged'
    lines.append('### AI Content Detection')
    lines.append(f'- Burstiness: {burstiness} ({burst_label})')
    lines.append(f'- AI phrases: {ai_sig.get("ai_phrase_count", 0)} found')
    lines.append(f'- Vocabulary diversity: {ai_sig.get("vocabulary_diversity_ttr", 0)}')
    if ai_sig.get('likely_ai'):
        lines.append('- **WARNING: Content shows AI-generation signals**')
    lines.append('')

    # Readability
    read = result.get('readability', {})
    passive = result.get('passive_voice', {})
    transitions = result.get('transition_words', {})
    ai_triggers = result.get('ai_trigger_words', {})
    sents = result.get('sentences', {})
    lines.append('### Readability')
    lines.append(f'- Flesch Reading Ease: {read.get("flesch_reading_ease", "N/A")} (target: 60-70)')
    if read.get('flesch_kincaid_grade'):
        lines.append(f'- Flesch-Kincaid Grade: {read.get("flesch_kincaid_grade")} (target: 7-8)')
    lines.append(f'- Reading time: {read.get("reading_time_minutes", "N/A")} minutes')
    lines.append(f'- Passive voice: {passive.get("passive_pct", "N/A")}% (target: ≤10%)')
    lines.append(f'- Transition words: {transitions.get("transition_pct", "N/A")}% (target: 20-30%)')
    lines.append(f'- AI trigger words: {ai_triggers.get("per_1k", "N/A")}/1K (target: ≤5)')
    lines.append(f'- Sentences over 20 words: {sents.get("over_20_pct", "N/A")}% (target: ≤25%)')
    if ai_triggers.get('found'):
        trigger_list = ', '.join(f'{t["word"]}({t["count"]})' for t in ai_triggers['found'][:5])
        lines.append(f'- Trigger words found: {trigger_list}')
    if read.get('estimated'):
        lines.append('- *(Estimated — install textstat for accurate metrics)*')
    lines.append('')

    # Issues
    issues = score.get('issues', [])
    if issues:
        lines.append('### Issues')
        for issue in issues:
            sev = issue.get('severity', 'low').upper()
            lines.append(f'- [{sev}] {issue["issue"]}')
        lines.append('')
    else:
        lines.append('### Issues')
        lines.append('No issues detected.')
        lines.append('')

    # Content info
    lines.append('### Content Info')
    lines.append(f'- Word count: {result["paragraphs"]["total_word_count"]}')
    lines.append(f'- Content type: {score.get("content_type", "default")}')
    lines.append(f'- Sentences: {result["sentences"]["count"]}')
    lines.append(f'- Headings: {result["headings"]["total"]}')
    lines.append(f'- Internal links: {result["links"]["internal_count"]}')
    lines.append(f'- External links: {result["links"]["external_count"]}')
    lines.append(f'- Images: {result["images"]["count"]}')
    lines.append('')

    return '\n'.join(lines)


def _format_table(result: dict[str, Any]) -> str:
    """Format analysis result as a compact table."""
    if 'error' in result:
        return f"ERROR: {result['error']}"

    score = result['score']
    filename = Path(result['file']).name
    cats = score['categories']

    lines: list[str] = []
    lines.append(f'{filename}  [{score["total"]}/100 {score["rating"]}]')
    lines.append(f'  Content: {cats["content_quality"]}/30  '
                 f'SEO: {cats["seo_optimization"]}/25  '
                 f'E-E-A-T: {cats["eeat_signals"]}/15  '
                 f'Tech: {cats["technical_elements"]}/15  '
                 f'AI-Cite: {cats["ai_citation_readiness"]}/15')

    issues = score.get('issues', [])
    high_issues = [i for i in issues if i.get('severity') == 'high']
    if high_issues:
        lines.append(f'  HIGH: {"; ".join(i["issue"] for i in high_issues[:3])}')

    return '\n'.join(lines)


def _format_fix(result: dict[str, Any]) -> str:
    """Output specific, actionable fixes prioritized by impact."""
    if 'error' in result:
        return f"ERROR: {result['error']}"

    score = result['score']
    issues = score.get('issues', [])
    filename = Path(result['file']).name

    lines: list[str] = []
    lines.append(f"Fixes for {filename} (Score: {score['total']}/100)")
    lines.append('=' * 60)

    if not issues:
        lines.append('No issues found — content meets all quality checks.')
        return '\n'.join(lines)

    for i, issue in enumerate(issues, 1):
        sev = issue.get('severity', 'low').upper()
        cat = issue.get('category', '').replace('_', ' ').title()
        lines.append(f'{i}. [{sev}] ({cat}) {issue["issue"]}')

    return '\n'.join(lines)


def _format_category_detail(result: dict[str, Any], category: str) -> str:
    """Output detailed breakdown for a single category."""
    if 'error' in result:
        return f"ERROR: {result['error']}"

    score = result['score']
    cat_map = {
        'content': 'content_quality',
        'seo': 'seo_optimization',
        'eeat': 'eeat_signals',
        'technical': 'technical_elements',
        'tech': 'technical_elements',
        'ai': 'ai_citation_readiness',
        'ai_citation': 'ai_citation_readiness',
        'citation': 'ai_citation_readiness',
    }

    cat_key = cat_map.get(category.lower(), category.lower())
    details = score.get('category_details', {}).get(cat_key)

    if not details:
        available = ', '.join(cat_map.keys())
        return f"Unknown category: '{category}'. Available: {available}"

    cat_labels = {
        'content_quality': 'Content Quality',
        'seo_optimization': 'SEO Optimization',
        'eeat_signals': 'E-E-A-T Signals',
        'technical_elements': 'Technical Elements',
        'ai_citation_readiness': 'AI Citation Readiness',
    }

    lines: list[str] = []
    label = cat_labels.get(cat_key, cat_key)
    lines.append(f"{label}: {details['score']}/{details['max']}")
    lines.append('-' * 40)

    breakdown = details.get('breakdown', {})
    for sub_key, sub_score in breakdown.items():
        lines.append(f"  {sub_key.replace('_', ' ').title()}: {sub_score}")

    # Category-specific issues
    cat_issues = [i for i in score.get('issues', []) if i.get('category') == cat_key or
                  i.get('category') == category.lower()]
    if cat_issues:
        lines.append('')
        lines.append('Issues:')
        for issue in cat_issues:
            lines.append(f"  - [{issue['severity'].upper()}] {issue['issue']}")

    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------


def _process_batch(directory: Path, sort_key: str = 'score') -> dict[str, Any]:
    """Analyze all blog files in a directory."""
    results: list[dict[str, Any]] = []
    for ext in ['*.md', '*.mdx', '*.html']:
        for f in directory.glob(ext):
            results.append(analyze_file(str(f)))

    # Sort
    if sort_key == 'score':
        results.sort(key=lambda r: r.get('score', {}).get('total', 0), reverse=True)
    elif sort_key == 'name':
        results.sort(key=lambda r: r.get('file', ''))
    elif sort_key == 'words':
        results.sort(key=lambda r: r.get('paragraphs', {}).get('total_word_count', 0), reverse=True)

    return {'batch': True, 'count': len(results), 'results': results}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main(args: argparse.Namespace) -> None:
    """Main execution function."""
    path = Path(args.input)
    fmt = getattr(args, 'format', 'json')
    category = getattr(args, 'category', None)
    fix_mode = getattr(args, 'fix', False)
    sort_key = getattr(args, 'sort', 'score')

    # Batch mode
    if path.is_dir() and getattr(args, 'batch', False):
        batch_result = _process_batch(path, sort_key)

        if fmt == 'markdown':
            for r in batch_result['results']:
                print(_format_markdown(r))
                print('---\n')
        elif fmt == 'table':
            for r in batch_result['results']:
                print(_format_table(r))
            print(f'\nTotal: {batch_result["count"]} files')
        else:
            output = json.dumps(batch_result, indent=2)
            if args.output:
                Path(args.output).write_text(output)
                print(f'Report saved to {args.output}', file=sys.stderr)
            else:
                print(output)
        return

    # Single file mode
    if not path.is_file():
        error = {'error': f'Path not found or not a file: {args.input}'}
        if fmt == 'json':
            print(json.dumps(error, indent=2))
        else:
            print(f"ERROR: {error['error']}")
        sys.exit(1)

    result = analyze_file(str(path))

    # Category detail mode
    if category:
        print(_format_category_detail(result, category))
        return

    # Fix mode
    if fix_mode:
        print(_format_fix(result))
        return

    # Format output
    if fmt == 'markdown':
        output = _format_markdown(result)
        if args.output:
            Path(args.output).write_text(output)
            print(f'Report saved to {args.output}', file=sys.stderr)
        else:
            print(output)
    elif fmt == 'table':
        print(_format_table(result))
    else:
        output = json.dumps(result, indent=2)
        if args.output:
            Path(args.output).write_text(output)
            print(f'Report saved to {args.output}', file=sys.stderr)
        else:
            print(output)


if __name__ == '__main__':
    _print_dependency_notice()

    parser = argparse.ArgumentParser(
        description='Blog Quality Analyzer — 5-category, 100-point scoring system',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python analyze_blog.py post.md                          Default JSON output
  python analyze_blog.py post.md --format markdown        Markdown report
  python analyze_blog.py post.md --format table           Compact table
  python analyze_blog.py ./posts --batch --sort score     Batch analysis
  python analyze_blog.py post.md --category seo           Single category detail
  python analyze_blog.py post.md --fix                    Prioritized fix list

Scoring Categories (100 points):
  Content Quality        30 pts   Depth, readability, originality, structure
  SEO Optimization       25 pts   Title, headings, keywords, linking, meta
  E-E-A-T Signals        15 pts   Author, citations, trust, experience
  Technical Elements     15 pts   Schema, images, structured data, speed
  AI Citation Readiness  15 pts   Citability, Q&A, entities, extraction

Rating Bands:
  90-100  Exceptional    80-89  Strong    70-79  Acceptable
  60-69   Below Standard   <60  Rewrite

Optional dependencies (graceful degradation):
  pip install textstat beautifulsoup4
        """,
    )
    parser.add_argument('--version', action='version', version='%(prog)s 1.0.0')
    parser.add_argument('input', help='Blog file path or directory (with --batch)')
    parser.add_argument('--output', '-o', help='Output file path')
    parser.add_argument('--format', '-f', choices=['json', 'markdown', 'table'],
                        default='json', help='Output format (default: json)')
    parser.add_argument('--batch', action='store_true',
                        help='Analyze all .md/.mdx/.html files in directory')
    parser.add_argument('--sort', choices=['score', 'name', 'words'],
                        default='score', help='Sort order for batch mode (default: score)')
    parser.add_argument('--category', '-c',
                        help='Show detailed breakdown for a single category '
                             '(content, seo, eeat, technical, ai)')
    parser.add_argument('--fix', action='store_true',
                        help='Output prioritized list of specific fixes')

    args = parser.parse_args()

    try:
        main(args)
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)
