const fs = require('fs');
const p = 'd:/Asim/Company/Cogentex/Clients/legalet/app/routes/tenants/detail.jsx';
let text = fs.readFileSync(p, 'utf8');
// replace \` with `
text = text.replace(/\\`/g, '`');
// replace \${ with ${
text = text.replace(/\\\$\{/g, '${');
fs.writeFileSync(p, text, 'utf8');
console.log('Fixed detail.jsx string interpolations');
