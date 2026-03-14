# -*- mode: python ; coding: utf-8 -*-

import os

project_dir = os.path.abspath(".")

datas = []

for root, dirs, files in os.walk(project_dir):
    for file in files:
        if file.endswith((".html", ".js", ".css", ".wav", ".png", ".jpg", ".svg")):
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(root, project_dir)
            datas.append((full_path, rel_path))


a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='prometheus-client',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='prometheus.ico',
)
