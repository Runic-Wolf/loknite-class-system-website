import { lstat, readFile, writeFile } from 'node:fs/promises';

const path = '.dev.vars';
let content = '';
let exists = false;
try {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('.dev.vars precisa ser um arquivo local comum.');
  exists = true;
  content = await readFile(path, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

if (/^\s*LCS_LOCAL_DEV\s*=/m.test(content)) {
  console.log('Kept the existing LCS_LOCAL_DEV setting in .dev.vars.');
} else {
  const prefix = content && !content.endsWith('\n') ? '\n' : '';
  await writeFile(path, `${content}${prefix}LCS_LOCAL_DEV=true\n`, { flag: exists ? 'w' : 'wx' });
  console.log('Enabled the loopback-only local login in .dev.vars.');
}
