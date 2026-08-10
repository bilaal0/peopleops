const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            walkDir(dirPath, callback);
        } else {
            callback(dirPath);
        }
    });
}

const targetExtensions = ['.js', '.jsx', '.ts', '.tsx'];
const replacements = [
    { from: /Agencies/g, to: 'Organizations' },
    { from: /agencies/g, to: 'organizations' },
    { from: /Agency/g, to: 'Organization' },
    { from: /agency/g, to: 'organization' },
    { from: /AGENCIES/g, to: 'ORGANIZATIONS' },
    { from: /AGENCY/g, to: 'ORGANIZATION' }
];

let changedFiles = 0;

walkDir(path.join(__dirname, '../app'), (filePath) => {
    if (targetExtensions.includes(path.extname(filePath))) {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;

        for (const { from, to } of replacements) {
            content = content.replace(from, to);
        }

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${filePath}`);
            changedFiles++;
        }
    }
});

// Also update react-router.config.ts and app/routes.ts
const rootFiles = ['../react-router.config.ts', '../app/routes.ts'];
for (const file of rootFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;

        for (const { from, to } of replacements) {
            content = content.replace(from, to);
        }

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Updated ${filePath}`);
            changedFiles++;
        }
    }
}

console.log(`Total files updated: ${changedFiles}`);
