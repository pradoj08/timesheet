# YardMate Agent

YardMate Agent is the local desktop companion for the Pearl.io workbook. The same Electron source supports Windows and macOS.

## Local development

From this directory:

```text
npm install
npm run check
npm start
```

Keep the desktop agent running on the same computer as the workbook. Pearl.io connects to it at `http://127.0.0.1:43127`; loopback connections do not cross between computers.

## Build installers

Windows:

```text
npm run dist:win
```

This produces an NSIS installer.
The build emits installers for standard Windows x64 and Windows ARM64.

macOS:

```text
npm run dist:mac
```

This produces DMG and ZIP artifacts for Apple Silicon (`arm64`) and Intel (`x64`). Unsigned local builds may require Control-clicking the app and choosing **Open** the first time. Public distribution should use an Apple Developer ID and notarization.

Generated installers are written to `release/` and should not be committed.
