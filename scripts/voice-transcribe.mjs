// Transcribe a voice sample so a clone can be uploaded with a reference
// transcript.
//
// WHY THIS EXISTS
//   VoiceStudio transcribes the reference clip itself when no transcript is
//   supplied -- on the GPU, during every synthesis. Measured on this machine
//   that costs 3.7-6.0s instead of 2.9-3.6s, and fails outright with
//   `torch.AcceleratorError: CUDA error: unknown error` when the GPU is busy.
//   A transcript is now REQUIRED by POST /api/voice-clones.
//
//   This runs the SAME model VoiceStudio reaches for (the already-cached
//   openai/whisper-small) locally and offline, so the transcript is produced
//   once at upload time instead of on every alert. Deliberately on CPU: the GPU
//   is the scarce resource on this box -- it holds a resident OmniVoice, and
//   running Whisper beside it is what produced the CUDA errors above.
//
// USAGE
//   npm run voice:transcribe -- <file.mp3> [more.mp3 ...]
//
// WHY PYTHON AND NOT NODE
//   The model lives in VoiceStudio's venv, which already has transformers and
//   torch installed. Adding a Node port of transformers to this project would
//   mean a second copy of the same weights and a large new dependency for a
//   one-off task.
//
// READ THE OUTPUT AGAINST THE AUDIO BEFORE USING IT. Automatic transcription of
// a non-English clip is often wrong in detail, and a wrong transcript degrades
// the clone's fidelity -- which is worse than the slow path it replaces.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: npm run voice:transcribe -- <file.mp3> [...]");
  process.exit(1);
}
for (const file of files) {
  if (!existsSync(file)) {
    console.error(`not found: ${file}`);
    process.exit(1);
  }
}

const VOICESTUDIO_PYTHON = "D:\\VoiceStudio\\.venv\\Scripts\\python.exe";
if (!existsSync(VOICESTUDIO_PYTHON)) {
  console.error(
    `VoiceStudio's python was not found at ${VOICESTUDIO_PYTHON}.\n` +
      "This script borrows its transformers + torch install on purpose; point at\n" +
      "a venv that has them, or run the transcription inside VoiceStudio itself.",
  );
  process.exit(1);
}

// The snapshot directory, resolved from the cache so the exact revision already
// on disk is used and nothing is downloaded.
const SNAPSHOT_ROOT =
  process.env.WHISPER_SNAPSHOT ??
  "D:\\hf-cache\\hub\\models--openai--whisper-small\\snapshots\\973afd24965f72e36ca33b3055d56a652f456b4d";

if (!existsSync(SNAPSHOT_ROOT)) {
  console.error(
    `whisper-small snapshot not found at ${SNAPSHOT_ROOT}.\n` +
      "Set WHISPER_SNAPSHOT to a snapshot directory, or pre-place the model with\n" +
      'snapshot_download("openai/whisper-small").',
  );
  process.exit(1);
}

const SCRIPT = `
import sys, json, warnings
warnings.filterwarnings("ignore")

# CPU, explicitly. The GPU on this box holds a resident OmniVoice model and a
# second resident model is what made the provider's own ASR path fail.
import torch
torch.cuda.is_available = lambda: False

import torchaudio
from transformers import pipeline

model_dir = sys.argv[1]
asr = pipeline(
    "automatic-speech-recognition",
    model=model_dir,
    device="cpu",
    # Khmer is not a first-class Whisper language for this size; letting it
    # auto-detect is more reliable than forcing "khm".
    generate_kwargs={"task": "transcribe"},
)

results = []
for path in sys.argv[2:]:
    wav, rate = torchaudio.load(path)
    wav = wav.mean(dim=0, keepdim=True)
    wav = torchaudio.functional.resample(wav, rate, 16000)
    out = asr({"raw": wav.squeeze(0).numpy(), "sampling_rate": 16000})
    results.append({"path": path, "text": out["text"].strip()})
print("__JSON__" + json.dumps(results, ensure_ascii=False))
`;

for (const file of files) {
  process.stdout.write(`\n=== ${file} ===\n`);
  const work = mkdtempSync(join(tmpdir(), "streamkit-tr-"));
  const scriptPath = join(work, "tr.py");
  try {
    // Written with an explicit no-BOM writer: PowerShell here defaults to UTF-8
    // WITH a BOM, which Python reads as part of the first line.
    const { writeFileSync } = await import("node:fs");
    writeFileSync(scriptPath, SCRIPT, { encoding: "utf8" });
    const out = execFileSync(VOICESTUDIO_PYTHON, [scriptPath, SNAPSHOT_ROOT, file], {
      encoding: "utf8",
      maxBuffer: 1 << 26,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const marker = out.indexOf("__JSON__");
    if (marker < 0) {
      console.error("no result:\n" + out);
      continue;
    }
    const rows = JSON.parse(out.slice(marker + "__JSON__".length));
    for (const row of rows) console.log(row.text);
  } catch (error) {
    console.error(`failed: ${error.stderr ?? error.message}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

console.error(
  "\nRead each transcript against its audio before using it.\n" +
    "Clip must be 3-15s of clean single-speaker speech.",
);