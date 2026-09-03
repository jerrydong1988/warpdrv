#!/bin/bash
set -e

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) export CXXFLAGS="/std:c++20" ;;
  *)                    export CXXFLAGS="-std=c++20" ;;
esac

# Bundle format selection.
# Pass bundle formats as arguments: ./release.sh deb appimage
# Defaults to 'deb' only if no arguments given.
# AppImage is excluded by default because it takes a long time to build.
# Default bundle formats per platform (set after platform detection below).
# Pass bundle formats as arguments to override: ./release.sh deb appimage
# AppImage is excluded by default on Linux because it takes a long time to build.
#
# Non-interactive versioning (for CI):
#   RELEASE_VERSION=0.4.22 ./release.sh deb appimage
#   ./release.sh deb appimage v0.4.22        # version-like CLI arg
#   RELEASE_NOTES="..." ./release.sh deb appimage
# When stdin is not a TTY and no version is given, the current version is kept.
BUNDLE_FORMATS_ARGS=()

REPO_ROOT="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
RELEASE_JSON="$REPO_ROOT/release.json"
DESKTOP_DIR="$REPO_ROOT/packages/desktop"
SERVER_DIR="$REPO_ROOT/packages/server"
APP_DIR="$REPO_ROOT/packages/app"

# Get target triple
TARGET_TRIPLE=$(rustc --print host-tuple 2>/dev/null || rustc -Vv | grep host | cut -d' ' -f2)
echo "Target: $TARGET_TRIPLE"

# Detect platform and set platform-specific variables
case "$TARGET_TRIPLE" in
	*-windows-*)
		PLATFORM="windows"
		SIDECAR_EXT=".exe"
		;;
	*-linux-*)
		PLATFORM="linux"
		SIDECAR_EXT=""
		;;
	*-darwin-*)
		PLATFORM="macos"
		SIDECAR_EXT=""
		;;
	*)
		echo "ERROR: Unsupported platform: $TARGET_TRIPLE"
		exit 1
		;;
esac

echo "Platform: $PLATFORM"

# Resolve bundle formats now that platform is known
case "$PLATFORM" in
	windows) DEFAULT_FORMATS=("msi") ;;
	macos)   DEFAULT_FORMATS=("dmg") ;;
	linux)   DEFAULT_FORMATS=("deb") ;;
esac
# Bundle formats = non-version-like args; a leading "v" is allowed on versions
BUNDLE_FORMATS=()
for arg in "$@"; do
	case "$arg" in
		v[0-9]*|[0-9]*\.[0-9]*) ;; # version-like — handled below
		*) BUNDLE_FORMATS+=("$arg") ;;
	esac
done
if [ ${#BUNDLE_FORMATS[@]} -eq 0 ]; then
	BUNDLE_FORMATS=("${DEFAULT_FORMATS[@]}")
fi
echo "Bundle formats: ${BUNDLE_FORMATS[*]}"

# Read current version
CURRENT_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$RELEASE_JSON','utf8')).version)")
echo "Current version: $CURRENT_VERSION"

# Resolve new version: RELEASE_VERSION env > version-like CLI arg > TTY prompt > keep current
NEW_VERSION="${RELEASE_VERSION:-}"
for arg in "$@"; do
	case "$arg" in
		v[0-9]*|[0-9]*\.[0-9]*)
			if [ -z "$NEW_VERSION" ]; then NEW_VERSION="${arg#v}"; fi
			;;
	esac
done
if [ -z "$NEW_VERSION" ] && [ -t 0 ]; then
	read -p "New version (Enter to keep $CURRENT_VERSION): " NEW_VERSION
fi
if [ -z "$NEW_VERSION" ]; then
	NEW_VERSION="$CURRENT_VERSION"
fi

# Release notes: RELEASE_NOTES env, else TTY prompt, else empty
NOTES="${RELEASE_NOTES:-}"
if [ -z "$NOTES" ] && [ -t 0 ]; then
	read -p "Release notes: " NOTES
fi

# Bump versions everywhere
node -e "
const fs = require('fs');
const files = [
	['$RELEASE_JSON', (r) => { r.version = '$NEW_VERSION'; r.notes = '$NOTES'; return r; }],
	['$DESKTOP_DIR/tauri.conf.json', (r) => { r.version = '$NEW_VERSION'; return r; }],
	['$REPO_ROOT/package.json', (r) => { r.version = '$NEW_VERSION'; return r; }],
	['$REPO_ROOT/package-lock.json', (r) => { r.version = '$NEW_VERSION'; if (r.packages && r.packages['']) r.packages[''].version = '$NEW_VERSION'; return r; }],
];
for (const [path, transform] of files) {
	if (fs.existsSync(path)) {
		const data = JSON.parse(fs.readFileSync(path, 'utf8'));
		fs.writeFileSync(path, JSON.stringify(transform(data), null, '\t') + '\n');
		console.log('  Updated', path);
	}
}
"

echo ""
echo "=== Installing dependencies ==="
cd "$REPO_ROOT"
npm ci
echo "Dependencies installed"

echo ""
echo "=== Step 1/4: Building frontend ==="
cd "$APP_DIR"
npx vite build
echo "Frontend built to $APP_DIR/dist/"

echo ""
echo "=== Step 2/4: Building server binary ==="
cd "$SERVER_DIR"

# Server build is consolidated in packages/server/scripts/build.mjs:
# esbuild bundle -> @yao-pkg/pkg node24 binary -> runtime deps copy.
case "$PLATFORM" in
	windows) SERVER_PLATFORM="win32" ;;
	linux)   SERVER_PLATFORM="linux" ;;
	macos)   SERVER_PLATFORM="darwin" ;;
esac
case "$TARGET_TRIPLE" in
	aarch64*) SERVER_ARCH="arm64" ;;
	*)        SERVER_ARCH="x64" ;;
esac
node scripts/build.mjs "$SERVER_PLATFORM" "$SERVER_ARCH"

echo "Server binary: $SERVER_DIR/dist/warpcore-server"
ls -lh "$SERVER_DIR/dist/warpcore-server${SIDECAR_EXT}"

echo ""
echo "=== Step 3/4: Preparing Tauri sidecar ==="
mkdir -p "$DESKTOP_DIR/binaries"
cp "$SERVER_DIR/dist/warpcore-server${SIDECAR_EXT}" "$DESKTOP_DIR/binaries/warpcore-server-${TARGET_TRIPLE}${SIDECAR_EXT}"
cp "$SERVER_DIR/dist/better_sqlite3.node" "$DESKTOP_DIR/binaries/better_sqlite3.node"
mkdir -p "$DESKTOP_DIR/binaries/node_modules"
cp -r "$SERVER_DIR/dist/node_modules/." "$DESKTOP_DIR/binaries/node_modules/"
find "$DESKTOP_DIR/binaries/node_modules" -maxdepth 3 -type d -name "*musl*" -exec rm -r {} +
for d in "$DESKTOP_DIR"/binaries/node_modules/@img/*musl*; do
	[ -d "$d" ] && rm -r "$d"
done
if [ "$PLATFORM" != "windows" ]; then
	chmod +x "$DESKTOP_DIR/binaries/warpcore-server-${TARGET_TRIPLE}${SIDECAR_EXT}"
fi

rm -r "$DESKTOP_DIR/app-dist" 2>/dev/null || true
cp -r "$APP_DIR/dist" "$DESKTOP_DIR/app-dist"

echo "Sidecar: $DESKTOP_DIR/binaries/warpcore-server-${TARGET_TRIPLE}${SIDECAR_EXT}"
echo "Frontend: $DESKTOP_DIR/app-dist/"

echo ""
echo "=== Step 4/4: Building Tauri app ==="
cd "$DESKTOP_DIR"
if [ -d "$DESKTOP_DIR/target/release/bundle/appimage_deb" ]; then
	rm -r "$DESKTOP_DIR/target/release/bundle/appimage_deb"
fi
if [ -d "$DESKTOP_DIR/target/release/bundle/appimage" ]; then
	rm -r "$DESKTOP_DIR/target/release/bundle/appimage"
fi

# Build only the requested bundle formats
BUNDLE_ARGS=""
for fmt in "${BUNDLE_FORMATS[@]}"; do
	BUNDLE_ARGS="$BUNDLE_ARGS --bundles $fmt"
done

npx tauri build $BUNDLE_ARGS

for fmt in "${BUNDLE_FORMATS[@]}"; do
	if [ "$fmt" = "appimage" ]; then
		APPDIR="$DESKTOP_DIR/target/release/bundle/appimage/warpdrv.AppDir"
		PRISTINE="$DESKTOP_DIR/binaries/warpcore-server-${TARGET_TRIPLE}${SIDECAR_EXT}"
		if [ ! -d "$APPDIR" ]; then
			echo "ERROR: AppDir not found at $APPDIR"
			exit 1
		fi
		cp "$PRISTINE" "$APPDIR/usr/bin/warpcore-server"
		chmod +x "$APPDIR/usr/bin/warpcore-server"
		( cd "$DESKTOP_DIR/target/release/bundle/appimage" && \
			ARCH="x86_64" \
			LDAI_OUTPUT="warpdrv_${NEW_VERSION}_amd64.AppImage" \
			"$HOME/.cache/tauri/linuxdeploy-plugin-appimage.AppImage" \
			--appdir "$APPDIR" )
	fi
done

echo ""
echo "============================================"
echo "  Build complete: v$NEW_VERSION"
echo "============================================"
