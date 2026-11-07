# Ab Travel Splash — Episode 1: Karachi se Islamabad (3D production)

Yeh poora episode **Three.js + Node.js** se banaya gaya hai. Har scene 3D mein model, light, animate aur render hota hai.
Koi bhi supplied reference photo video frame mein paste nahi ki gayi. Photos sirf geometry, rang, proportion aur atmosphere samajhne ke liye use hui hain.

## Output (`renders/`)
| File | Kya hai |
|---|---|
| `AbTravelSplash_EP1_Karachi_to_Islamabad_1080p24.mp4` | Final episode, 1920×1080, 24 fps, H.264, Roman Urdu subtitles burned-in |
| `AbTravelSplash_EP1_thumbnail_1280x720.jpg` / `_1920.jpg` | YouTube thumbnail (3D render + title) |
| `AbTravelSplash_EP1_RomanUrdu.srt` | Alag subtitle file (Roman Urdu) |
| `AbTravelSplash_EP1_RomanUrdu_shots.csv` | Render shuda shots ki list (timecodes ke saath) |

## Pipeline
```
web/lib/character.js   Rigged 3D character (Umer, driver, staff) — walk cycle stride-matched (feet slide nahi karte)
web/lib/props.js       Vlog camera (right haath mein locked), suitcase (handle TOP, wheels BOTTOM), boarding pass
web/lib/vehicles.js    Revo-style double cab (RHD, driver RIGHT seat), cars, rickshaw, bikes, LEFT-hand traffic manager
web/lib/aircraft.js    A320-family aircraft (Airblue-style livery), gear, pitch around main gear
web/lib/env.js         Ghar + gate, Karachi road, Jinnah terminal, check-in hall, runway, clouds, Margalla Hills, Faisal Masjid
web/seq*.js            Sequences + shots + camera + Roman Urdu dialogue
render.js              Headless Chromium → frames → ffmpeg
```

## Render commands
```bash
npm install
./render_all.sh                                   # saare sequences (3 parallel workers)
./concat.sh                                       # final MP4
node render.js --seqs A --stills 2,7.5,10.5       # QA stills
node render.js --seqs E --thumb 19.5 --w 1280 --h 720 --out renders/thumb.jpg
node render.js --seqs I,A,B,C,K,D,F,L,E --srt renders/ep1.srt
```

## Sequences (29 shots, ~2:29)
I Intro drone + title · A Ghar: gate khulta hai, Umer camera + suitcase ke saath bahar, selfie, driver salaam, bag Revo ke bed mein, Revo LEFT lane mein ·
B Karachi shahrah (aerial, side tracking, car ke andar selfie) · C Jinnah International drop-off, driver Allah Hafiz ·
K Check-in (bag belt par, boarding pass haath-se-haath) + security (camera tray mein → x-ray → wapas haath mein) ·
D Taxi → takeoff roll → rotation → climb · F Cruise exterior, window POV (wing + baadal), seat selfie ·
L Islamabad landing (Margalla peeche, touchdown smoke) · E Islamabad avenue → Faisal Masjid → selfie outro → end card

## Identity lock
`LOOKS.umer` (`web/lib/character.js`) Umer ka single locked profile hai. Har sequence `lib/cast.js` se yahi model banata hai.
Is session mein Umer ki apni photo attach nahi thi. Isliye face/hair/beard abhi generic Pakistani male hain.
Photo milne par sirf `LOOKS.umer` update karke poora episode dobara render ho jata hai.
