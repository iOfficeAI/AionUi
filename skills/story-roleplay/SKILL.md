---
name: story-roleplay
description: Parse and apply character cards and world info files in multiple formats (PNG, WebP, JSON), fully compatible with SillyTavern format. Supports automatic parsing, keyword triggering, and dynamic updates.
---

# Story Roleplay Skills

Parse and apply character cards and world info files for immersive story roleplay experiences. Fully compatible with SillyTavern formats.

## ⚠️ Core Constraints (Must Follow)

1. **🚫 ABSOLUTELY FORBIDDEN**: Guessing PNG/WebP image content, must use parser tool to extract data
2. **✅ MUST EXECUTE**: Prioritize copying preset tool (`skills/story-roleplay/scripts/`), create only if not found
3. **⚠️ LAST RESORT**: When creating scripts, use complete code at end of file, version must be `1.0.0` (do not use `^`)

---

## Common: Parser Tool Usage Workflow

### Quick Path (Try First)

**Step 1: Copy Preset Tool**

Try in the following order until successful:

- **Method 1 (Highest Priority)**: Relative path (if workspace is under project root):

  ```bash
  cp skills/story-roleplay/scripts/parse-character-card.js . && cp skills/story-roleplay/scripts/package.json .
  ```

- **Method 2**: Search upward for project root (up to 5 levels):

  ```bash
  for dir in . .. ../.. ../../.. ../../../.. ../../../../..; do
    if [ -f "$dir/skills/story-roleplay/scripts/parse-character-card.js" ]; then
      cp "$dir/skills/story-roleplay/scripts/parse-character-card.js" .
      cp "$dir/skills/story-roleplay/scripts/package.json" .
      break
    fi
  done
  ```

- **Method 3**: Global search (exclude temp directories):

  ```bash
  SCRIPT_PATH=$(find ~ -name "parse-character-card.js" -path "*/skills/story-roleplay/scripts/*" ! -path "*/temp*" ! -path "*/*-temp*" ! -path "*/.webpack/*" 2>/dev/null | head -1)
  if [ -n "$SCRIPT_PATH" ]; then
    SCRIPT_DIR=$(dirname "$SCRIPT_PATH")
    cp "$SCRIPT_DIR/parse-character-card.js" .
    cp "$SCRIPT_DIR/package.json" .
  fi
  ```

- **Verify**: Confirm files copied
  ```bash
  ls parse-character-card.js package.json
  ```

  - If files don't exist, continue to next method or use fallback option

**Step 2: Install Dependencies**

```bash
npm install
```

- Wait for completion, check if `node_modules` was created
- If fails: Check network/permission/Node.js environment

**Step 3: Execute Parser**

```bash
# Character card
node parse-character-card.js <image-path> <output-json-path>

# World info
node parse-character-card.js <image-path> <output-json-path> --world-info
```

**Important**:

- ✅ Must provide output path as second argument
- ❌ Do not use stdout redirection (`>`)
- Use quotes if filename contains Chinese characters or spaces

**Examples**:

```bash
node parse-character-card.js character.png character.json
node parse-character-card.js "薇娜丽丝.png" character.json
node parse-character-card.js world-info.png world-info.json --world-info
```

**Step 4: Verify Results**

- Check output: Should see "Successfully extracted data to: <path>"
- Verify JSON file exists and format is correct
- **If fails**:
  - Check error message (script will output specific error)
  - Common errors:
    - "PNG metadata does not contain any text chunks" → Image may not be a valid SillyTavern character card
    - "Required dependencies not found" → Need to run `npm install` first
    - "Image file not found" → Check if image path is correct
  - **ABSOLUTELY CANNOT guess or fabricate information**, must report error clearly

### Fallback Option (Last Resort)

If all above methods fail (possibly due to system permission issues), creating script files is allowed:

1. **Create `package.json`** (see "Fallback Code" section at end of file)
2. **Create `parse-character-card.js`** (see "Fallback Code" section at end of file)

**Prerequisite**: Must have tried all finding methods and all failed.

---

## Character Card Parser

**Triggers**: character card, 角色卡, load character, 加载角色, parse character, 解析角色卡

**Description**: Parse character card files in multiple formats, including PNG, WebP image formats and JSON file format.

### Supported Formats

#### 1. PNG Image Format (SillyTavern Standard)

- Data location: In PNG tEXt chunks
- Keywords: `chara` (v2) or `ccv3` (v3)
- Encoding: Base64-encoded JSON string

**Processing**: Use common parser tool workflow (see above), use character card command format when executing.

#### 2. WebP Image Format (SillyTavern Compatible)

- Data location: In WebP EXIF/XMP metadata or text chunks
- Keywords: `chara` (v2) or `ccv3` (v3)

**Processing**:

- **Recommended**: Convert WebP to PNG first, then use PNG parser tool
- Or try using PNG parser tool (if WebP contains similar metadata structure)
- If conversion or parsing not possible, prompt user to provide JSON format or re-export from SillyTavern

#### 3. JSON File Format

**Standard Format** (Tavern Card V2/V3):

- Includes: `name`, `description`, `personality`, `scenario`, `first_mes`, `system_prompt`
- Optional: `character_book` (character knowledge base)
- Supports simplified format (direct fields, no nested structure)

**Processing**: Read and parse directly (simplest, preferred)

### Parsing Steps

**Important: PNG/WebP images must use parser tool, guessing content is forbidden**

1. **Detect file format**:
   - **JSON files**: Read and parse directly (simplest, preferred)
   - **PNG/WebP files**: Use common parser tool workflow (see above)

2. **Extract character information**:
   - `name`: Character name
   - `description`: Character description
   - `personality`: Personality traits
   - `scenario`: Scenario setting
   - `first_mes`: First message (used as opening)
   - `system_prompt`: System prompt (character behavior rules)
   - `character_book`: Character knowledge base (similar to world info)

3. **Apply character information**:
   - Use character's system_prompt as behavior rules
   - Use first_mes as conversation opening
   - Apply character_book entries to conversation

4. **Save as JSON format (after parsing images)**:
   - After successfully parsing PNG/WebP images, **automatically convert to JSON format**
   - Save as `character.json` in workspace
   - Preserve all original data from image

### Best Practices

- **Prefer JSON format** (easiest to parse, no additional tools needed)
- **PNG format**: Must use parser tool, guessing content is forbidden
- **WebP format**: Convert to PNG then use parser tool, or use JSON format
- **Error handling**: When parsing fails, must provide clear error message, absolutely cannot guess or fabricate character information
- **Always save parsed images as JSON format** for easier viewing and editing

---

## World Info Parser

**Triggers**: world info, 世界信息, world tree, 世界树, load world info, 加载世界信息

**Description**: Parse and apply world info files, implementing keyword trigger mechanism. Supports JSON files and PNG/WebP image formats (with embedded world info data).

### Supported Formats

#### 1. JSON File Format

```json
{
  "name": "World Name",
  "entries": [
    {
      "keys": ["keyword1", "keyword2"],
      "content": "Content to inject when triggered",
      "priority": 100,
      "enabled": true
    }
  ]
}
```

#### 2. PNG Image Format (SillyTavern Compatible)

- Data location: In PNG tEXt chunks
- Keyword: `naidata` (SillyTavern standard)
- Encoding: Base64-encoded JSON string

**Processing**: Use common parser tool workflow (see above), use `--world-info` flag when executing.

#### 3. WebP Image Format (SillyTavern Compatible)

**Processing**:

- **Recommended**: Convert WebP to PNG first, then use PNG parser
- If conversion fails, suggest user use JSON format or re-export from SillyTavern

### Field Descriptions

- `keys`: Keyword array, triggers when these words appear in conversation
- `content`: Content to inject when triggered
- `priority`: Priority (higher number = higher priority)
- `enabled`: Whether enabled (true/false)

### Trigger Mechanism

1. **Keyword detection**: Monitor conversation content, detect if it contains world info keywords
2. **Content injection**: When keywords appear, integrate corresponding content into response, sorted by priority
3. **Natural integration**: Do not insert world info content awkwardly, naturally integrate into conversation and narrative

### Parsing Steps

1. **Detect file format**:
   - **JSON files**: Read and parse directly (simplest, preferred)
   - **PNG/WebP files**: Use common parser tool workflow (see above), use `--world-info` flag

2. **Extract world info**:
   - Read output JSON file
   - Parse JSON, extract `entries` array
   - Verify JSON structure is correct (must contain `entries` field)

3. **Save as JSON format (after parsing images)**:
   - After successfully parsing PNG/WebP images, automatically convert to JSON format
   - Save as `world-info.json` in workspace

### Best Practices

- **Prefer JSON format** (easiest to parse, no additional tools needed)
- **PNG format**: Use same parser tool as character cards (with `--world-info` flag)
- **WebP format**: Recommend converting to PNG or using JSON format
- Keywords should be specific and meaningful, avoid overly broad keywords
- **Always save parsed images as JSON format** for easier viewing and editing

---

## Character Book Handler

**Triggers**: character book, 角色知识库, character entry, 角色条目

**Description**: Handle character_book (character knowledge base) in character cards, similar to world info but bound to specific character.

### Character Book Format

character_book field in character card:

- `name`: Character knowledge base name
- `entries`: Entry array, each entry contains `keys`, `content`, `priority`, `enabled`

### Processing

1. **When loading character card**: Extract character_book field, parse entries array, apply together with character information
2. **During conversation**: Detect keywords in character_book, inject relevant content when keywords appear
3. **Priority**: character_book entries usually have higher priority than world info

### Best Practices

- character_book is for character-specific knowledge
- World info is for general world settings
- Both can be used together, but pay attention to priority

---

## File Detection and Loading Workflow

### Automatic Detection

1. **Scan workspace**:
   - Find character card files: `character.png`, `character.webp`, `character.json`, `*.character.json`
   - Find world info files: `world-info.png`, `world-info.webp`, `world-info.json`, `world.json`

2. **Format recognition and parsing**:
   - **JSON files**: Read directly
   - **PNG/WebP images**: Use common parser tool workflow (see above)

3. **Apply parsed results**:
   - Apply parsed results to conversation context
   - After successfully parsing images, automatically save as JSON format

### Character Card and World Info Creation

**When no files exist** (Important: Must actively guide user):

1. **Active guidance process**:
   - Step 1: Ask about story type and background setting
   - Step 2: Ask about character details (type, personality, background, speaking style)
   - Step 3: Ask about world setting (rules, locations, special settings, etc.)

2. **Confirm information**: Summarize user-provided information, wait for user confirmation before creating files

3. **Create files**:
   - After confirmation, create `character.json` with all character information
   - If world-building elements mentioned, create `world-info.json` with relevant entries

**Creation format**:

- Character card: Use Tavern Card V2/V3 standard format, include all essential fields
- World info: Create entries for key concepts, locations, rules, use meaningful keywords

### Manual Loading

Users can manually load via:

- "Load character card: character.png"
- "Read world info: world-info.json"
- "Use this character: [upload file]"

## Compatibility

This skill is fully compatible with SillyTavern formats:

- ✅ PNG image format (embedded JSON, SillyTavern standard) - for character cards and world info
- ✅ WebP image format (embedded JSON, SillyTavern compatible) - for character cards and world info
- ✅ JSON file format (Tavern Card V2/V3) - for character cards and world info
- ✅ World info format (PNG/WebP images use keyword `naidata`)
- ✅ Character Book (character knowledge base)

---

## Fallback Code (For Last Resort Use)

**Important**: The following code should only be used when all path finding methods have failed. Prioritize using copy methods.

### package.json

```json
{
  "name": "story-roleplay-parser",
  "version": "1.0.0",
  "description": "Parser tools for character cards and world info",
  "main": "parse-character-card.js",
  "scripts": {
    "parse": "node parse-character-card.js"
  },
  "dependencies": {
    "png-chunks-extract": "1.0.0",
    "png-chunk-text": "1.0.0"
  }
}
```

### parse-character-card.js

Complete code reference: `skills/story-roleplay/scripts/parse-character-card.js`

**Key features**:

- Extract character card data from PNG images (keywords: `chara` or `ccv3`)
- Extract world info data from PNG images (keyword: `naidata`)
- Support Base64 decoding and JSON validation
- Complete error handling and user-friendly error messages

**If file is not accessible**, can create based on following logic:

- Use `png-chunks-extract` to extract PNG chunks
- Use `png-chunk-text` to decode tEXt chunks
- Find keywords (`chara`/`ccv3` for character cards, `naidata` for world info)
- Base64 decode and validate JSON format
