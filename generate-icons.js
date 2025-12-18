const fs = require('fs');
const { createCanvas } = require('canvas');

function createIcon(size, filePath) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Fill with a solid blue color
  ctx.fillStyle = 'blue';
  ctx.fillRect(0, 0, size, size);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);
}

// Generate icons
createIcon(16, 'icons/icon16.png');
createIcon(48, 'icons/icon48.png');
createIcon(128, 'icons/icon128.png');

console.log('Icons generated successfully.');