import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
const git=process.env.GIT_EXECUTABLE || 'git';
const files=execFileSync(git,['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const secretPatterns=[/AIza[0-9A-Za-z_-]{35}/,/ghp_[0-9A-Za-z]{36}/,/github_pat_[0-9A-Za-z_]{50,}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const errors=[];
for(const file of files) {
  if(/(^|\/)(node_modules|dist|test-results|audit_workspace)(\/|$)/.test(file)||/(^|\/)\.env(?!\.example$)/.test(file)) errors.push(`${file}: forbidden distribution path`);
  const data=fs.readFileSync(file);
  if(data.length>2*1024*1024) errors.push(`${file}: unexpectedly large source artifact`);
  if(secretPatterns.some(p=>p.test(data.toString('utf8')))) errors.push(`${file}: possible credential`);
}
if(errors.length) {console.error(errors.join('\n'));process.exit(1)}
console.log(`Distribution check passed: ${files.length} source files, no forbidden paths or recognized credentials.`);
