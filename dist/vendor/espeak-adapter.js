import createESpeakNG from './espeak-ng.js';
let binaryPromise;
async function bytes() {
  if (!binaryPromise) binaryPromise = fetch(new URL('./espeak-ng.wasm', import.meta.url)).then(async r => {
    if (!r.ok) throw new Error(`eSpeak WASM HTTP ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }).catch(e => { binaryPromise = null; throw e; });
  return binaryPromise;
}
async function run(args, output, options = {}) {
  const stderr = [];
  const wasmBinary = options.wasmBinary ?? await bytes();
  // C CLI getopt/global state is not reset for another callMain: one fresh instance per operation.
  const instance = await createESpeakNG({
    wasmBinary, arguments: args.slice(), noExitRuntime: true,
    ...(options.inputText === undefined ? {} : { preRun: [module => module.FS.writeFile('/input.txt', options.inputText)] }),
    print: () => {}, printErr: s => stderr.push(s),
  });
  instance._fflush(0);
  try { return instance.FS.readFile(output).slice(); }
  catch (e) { throw new Error(`eSpeak failed to create ${output}: ${stderr.join(' | ')}`, { cause: e }); }
}
export async function phonemize(text, voice, options = {}) {
  const result = await run(['-q', '-x', '--phonout', '/phon.txt', '-v', voice, text], '/phon.txt', options);
  return new TextDecoder().decode(result).trim();
}
export async function synthesizeMnemonics(code, voice, options = {}) {
  const result = await run(['-v', voice, '-s', String(options.rate ?? 145), '-w', '/audio.wav', `[[${code}]]`], '/audio.wav', options);
  if (String.fromCharCode(...result.slice(0, 4)) !== 'RIFF') throw new Error('eSpeak returned an invalid WAV');
  return result;
}

export async function phonemizeBatch(entries, voice, options = {}) {
  if (!Array.isArray(entries) || !entries.length) return [];
  if (entries.some(s => typeof s !== 'string' || !s.trim() || /[.;!?\r\n]/u.test(s))) {
    throw new Error('Batch entries must be non-empty words without sentence punctuation or newlines');
  }
  const inputText = entries.map(s => `${s}.`).join('\n') + '\n';
  const result = await run(['-b', '1', '-q', '-x', '--sep=|', '--phonout=/out.txt', '-v', voice, '-f', '/input.txt'], '/out.txt', { ...options, inputText });
  const lines = new TextDecoder().decode(result).trimEnd().split(/\r?\n/u);
  if (lines.length !== entries.length) throw new Error(`Expected ${entries.length} phoneme lines, received ${lines.length}`);
  return lines.map(s => s.trim());
}

export async function synthesizeText(text,voice,options={}){return run(['-b','1','-v',voice,'-s',String(options.rate??145),'-w','/audio.wav',text],'/audio.wav',options);}
