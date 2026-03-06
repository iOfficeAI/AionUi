/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generate multiple icon sizes for Linux desktop integration.
 * electron-builder only installs the source icon at its original size (1024x1024),
 * but Linux desktops require icons in standard hicolor sizes (48, 64, 128, 256, 512).
 *
 * Usage: node scripts/generateLinuxIcons.js
 * Output: build/icons/<size>x<size>.png
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE_ICON = path.resolve(__dirname, '..', 'resources', 'app.png');
const OUTPUT_DIR = path.resolve(__dirname, '..', 'build', 'icons');
const SIZES = [16, 32, 48, 64, 128, 256, 512];

async function generateIcons() {
    // Ensure output directory exists
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    if (!fs.existsSync(SOURCE_ICON)) {
        console.error(`❌ Source icon not found: ${SOURCE_ICON}`);
        process.exit(1);
    }

    console.log(`🎨 Generating Linux icons from ${SOURCE_ICON}`);

    for (const size of SIZES) {
        const outputFile = path.join(OUTPUT_DIR, `${size}x${size}.png`);
        await sharp(SOURCE_ICON).resize(size, size).png().toFile(outputFile);
        console.log(`   ✓ ${size}x${size}.png`);
    }

    console.log(`✅ Generated ${SIZES.length} icon sizes in ${OUTPUT_DIR}\n`);
}

generateIcons().catch((err) => {
    console.error('❌ Icon generation failed:', err);
    process.exit(1);
});
