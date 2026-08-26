#!/usr/bin/env python3
"""Baixa o campo GFS de temperatura a 2 m válido para o horário atual.

Fonte primária: NOAA/NCEP NOMADS, GFS 0.25°. O JSON publicado é reduzido para
1° para permitir leitura e interpolação no navegador; a textura do globo usa a
grade nativa antes da redução. Em caso de indisponibilidade, os artefatos já
publicados são preservados e o coletor JavaScript mantém sua contingência.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data" / "temperature.json"
TEXTURE_FILE = ROOT / "data" / "temperature-globe.webp"
EARTH_FILE = ROOT / "assets" / "earth-night.jpg"
NOMADS = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"


def iso_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def previous_metadata() -> dict:
    try:
        return json.loads(DATA_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def candidate_runs(now: datetime):
    latest = now.replace(minute=0, second=0, microsecond=0)
    latest -= timedelta(hours=latest.hour % 6)
    for offset in range(0, 25, 6):
        yield latest - timedelta(hours=offset)


def gfs_url(run: datetime, forecast_hour: int) -> str:
    cycle = run.strftime("%H")
    query = {
        "file": f"gfs.t{cycle}z.pgrb2.0p25.f{forecast_hour:03d}",
        "lev_2_m_above_ground": "on",
        "var_TMP": "on",
        "subregion": "",
        "leftlon": "0",
        "rightlon": "360",
        "toplat": "90",
        "bottomlat": "-90",
        "dir": f"/gfs.{run:%Y%m%d}/{cycle}/atmos",
    }
    return f"{NOMADS}?{urllib.parse.urlencode(query)}"


def download_latest(previous: dict) -> tuple[Path, datetime, int] | None:
    current_run = str(previous.get("modelRun") or "")
    current_forecast_hour = int(previous.get("forecastHour") or 0)
    now = datetime.now(timezone.utc)
    for run in candidate_runs(now):
        run_iso = iso_utc(run)
        forecast_hour = min(120, max(0, int((now - run).total_seconds() // 3600)))
        # Só paramos no ciclo já publicado depois de testar todos os mais novos.
        if run_iso == current_run and forecast_hour == current_forecast_hour and TEXTURE_FILE.exists():
            print(f"temperatura: rodada {run_iso} f{forecast_hour:03d} já publicada")
            return None
        request = urllib.request.Request(
            gfs_url(run, forecast_hour),
            headers={"User-Agent": "SeuMundoMonitor/4.0 (GitHub Actions; public-data visualization)"},
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                payload = response.read()
            if len(payload) < 10_000 or not payload.startswith(b"GRIB"):
                continue
            handle = tempfile.NamedTemporaryFile(prefix="gfs-t2m-", suffix=".grib2", delete=False)
            handle.write(payload)
            handle.close()
            return Path(handle.name), run, forecast_hour
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            continue
    return None


def colorize(values):
    import numpy as np

    stops = np.array([-55, -35, -20, -5, 10, 20, 30, 40, 55], dtype=np.float32)
    colors = np.array([
        [68, 45, 180], [78, 91, 232], [64, 153, 238], [70, 205, 225],
        [75, 207, 166], [187, 218, 78], [255, 190, 66], [255, 103, 61],
        [205, 36, 75],
    ], dtype=np.float32)
    clipped = np.clip(values, stops[0], stops[-1])
    channels = [np.interp(clipped, stops, colors[:, channel]) for channel in range(3)]
    return np.stack(channels, axis=-1).astype(np.uint8)


def render_temperature(grib_path: Path, run: datetime, forecast_hour: int) -> dict:
    import numpy as np
    import pygrib
    from PIL import Image

    with pygrib.open(str(grib_path)) as messages:
        selected = [message for message in messages if message.shortName in {"2t", "t2m"}]
        if not selected:
            raise RuntimeError("GRIB sem temperatura a 2 m")
        message = selected[0]
        native = np.ma.filled(message.values, np.nan).astype(np.float32)
        latitudes_native, longitudes_native = message.latlons()
        valid_date = message.validDate.replace(tzinfo=timezone.utc) if message.validDate.tzinfo is None else message.validDate

    if float(np.nanmedian(native)) > 100:
        native -= 273.15
    if native.ndim != 2 or native.shape[0] < 700 or native.shape[1] < 1400:
        raise RuntimeError(f"grade GFS inesperada: {native.shape}")

    # O GFS chega de 0..360°. A textura precisa de -180..180° e norte no topo.
    north_to_south = latitudes_native[0, 0] > latitudes_native[-1, 0]
    texture_rows = native if north_to_south else native[::-1]
    half = native.shape[1] // 2
    equirectangular = np.concatenate((texture_rows[:, half:], texture_rows[:, :half]), axis=1)
    thermal = Image.fromarray(colorize(equirectangular), mode="RGB")
    if EARTH_FILE.exists():
        earth = Image.open(EARTH_FILE).convert("RGB")
        thermal = thermal.resize(earth.size, Image.Resampling.BICUBIC)
        globe_texture = Image.blend(earth, thermal, 0.64)
    else:
        globe_texture = thermal.resize((2048, 1024), Image.Resampling.BICUBIC)
    TEXTURE_FILE.parent.mkdir(parents=True, exist_ok=True)
    globe_texture.save(TEXTURE_FILE, "WEBP", quality=84, method=6)

    # Grade de leitura do navegador: 1° (181 x 360), derivada da grade 0,25°.
    latitudes = list(range(-90, 91))
    longitudes = list(range(-180, 180))
    sampled = []
    latitude_start = float(latitudes_native[0, 0])
    latitude_step = float(latitudes_native[1, 0] - latitudes_native[0, 0])
    longitude_start = float(longitudes_native[0, 0])
    longitude_step = float(longitudes_native[0, 1] - longitudes_native[0, 0])
    for latitude in latitudes:
        row = min(native.shape[0] - 1, max(0, round((latitude - latitude_start) / latitude_step)))
        for longitude in longitudes:
            column = min(native.shape[1] - 1, max(0, round(((longitude % 360) - longitude_start) / longitude_step)))
            value = float(native[row, column])
            sampled.append(round(value, 1) if np.isfinite(value) else None)
    valid = [value for value in sampled if value is not None]
    generated = datetime.now(timezone.utc)
    return {
        "source": "NOAA/NCEP GFS via NOMADS",
        "provider": "NOAA NOMADS",
        "model": "GFS 0.25°",
        "variable": "temperature_2m",
        "unit": "°C",
        "kind": "model_estimate",
        "generatedAt": iso_utc(generated),
        "observedAt": iso_utc(valid_date),
        "modelRun": iso_utc(run),
        "forecastHour": forecast_hour,
        "nativeResolution": 0.25,
        "displayResolution": 1,
        "step": 1,
        "latMin": -90,
        "latMax": 90,
        "lonMin": -180,
        "lonMax": 179,
        "rows": 181,
        "columns": 360,
        "values": sampled,
        "min": round(min(valid), 1),
        "max": round(max(valid), 1),
        "texture": "data/temperature-globe.webp",
        "textureFormat": "equirectangular",
        "methodology": "Estimativa do modelo NOAA GFS; não é medição direta por termômetros.",
    }


def main() -> int:
    previous = previous_metadata()
    downloaded = download_latest(previous)
    if downloaded is None:
        if previous:
            return 0
        print("temperatura: NOAA indisponível; o coletor usará a contingência Open-Meteo", file=sys.stderr)
        return 0
    path, run, forecast_hour = downloaded
    try:
        metadata = render_temperature(path, run, forecast_hour)
        DATA_FILE.write_text(json.dumps(metadata, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"temperatura: GFS {metadata['modelRun']} · {metadata['rows']}x{metadata['columns']} · textura {TEXTURE_FILE.stat().st_size // 1024} KiB")
        return 0
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
