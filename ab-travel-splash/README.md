# Ab Travel Splash — Episode 1: Karachi se Islamabad (3D production)

Yeh poora episode **Three.js + Node.js** se banaya gaya hai. Har scene 3D mein model, light, animate aur render hota hai.
Koi bhi supplied reference photo video frame mein paste nahi ki gayi. Photos sirf geometry, rang, proportion aur atmosphere samajhne ke liye use hui hain.

## Output (`renders/`)
| File | Kya hai |
|---|---|
| `AbTravelSplash_EP1_Karachi_to_Islamabad_11min_1080p24.mp4` | Final episode (v2): 11:29, 1920×1080, 24 fps, H.264 + AAC, Urdu voice-over, Roman Urdu subtitles burned-in |
| `AbTravelSplash_EP1_thumbnail_*.jpg` | Thumbnail |
| `AbTravelSplash_EP1_RomanUrdu.srt` | Subtitles (Roman Urdu) |
| `AbTravelSplash_EP1_timeline.json` | Har line (Roman + Urdu), sound effects aur sequences ki timing |

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

## Story (v2, 19 sequences, 83 shots, ~11.5 min)
1. **I** Intro drone + title
2. **H** Ghar: alarm 6:00 → uthna → bedroom vlog → daant brush → "Ammi! Bag nikaal dein!" → Ammi bag laati hain → almari se kapre → packing → driver ko phone → nashta (paratha, chai) → horn
3. **A** Gate, driver salaam, bag Revo mein, Ammi ki dua
4. **B** Karachi shahrah: brand banners (Aprox AI, Aprox Attendant, Aprox Technology, Next Group), laal signal + zebra crossing par log, Circular Railway train
5. **X** Revo kharab: bonnet se bhaap, hazard lights, "Main late ho raha hoon!"
6. **Y** Auto Workshop: mechanic radiator pipe badalta hai, Umer pareshan, paise, rawangi
7. **R** Tez raftar airport ki taraf
8. **J** Jinnah International entry: guard ticket + shanakhti card, mirror se gaari ki checking, barrier, **Departures upar / Arrivals neeche**
9. **C** Drop-off · **K** Check-in + security · **N** Lounge: McDonald's / Chai Khana / Karachi Biryani, doston (Bilal, Hamza) ke saath nashta, speaker par boarding announcement
10. **G** Gate + jet bridge · **D** Takeoff · **F** Cruise · **L** Islamabad landing
11. **M** Islamabad airport: baggage carousel, arrival hall, selfie
12. **Q** Airport exterior (wavy roof) → parking → **Toyota Corolla Grande 1.8** → driver door → rawangi
13. **S** Murree Road: elevated Metro Bus, malls, banners, signal + zebra, "Murree Road" sign, Margalla Hills
14. **E** Faisal Masjid (behtar structure: tent shells, beams, pencil minarets with 2 balconies, sahn, hauz, portico) → outro

## Audio
`audio/make_audio.py`: Meta MMS-TTS (`facebook/mms-tts-urd-script_arabic`) se Urdu voice. Har kirdar ki alag pitch (rubberband). Announcement mein speaker jaisa echo, phone call par telephone EQ. Saath mein ambience (ghar, sadak, workshop, hall, jahaz), sound effects (alarm, horn, bhaap, train, chime, touchdown, parinde) aur halki music, jo awaaz ke waqt dheemi ho jati hai.
```bash
python audio/make_audio.py renders/AbTravelSplash_EP1_timeline.json renders/AbTravelSplash_EP1_audio.wav /tmp/tts_cache
./render_all.sh && ./concat.sh
```

## Identity lock
`LOOKS.umer` (`web/lib/character.js`) Umer ka single locked profile hai. Har sequence `lib/cast.js` se yahi model banata hai.
Is session mein Umer ki apni photo attach nahi thi. Isliye face/hair/beard abhi generic Pakistani male hain.
Photo milne par sirf `LOOKS.umer` update karke poora episode dobara render ho jata hai.

## Reference images → 3D asset mapping
Har photo sirf reference hai. Final frame mein koi photo paste nahi hui.

| Reference images | 3D mein kya bana |
|---|---|
| Sony mirrorless camera haath mein, Flash-O-Matic | Compact black vlog camera, right haath ki grip mein locked |
| Tan canvas camera bag | Umer ka shoulder sling camera bag (leather strap, brass buckle) |
| Camera backpack (purple) | Bag design/colour reference (episode mein sling bag use hua) |
| Karachi roads, traffic, Shahrah | Dual carriageway, yellow-black kerbs, median trees, rickshaw/bike/bus traffic (LEFT-hand) |
| Toyota Hilux/Revo (black, GR, Rocco) | Black Revo-style double cab, sport bar, RHD |
| Jinnah International (front, aerial, signage) | Beige twin towers + arch recess, dark curtain wall, canopy, flag, English + Urdu sign |
| Check-in halls, Dubai/Doha/Islamabad terminals | Check-in counters, stanchions, gate lounge seating, glass wall |
| Security tray, x-ray, metal detector | Conveyor, x-ray tunnel, walk-through arch, trays |
| Jet bridge (glass, white frame, blue carpet) | Glass jet bridge + cab + drive wheels + stairs |
| Airblue A320/A321 photos | A320-family aircraft, white body, blue tail/engines, "air blue" livery |
| Cabin interiors, wing-from-window | Cabin seats, window bezels, wing + winglet + clouds POV |
| Islamabad airport interior | Arrival hall: downlight grid, white pillars, teal signage band |
| Margalla Hills, winding roads | Procedural Margalla terrain behind runway and mosque |
| Islamabad avenues, towers | Green avenue, median trees, 3-tower glass skyline |
| Faisal Masjid (exterior, sunset, aerial, interior) | Tent-shaped hall, 4 pencil minarets, crescent finial, marble courtyard |
| Pakistani crowds | Background passengers/visitors (shalwar kameez, Pakistani look) |

Indian flags wali crowd photo jaan boojh kar use nahi ki gayi, kyun ke brief mein Indian/Hindi visual identity mana hai.
