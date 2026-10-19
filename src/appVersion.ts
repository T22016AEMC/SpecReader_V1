import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

/** Server-side only. Walks up from `startDir` to the first package.json with a version. */
export function findPackageVersion(startDir:string):string|null {
 let dir=path.resolve(startDir);
 for(;;){
  const file=path.join(dir,'package.json');
  if(fs.existsSync(file)){
   try{const v=(JSON.parse(fs.readFileSync(file,'utf8').replace(/^﻿/,'')) as {version?:unknown}).version;if(typeof v==='string'&&v)return v;}catch{/* keep walking */}
  }
  const parent=path.dirname(dir);
  if(parent===dir)return null;
  dir=parent;
 }
}
let cached:string|undefined;
/**
 * The application version from package.json. Starts at this module's directory, so it works both in
 * development (`tsx server.ts`, module under src/) and in the bundled build (`node dist/server.mjs`, one level below the root).
 */
export function readAppVersion():string {
 if(cached===undefined){
  cached=findPackageVersion(path.dirname(fileURLToPath(import.meta.url)))??'unknown';
  if(cached==='unknown')console.warn(JSON.stringify({event:'app_version_unavailable'}));
 }
 return cached;
}
