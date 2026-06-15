import { app } from 'electron';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

await app.whenReady();
writeFileSync(join(tmpdir(), 'peilian-user-data-path.txt'), app.getPath('userData'), 'utf8');
app.quit();
