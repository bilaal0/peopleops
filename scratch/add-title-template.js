import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(dirPath);
  });
}

let modifiedFiles = 0;

walk('./app', (filePath) => {
  if (!filePath.endsWith('.js') && !filePath.endsWith('.jsx') && !filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;

  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Add title display in template literals: ${tenant.firstName} ${tenant.lastName} -> ${tenant.title ? tenant.title + ' ' : ''}${tenant.firstName} ${tenant.lastName}
  const nameRegex = /\$\{([a-zA-Z0-9_?.]+)\.firstName\}\s*\$\{([a-zA-Z0-9_?.]+)\.lastName\}/g;
  content = content.replace(nameRegex, (match, obj1, obj2) => {
    if (obj1 === obj2) {
      return `\${${obj1}.title ? ${obj1}.title + ' ' : ''}\${${obj1}.firstName} \${${obj2}.lastName}`;
    }
    return match;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    modifiedFiles++;
    console.log(`Updated ${filePath}`);
  }
});

console.log(`Done! Modified ${modifiedFiles} files.`);
