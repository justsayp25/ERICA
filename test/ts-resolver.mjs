import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const mockExpoUrl = pathToFileURL(path.resolve(process.cwd(), 'test/mockExpo.mjs')).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'expo' || specifier === 'expo-modules-core') {
    return nextResolve(mockExpoUrl, context);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const parentDir = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : process.cwd();
      const target = path.resolve(parentDir, specifier);
      for (const ext of ['.ts', '.tsx', '.web.ts', '.web.js', '.js', '/index.ts', '/index.tsx', '/index.js']) {
        const candidate = target + ext;
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return nextResolve(pathToFileURL(candidate).href, context);
        }
      }
    }
    throw err;
  }
}
