import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultScript = path.resolve(here, '../../../../ml/train_forecast.py');

export async function runForecastPython(payload) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'partcast-ml-'));
  const input = path.join(tmp, 'input.json');
  const output = path.join(tmp, 'output.json');
  const model = path.join(tmp, 'xgboost-model.json');
  await writeFile(input, JSON.stringify(payload), 'utf8');

  const scriptPath = config.ML_SCRIPT_PATH && config.ML_SCRIPT_PATH !== '../../ml/train_forecast.py'
    ? path.resolve(config.ML_SCRIPT_PATH)
    : defaultScript;

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(config.PYTHON_BIN, [scriptPath, '--input', input, '--output', output, '--model-out', model], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });
      let stderr = '';
      child.stderr.on('data', d => { stderr += d.toString(); });
      child.stdout.on('data', d => process.stdout.write(`[ml] ${d}`));
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error(stderr || `ML process exited with code ${code}`)));
    });

    const result = JSON.parse(await readFile(output, 'utf8'));
    const modelBuffer = await readFile(model);
    return { result, modelBuffer };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
