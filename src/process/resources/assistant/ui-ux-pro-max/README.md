# UI/UX Pro Max - Design Database

This directory contains the design database and search utilities for the UI/UX Pro Max assistant.

## Contents

- **data/**: Design database files (CSV format)
  - `styles.csv` - 57 UI styles
  - `colors.csv` - 95 color palettes
  - `typography.csv` - 56 font pairings
  - `charts.csv` - 24 chart types
  - `products.csv` - Product type recommendations
  - `landing.csv` - Landing page patterns
  - `ux-guidelines.csv` - 98 UX best practices
  - `prompts.csv` - AI prompts and CSS keywords
  - `stacks/` - 11 tech stack-specific guidelines

- **scripts/**: Search utilities
  - `search.py` - Main search script for querying the design database
  - `core.py` - Core search functionality

## Usage

The UI/UX Pro Max assistant automatically uses these resources when helping with UI/UX design tasks.

### Manual Search

You can also manually search the database:

```bash
# Search for product recommendations
python3 ui-ux-pro-max/scripts/search.py "saas" --domain product

# Search for UI styles
python3 ui-ux-pro-max/scripts/search.py "glassmorphism" --domain style

# Search for color palettes
python3 ui-ux-pro-max/scripts/search.py "healthcare" --domain color

# Search for typography
python3 ui-ux-pro-max/scripts/search.py "elegant modern" --domain typography

# Search for UX guidelines
python3 ui-ux-pro-max/scripts/search.py "animation" --domain ux

# Search stack-specific guidelines
python3 ui-ux-pro-max/scripts/search.py "responsive" --stack html-tailwind
```

## Prerequisites

Python 3.x is required to run the search scripts.

## Source

This design database is from the [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) project.

## License

MIT License - See the original project for details.
