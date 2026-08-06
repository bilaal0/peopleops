import fs from 'fs';
import path from 'path';

const dirsToRemove = [
  'f:/Bilal/proplet-main/app/routes/properties',
  'f:/Bilal/proplet-main/app/routes/landlords',
  'f:/Bilal/proplet-main/app/routes/maintenance',
  'f:/Bilal/proplet-main/app/routes/notes',
  'f:/Bilal/proplet-main/app/routes/rent',
  'f:/Bilal/proplet-main/app/routes/transactions',
  'f:/Bilal/proplet-main/app/components/properties',
  'f:/Bilal/proplet-main/app/components/notes',
];

for (const dir of dirsToRemove) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('Removed:', dir);
  } else {
    console.log('Not found:', dir);
  }
}
