/**
 * Character Card & World Info Parser Tool
 *
 * This tool extracts character card or world info data from PNG images.
 * Compatible with SillyTavern format.
 *
 * Usage: node parse-character-card.js <image-path> [output-path] [--world-info]
 * Example: node parse-character-card.js character.png character.json
 * Example: node parse-character-card.js world-info.png world-info.json --world-info
 */

const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

// Check if dependencies are installed
let extract, PNGtext;
try {
  extract = require('png-chunks-extract');
  PNGtext = require('png-chunk-text');
} catch (error) {
  console.error('Error: Required dependencies not found.');
  console.error('Please run: npm install png-chunks-extract png-chunk-text');
  process.exit(1);
}

/**
 * Extract character card data from PNG image
 * Based on SillyTavern's implementation: src/character-card-parser.js
 * @param {string} imagePath - Path to PNG image
 * @returns {string} - Character card JSON string
 */
function extractFromPng(imagePath) {
  try {
    const buffer = fs.readFileSync(imagePath);
    const chunks = extract(new Uint8Array(buffer));

    const textChunks = chunks.filter((chunk) => chunk.name === 'tEXt').map((chunk) => PNGtext.decode(chunk.data));

    if (textChunks.length === 0) {
      console.error('PNG metadata does not contain any text chunks.');
      throw new Error('PNG metadata does not contain any text chunks.');
    }

    // Try ccv3 first (v3 format) - V3 takes precedence as per SillyTavern
    const ccv3Index = textChunks.findIndex((chunk) => chunk.keyword.toLowerCase() === 'ccv3');

    if (ccv3Index > -1) {
      return Buffer.from(textChunks[ccv3Index].text, 'base64').toString('utf8');
    }

    // Fallback to chara (v2 format)
    const charaIndex = textChunks.findIndex((chunk) => chunk.keyword.toLowerCase() === 'chara');

    if (charaIndex > -1) {
      return Buffer.from(textChunks[charaIndex].text, 'base64').toString('utf8');
    }

    console.error('PNG metadata does not contain any character card data (chara or ccv3).');
    throw new Error('PNG metadata does not contain any character card data (chara or ccv3).');
  } catch (error) {
    if (error.message.includes('PNG metadata')) {
      throw error; // Re-throw PNG metadata errors as-is
    }
    throw new Error(`Failed to extract from PNG: ${error.message}`);
  }
}

/**
 * Extract world info data from PNG image
 * @param {string} imagePath - Path to PNG image
 * @returns {string} - World info JSON string
 */
function extractWorldInfoFromPng(imagePath) {
  try {
    const buffer = fs.readFileSync(imagePath);
    const chunks = extract(new Uint8Array(buffer));

    const textChunks = chunks.filter((chunk) => chunk.name === 'tEXt').map((chunk) => PNGtext.decode(chunk.data));

    if (textChunks.length === 0) {
      throw new Error('PNG metadata does not contain any text chunks.');
    }

    // Look for naidata (world info keyword)
    const naidataIndex = textChunks.findIndex((chunk) => chunk.keyword.toLowerCase() === 'naidata');

    if (naidataIndex > -1) {
      return Buffer.from(textChunks[naidataIndex].text, 'base64').toString('utf8');
    }

    throw new Error('PNG metadata does not contain world info data (naidata).');
  } catch (error) {
    throw new Error(`Failed to extract world info from PNG: ${error.message}`);
  }
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node parse-character-card.js <image-path> [output-path] [--world-info]');
    console.error('Example: node parse-character-card.js character.png character.json');
    console.error('Example: node parse-character-card.js world-info.png world-info.json --world-info');
    process.exit(1);
  }

  const imagePath = args[0];
  // Important: outputPath must be provided as second argument, not via stdout redirection
  const outputPath = args[1] || imagePath.replace(/\.(png|webp)$/i, '.json');
  const isWorldInfo = args.includes('--world-info');

  if (!fs.existsSync(imagePath)) {
    console.error(`Error: Image file not found: ${imagePath}`);
    console.error('Please check if the file path is correct and the file exists.');
    process.exit(1);
  }

  try {
    const ext = path.extname(imagePath).toLowerCase();
    let jsonData;

    if (ext === '.png') {
      if (isWorldInfo) {
        jsonData = extractWorldInfoFromPng(imagePath);
      } else {
        jsonData = extractFromPng(imagePath);
      }
    } else if (ext === '.webp') {
      // WebP support would require additional library
      // For now, suggest converting to PNG or using JSON format
      console.error('Error: WebP format parsing requires additional setup.');
      console.error('Please convert to PNG or use JSON format.');
      process.exit(1);
    } else {
      console.error(`Error: Unsupported file format: ${ext}`);
      console.error('Supported formats: .png');
      process.exit(1);
    }

    // Validate JSON
    try {
      JSON.parse(jsonData);
    } catch (error) {
      console.error('Error: Extracted data is not valid JSON.');
      console.error('This might not be a valid character card or world info image.');
      console.error('The image may not contain embedded character data, or the data format is corrupted.');
      process.exit(1);
    }

    // Save to file (do not use stdout redirection, use file path argument)
    fs.writeFileSync(outputPath, jsonData, 'utf8');
    console.log(`Successfully extracted data to: ${outputPath}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (error.message.includes('PNG metadata')) {
      console.error('This image may not be a valid SillyTavern character card.');
      console.error('Please ensure the image was exported from SillyTavern with character data embedded.');
    }
    process.exit(1);
  }
}

// Export for use as module
module.exports = {
  extractFromPng,
  extractWorldInfoFromPng,
};
