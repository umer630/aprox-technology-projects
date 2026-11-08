"""Ab Travel Splash EP1 — audio track banata hai:
Urdu voice-over (Meta MMS-TTS urd-script_arabic), har kirdar ki alag pitch (rubberband),
background ambience, sound effects, aur halki background music. Output: 48 kHz stereo WAV.
Usage: python make_audio.py timeline.json out.wav cache_dir
"""
import json, os, sys, hashlib, subprocess
import numpy as np
import scipy.io.wavfile as wavfile
from scipy.signal import resample_poly, butter, lfilter

SR = 48000
timeline, OUT, CACHE = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(CACHE, exist_ok=True)
T = json.load(open(timeline))
total = max(s['t1'] for s in T['seqs'])
N = int(total * SR) + SR
mix = np.zeros((N, 2), np.float32)
rng = np.random.default_rng(7)

# --------------- VOICES ---------------
VOICE = {  # pitch factor, gain, pan, extra ffmpeg filter
    'Umer': (1.0, 1.0, 0.0, ''), 'Ammi': (1.24, 0.95, -0.1, ''), 'Driver': (0.88, 0.95, 0.1, ''),
    'Guard': (0.85, 0.95, 0.15, ''), 'Mechanic': (0.87, 0.95, 0.1, ''), 'Agent': (1.1, 0.9, 0.1, ''),
    'Staff': (1.07, 0.9, 0.1, ''), 'Bilal': (0.94, 0.95, -0.15, ''), 'Hamza': (1.05, 0.95, 0.15, ''),
    'Officer': (0.84, 0.95, 0.15, ''), 'Checker': (0.9, 0.95, 0.12, ''), 'GateAgent': (1.22, 0.9, 0.1, ''),
    'Crew': (1.25, 0.9, 0.12, ''), 'CrewM': (1.02, 0.9, 0.12, ''), 'Pilot': (0.86, 0.9, 0.0, ',highpass=f=250,lowpass=f=4200'),
    'Reception': (1.06, 0.9, 0.1, ''), 'Passenger': (0.95, 0.85, -0.12, ''),
    'Announcement': (1.12, 0.8, 0.0, ',highpass=f=300,lowpass=f=3800,aecho=0.8:0.7:120|260:0.35|0.2'),
}
model = tok = None
def tts(text):
    global model, tok
    h = hashlib.md5(text.encode()).hexdigest()[:16]; f = os.path.join(CACHE, h + '.wav')
    if not os.path.exists(f):
        if model is None:
            import torch
            from transformers import VitsModel, AutoTokenizer
            model = VitsModel.from_pretrained('facebook/mms-tts-urd-script_arabic'); tok = AutoTokenizer.from_pretrained('facebook/mms-tts-urd-script_arabic')
            torch.manual_seed(1)
        import torch
        with torch.no_grad(): wv = model(**tok(text, return_tensors='pt')).waveform[0].numpy()
        wavfile.write(f, model.config.sampling_rate, wv.astype(np.float32))
    return f

def ffproc(src, filt):
    h = hashlib.md5((src + filt).encode()).hexdigest()[:16]; dst = os.path.join(CACHE, 'p_' + h + '.wav')
    if not os.path.exists(dst):
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', filt, '-ar', str(SR), '-ac', '1', dst], check=True)
    sr, d = wavfile.read(dst); return d.astype(np.float32) / (32768.0 if d.dtype == np.int16 else 1.0)

def place(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR); sig = sig[: max(0, N - i)]
    l, r = gain * (1 - max(0, pan)), gain * (1 + min(0, pan))
    mix[i:i + len(sig), 0] += sig * l; mix[i:i + len(sig), 1] += sig * r

subs = sorted(T['subs'], key=lambda s: s['t0'])
seq_at = lambda t: next((s for s in T['seqs'] if s['t0'] <= t < s['t1']), T['seqs'][-1])
voice_spans = []
for k, s in enumerate(subs):
    src = tts(s['urdu'])
    sr0, raw = wavfile.read(src); dur = len(raw) / sr0
    nxt = subs[k + 1]['t0'] if k + 1 < len(subs) else total
    seq = seq_at(s['t0']); avail = min(nxt, seq['t1']) - s['t0'] - 0.08
    tempo = min(1.45, max(1.0, dur / max(0.3, avail)))
    p, g, pan, extra = VOICE.get(s['who'], (1.0, 1.0, 0.0, ''))
    filt = f'rubberband=pitch={p}:tempo={tempo:.3f},loudnorm=I=-18:TP=-2:LRA=7' + extra
    if s['who'] == 'Driver' and seq['id'] == 'H':  # phone par awaaz
        filt += ',highpass=f=400,lowpass=f=3200'
    sig = ffproc(src, filt)
    place(sig, s['t0'], g, pan)
    voice_spans.append((s['t0'], s['t0'] + len(sig) / SR))
print('voices', len(subs))

# --------------- AMBIENCE ---------------
def noise(n, color='pink'):
    w = rng.standard_normal(n).astype(np.float32)
    if color == 'brown': w = np.cumsum(w); w -= np.convolve(w, np.ones(4801) / 4801, 'same'); w /= (np.abs(w).max() + 1e-9)
    elif color == 'pink':
        b, a = butter(1, 800 / (SR / 2)); w = lfilter(b, a, w)
    return w / (np.abs(w).max() + 1e-9)
def band(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band'); return lfilter(b, a, x).astype(np.float32)
def tone(f, d, amp=0.3, env=True):
    t = np.arange(int(d * SR)) / SR; s = amp * np.sin(2 * np.pi * f * t)
    if env: s *= np.minimum(1, t / 0.01) * np.exp(-t * 3)
    return s.astype(np.float32)

for sq in T['seqs']:
    a, b = sq['t0'], sq['t1']; n = int((b - a) * SR); kind = sq['ambience']
    if kind == 'room': bed = band(noise(n, 'pink'), 80, 600) * 0.025
    elif kind == 'street':
        bed = band(noise(n, 'brown'), 40, 900) * 0.11 + band(noise(n, 'pink'), 500, 3000) * 0.02
        for _ in range(int((b - a) / 6)):  # door se horn
            t0 = rng.uniform(0, max(0.1, b - a - 1)); f = rng.choice([392, 440, 523]); i = int(t0 * SR)
            h = (np.sign(np.sin(2 * np.pi * f * np.arange(int(0.35 * SR)) / SR)) * 0.015).astype(np.float32); bed[i:i + len(h)] += h[: len(bed) - i]
    elif kind == 'workshop':
        bed = band(noise(n, 'brown'), 40, 700) * 0.07
        for _ in range(int((b - a) * 1.2)):
            t0 = rng.uniform(0, b - a - 0.2); i = int(t0 * SR); c = (band(noise(int(0.08 * SR), 'white'), 2500, 7000) * 0.06 * np.exp(-np.arange(int(0.08 * SR)) / 600)).astype(np.float32); bed[i:i + len(c)] += c[: len(bed) - i]
    elif kind == 'hall': bed = band(noise(n, 'pink'), 120, 2500) * 0.035
    elif kind == 'jet': bed = band(noise(n, 'brown'), 30, 1500) * 0.16 + band(noise(n, 'pink'), 1500, 6000) * 0.03
    elif kind == 'cabin': bed = band(noise(n, 'brown'), 30, 400) * 0.12
    else: bed = band(noise(n, 'pink'), 200, 4000) * 0.015
    fade = np.minimum(1, np.minimum(np.arange(n) / (0.4 * SR), (n - np.arange(n)) / (0.4 * SR))).astype(np.float32)
    place((bed * fade).astype(np.float32), a, 1.0, 0.0)
print('ambience done')

# --------------- SFX ---------------
def sfx(name):
    if name == 'alarm': return np.concatenate([np.concatenate([tone(1800, 0.12, 0.25, False), np.zeros(int(0.08 * SR), np.float32)]) for _ in range(14)])
    if name == 'horn': h = np.sign(np.sin(2 * np.pi * 420 * np.arange(int(0.5 * SR)) / SR)).astype(np.float32) * 0.12; return np.concatenate([h, np.zeros(int(0.15 * SR), np.float32), h])
    if name == 'chime': return tone(784, 0.9, 0.25) + np.concatenate([np.zeros(int(0.3 * SR), np.float32), tone(659, 0.6, 0.25)])[: int(0.9 * SR)]
    if name in ('door', 'hood', 'gate', 'barrier', 'belt'): x = band(noise(int(0.25 * SR), 'brown'), 60, 900) * 0.4 * np.exp(-np.arange(int(0.25 * SR)) / 2500); return x.astype(np.float32)
    if name == 'hiss': n = int(6 * SR); return (band(noise(n, 'white'), 2000, 8000) * 0.07 * np.minimum(1, np.arange(n) / SR)).astype(np.float32)
    if name == 'engine': n = int(4 * SR); t = np.arange(n) / SR; f = 45 + 25 * np.minimum(1, t / 2); return (0.08 * np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-t / 3)).astype(np.float32)
    if name == 'train': n = int(9 * SR); x = band(noise(n, 'brown'), 40, 600) * 0.25; t = np.arange(n) / SR; x *= np.sin(np.pi * t / 9) ** 2; cl = (np.sin(2 * np.pi * 3.2 * t) > 0.97).astype(np.float32) * 0.15; return (x + band(cl, 300, 3000)).astype(np.float32)
    if name == 'metro': n = int(6 * SR); t = np.arange(n) / SR; return (band(noise(n, 'brown'), 40, 500) * 0.15 * np.sin(np.pi * t / 6) ** 2).astype(np.float32)
    if name == 'wrench': return np.concatenate([band(noise(int(0.05 * SR), 'white'), 3000, 8000) * 0.12 for _ in range(1)] + [np.zeros(int(0.2 * SR), np.float32)] * 1).astype(np.float32)
    if name in ('jet_taxi', 'jet_approach'): n = int(5 * SR); return (band(noise(n, 'pink'), 800, 5000) * 0.06).astype(np.float32)
    if name == 'jet_roar': n = int(12 * SR); t = np.arange(n) / SR; return (band(noise(n, 'brown'), 30, 2500) * 0.35 * np.minimum(1, t / 3)).astype(np.float32)
    if name == 'touchdown': return (band(noise(int(0.7 * SR), 'white'), 500, 6000) * 0.25 * np.exp(-np.arange(int(0.7 * SR)) / 9000)).astype(np.float32)
    if name == 'birds':
        out = np.zeros(int(18 * SR), np.float32)
        for _ in range(26):
            i = int(rng.uniform(0, 17) * SR); d = int(0.12 * SR); t = np.arange(d) / SR; f = rng.uniform(2800, 4200) + 900 * np.sin(2 * np.pi * 18 * t)
            out[i:i + d] += (0.05 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / 0.12)).astype(np.float32)
        return out
    if name == 'beep': return tone(1320, 0.35, 0.18)
    if name == 'ding': return tone(1046, 0.6, 0.2)
    if name == 'music_sting': return np.zeros(1, np.float32)
    return np.zeros(1, np.float32)
for e in T['sfx']: place(sfx(e['name']), e['t'], 1.0, 0.0)
print('sfx done')

# --------------- MUSIC (halki, voice ke waqt duck) ---------------
t = np.arange(N) / SR
chords = [[220.0, 277.18, 329.63], [196.0, 246.94, 293.66], [174.61, 220.0, 261.63], [196.0, 246.94, 329.63]]
music = np.zeros(N, np.float32); bar = 4.0
for k in range(int(total / bar) + 1):
    i0, i1 = int(k * bar * SR), min(N, int((k + 1) * bar * SR)); tt = t[i0:i1] - k * bar
    env = np.minimum(1, tt / 0.8) * np.minimum(1, (bar - tt) / 0.8)
    for f in chords[k % 4]: music[i0:i1] += (0.022 * np.sin(2 * np.pi * f * t[i0:i1]) * env).astype(np.float32)
    for j in range(8):  # pluck arpeggio
        f = chords[k % 4][j % 3] * 2; s0 = i0 + int(j * bar / 8 * SR); d = int(0.45 * SR)
        if s0 + d < N: music[s0:s0 + d] += tone(f, 0.45, 0.02)
duck = np.ones(N, np.float32)
for a, b in voice_spans: duck[int(a * SR):int(b * SR)] = 0.35
duck = np.convolve(duck, np.ones(4800) / 4800, 'same').astype(np.float32)
mix[:, 0] += music * duck; mix[:, 1] += music * duck
# intro + outro par music zyada
for a, b, g in [(0, 5.5, 3.0), (total - 5, total, 2.5)]:
    i0, i1 = int(a * SR), int(b * SR); mix[i0:i1, 0] += music[i0:i1] * (g - 1); mix[i0:i1, 1] += music[i0:i1] * (g - 1)

peak = np.abs(mix).max(); mix = mix / max(peak, 1e-6) * 0.89
wavfile.write(OUT, SR, (mix * 32767).astype(np.int16))
print('wrote', OUT, f'{total:.1f}s')
