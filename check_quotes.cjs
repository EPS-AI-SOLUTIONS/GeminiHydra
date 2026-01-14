const fs = require('fs');
const content = fs.readFileSync('C:/Users/BIURODOM/Desktop/GeminiCLI/ai-handler/modules/AgentSwarm.psm1', 'utf8');

let single = false;
let double = false;
let lastDouble = -1;

for (let i = 0; i < content.length; i++) {
  const c = content[i];
  const prev = i > 0 ? content[i-1] : '';
  
  if (c === "'" && !double) {
    single = !single;
  } else if (c === '"' && !single) {
    if (prev !== '`') {
      double = !double;
      if (double) lastDouble = i;
    }
  }
}

console.log('Single open:', single);
console.log('Double open:', double);
if (double) {
    console.log('Last open double quote context:', content.substring(lastDouble, lastDouble + 50));
    // Find line number
    const lines = content.substring(0, lastDouble).split('\n');
    console.log('Line number:', lines.length);
}
