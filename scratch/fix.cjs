const fs = require('fs');

let code = fs.readFileSync('app/utils/activityLog.server.js', 'utf8');

const helper = `async function getFullUserName(user) {
  if (user?.firstName || user?.lastName || user?.email) {
    const firstName = user.firstName || '';
    const lastName = user.lastName || '';
    const fullName = (firstName + ' ' + lastName).trim();
    return fullName || user.email || 'Unknown user';
  }
  
  const userId = user?.userId || user?._id || user?.id;
  if (!userId) return 'Unknown user';
  
  try {
    const { User } = await import('../models/user.server.js');
    const dbUser = await User.findById(userId).select('firstName lastName email').lean();
    if (!dbUser) return 'Unknown user';
    
    const firstName = dbUser.firstName || '';
    const lastName = dbUser.lastName || '';
    const fullName = (firstName + ' ' + lastName).trim();
    return fullName || dbUser.email || 'Unknown user';
  } catch (err) {
    return 'Unknown user';
  }
}

`;

code = code.replace('function getUserName(user) {', helper + 'function getUserName(user) {');
code = code.replace(/const userName = getUserName\(user\);/g, 'const userName = await getFullUserName(user);');

fs.writeFileSync('app/utils/activityLog.server.js', code);
console.log("Fixed!");
