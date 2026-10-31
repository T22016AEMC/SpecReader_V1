import fs from 'node:fs';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {initializeRDKit} from '../../src/engines/scientificEngines/rdkitAdapter';
import {compareGolden, v121GoldenScenarios} from '../helpers/v121Golden';

// Records tests/goldens/v12.v120.pipeline.json once, on the unmodified v1.2.0 code (before any v1.2.1 src change). When the file exists the
// test checks that the current default behaviour reproduces it only while useV121Planning does not exist yet; afterwards v121FlagGolden.test.ts
// takes over (flag false must equal this file) and this recorder is removed from the suite.
beforeAll(() => initializeRDKit(), 60000);
const file = path.resolve(__dirname, '..', 'goldens', 'v12.v120.pipeline.json');

describe('v1.2.0 pipeline golden (recorder)', () => {
  it('writes the golden when absent, and the second run reproduces it', async () => {
    const out = JSON.parse(JSON.stringify(await v121GoldenScenarios()));
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(out));
    if (process.env.V121_DUMP) fs.writeFileSync(process.env.V121_DUMP, JSON.stringify(out));
    expect(compareGolden(out, JSON.parse(fs.readFileSync(file, 'utf8')))).toEqual([]);
  }, 600000);
});
