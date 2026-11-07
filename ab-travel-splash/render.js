// Headless render: Three.js scene → JPEG frames → ffmpeg (H.264, 24 fps)
// Usage:
//   node render.js --seqs A --out renders/_parts/A.mp4 [--samples 2] [--w 1920 --h 1080]
//   node render.js --seqs A --stills 2,6.5,10 --outdir renders/_qa
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const { start } = require('./server');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const W = +(args.w || 1920), H = +(args.h || 1080);
const seqs = String(args.seqs || 'A').split(',');
const samples = +(args.samples || 1);

(async () => {
  const srv = await start(0); const port = srv.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text().slice(0, 300)); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.SPLASH_READY === true, null, { timeout: 60000 });
  const meta = await page.evaluate(([w, h, s]) => window.SPLASH.init({ width: w, height: h, seqs: s }), [W, H, seqs]);
  console.log(`seqs=${seqs} duration=${meta.duration.toFixed(2)}s frames=${meta.frames} shots=${meta.shots.length}`);

  if (args.info) { console.log('FRAMES', meta.frames); }
  else if (args.json) { fs.writeFileSync(args.json, JSON.stringify(await page.evaluate(() => window.SPLASH.subtitles()), null, 1)); console.log('wrote', args.json); }
  else if (args.srt) {
    const { subs, shots } = await page.evaluate(() => window.SPLASH.subtitles());
    const ts = (x) => { const ms = Math.round(x * 1000); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
    fs.writeFileSync(args.srt, subs.map((s, i) => `${i + 1}\n${ts(s.t0)} --> ${ts(s.t1)}\n${s.who}: ${s.text}\n`).join('\n'));
    fs.writeFileSync(args.srt.replace(/\.srt$/, '_shots.csv'), 'shot_id,sequence,start_s,end_s,description\n' + shots.map(s => `${s.id},${s.seq},${s.t0.toFixed(2)},${s.t1.toFixed(2)},"${s.desc.replace(/"/g, "'")}"`).join('\n') + '\n');
    console.log('wrote', args.srt);
  } else if (args.thumb) {
    const url = await page.evaluate((t) => window.SPLASH.renderThumb(t), parseFloat(args.thumb));
    const out = args.out || 'renders/thumbnail.jpg'; fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64')); console.log('wrote', out);
  } else if (args.stills) {
    const outdir = args.outdir || 'renders/_qa'; fs.mkdirSync(outdir, { recursive: true });
    for (const ts of String(args.stills).split(',')) {
      const f = Math.round(parseFloat(ts) * 24);
      const t0 = Date.now();
      const url = await page.evaluate(([f, s]) => window.SPLASH.renderFrame(f, { samples: s }), [f, samples]);
      const loc = await page.evaluate((t) => window.SPLASH.locate(t), f / 24);
      const file = path.join(outdir, `${seqs.join('')}_${String(ts).replace('.', '_')}_${loc.shot}.jpg`);
      fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      console.log('still', file, (Date.now() - t0) + 'ms');
    }
  } else {
    const out = args.out || `renders/_parts/${seqs.join('')}.mp4`; fs.mkdirSync(path.dirname(out), { recursive: true });
    const from = +(args.from || 0), to = +(args.to || meta.frames);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', '24', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', String(args.crf || 19), '-pix_fmt', 'yuv420p', '-r', '24', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let f = from; f < to; f++) {
      const url = await page.evaluate(([f, s]) => window.SPLASH.renderFrame(f, { samples: s }), [f, samples]);
      const buf = Buffer.from(url.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (f % 24 === 0) { const el = (Date.now() - t0) / 1000; console.log(`frame ${f}/${to}  ${(el / (f - from + 1)).toFixed(2)}s/frame  eta ${((to - f) * el / (f - from + 1) / 60).toFixed(1)}min`); }
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
    console.log('wrote', out);
  }
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
