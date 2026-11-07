# Video → 3D converter

Turns an ordinary 2D video into a stereoscopic 3D video, keeping the original audio.

## How it works
1. **Depth estimation** per frame with [Depth Anything V2](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf)
   (falls back to a fast heuristic if PyTorch/transformers aren't installed).
2. **Temporal smoothing** of depth to prevent flicker, reset on scene cuts.
3. **Stereo rendering**: pixels are shifted left/right in proportion to depth to make a left-eye and right-eye view.
4. **Packing** into the 3D format(s) you choose.

| `--format` | Output | Watch on |
|---|---|---|
| `sbs` | Full side-by-side (2× width) | VR headsets (Quest, Vision Pro), YouTube VR/3D |
| `hsbs` | Half side-by-side (original width) | 3D TVs and projectors |
| `anaglyph` | Red/cyan | Any screen + red/cyan glasses |
| `depth` | Colour depth-map preview | Checking the depth quality |

## Usage
```bash
ffmpeg -version            # ffmpeg must be installed
pip install -r requirements.txt

# Get the source video (or use any local .mp4)
yt-dlp -f "bv*+ba/b" --merge-output-format mp4 -o source.mp4 "https://www.youtube.com/watch?v=Qo02HEH_4gU"

python convert_to_3d.py source.mp4 -o output --format sbs anaglyph
```

Useful options:
- `--depth ai|heuristic|auto` – force the depth method (default `auto`).
- `--model depth-anything/Depth-Anything-V2-Large-hf` – higher quality, slower.
- `--strength 0.03` – 3D intensity (max disparity as a fraction of width; 0.02–0.05 is comfortable).
- `--convergence 0.4` – which depth sits on the screen plane; higher = more things behind the screen.
- `--max-frames 150` – quick preview of the first N frames.

A GPU is strongly recommended for AI depth (roughly 20–60 fps on GPU, ~1–3 fps on CPU for the Small model).
