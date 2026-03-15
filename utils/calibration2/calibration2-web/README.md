# Calibration2 Web (Next.js / JavaScript)

This is the JavaScript/JSX browser interface for calibration workflows, located at:

`utils/calibration2/calibration2-web`

## Features

- Camera type selection: `PinHole`, `Fish Eye`, `Wide Angle`, `CCTV`
- Stage orchestration buttons:
	- intrinsic
	- ground-plane
	- z-mapping
	- cad-3d-dwg
	- extrinsic
	- sfm
	- overlay
- DWG/DXF upload endpoint with lightweight DXF 3D line preview
- SfM multi-image upload endpoint
- Job polling UI with progress and result payload

## Run

```bash
cd utils/calibration2/calibration2-web
npm install
npm run dev
```

Open http://localhost:3000

## API routes

- `POST /api/calibration/start`
- `GET /api/calibration/jobs/:id`
- `POST /api/uploads/dwg`
- `POST /api/uploads/images`

## Next integration steps

1. Replace mock job progression in `src/lib/calibration-store.js` with real worker execution.
2. Call Python calibration engine from `utils/calibration2` in stage jobs.
3. Add true DWG extraction service (DWG -> DXF or direct parser pipeline).
4. Connect SfM route to COLMAP/OpenMVG.
