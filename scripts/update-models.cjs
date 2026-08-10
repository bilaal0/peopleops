const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../app/models');
const files = fs.readdirSync(modelsDir);

for (const file of files) {
  if (file === 'organization.server.js') continue;

  const filePath = path.join(modelsDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // Replace agencyId with organizationId
  content = content.replace(/agencyId/g, 'organizationId');
  
  // Replace ref: 'Agency' with ref: 'Organization' (case sensitive and quotes can vary)
  content = content.replace(/ref:\s*['"]Agency['"]/g, "ref: 'Organization'");
  content = content.replace(/ref:\s*['"]agency['"]/gi, "ref: 'Organization'");

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
