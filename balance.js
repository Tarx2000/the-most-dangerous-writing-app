const fs = require('fs');
const s = fs.readFileSync('src/lib/storageOps.ts', 'utf8');
const lines = s.split('\n');
let open = 0;
for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    for (const ch of ln) {
        if (ch === '{') open++;
        if (ch === '}') open--;
    }
    if (open < 0) {
        console.log('Negative balance at', i + 1, ln);
        open = 0;
    }
}
console.log('Final balance', open);
