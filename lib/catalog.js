const fs = require('node:fs');
const path = require('node:path');
// The selector is the canonical catalog; no independently maintained topic list.
function topics() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  return [...html.matchAll(/selectTopic\('[^']*','([^']+)','([^']+)'\)/g)]
    .map(([,label,key]) => ({label,key})).filter(t => t.label !== 'Aleatório');
}
module.exports = { topics };
