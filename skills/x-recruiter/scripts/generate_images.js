const fs = require('fs');

// Placeholder generator instructions. Replace with real image generation if needed.
const output = ['Generate cover.png and jd_details.png with 1080x1350 resolution.', 'Cover: role title + short tagline + company name.', 'Details: responsibilities, requirements, apply method.'].join('\n');

fs.writeFileSync('image_instructions.txt', output);
console.log('Wrote image_instructions.txt');
