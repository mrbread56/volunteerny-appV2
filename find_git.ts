import fs from 'fs';
import path from 'path';

function findGitDir(startDir: string): string | null {
  let currentDir = startDir;
  while (currentDir !== path.parse(currentDir).root) {
    const gitPath = path.join(currentDir, '.git');
    if (fs.existsSync(gitPath)) {
      return gitPath;
    }
    currentDir = path.dirname(currentDir);
  }
  // Check the root too
  const rootGit = path.join(path.parse(currentDir).root, '.git');
  if (fs.existsSync(rootGit)) return rootGit;
  return null;
}

const gitDir = findGitDir(process.cwd());
console.log("Found git directory at:", gitDir);
