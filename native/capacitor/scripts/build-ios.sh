#!/bin/bash
set -euo pipefail
hub_native_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$hub_native_root"
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Xcode builds require the connected Mac. The project and web export can be checked separately here."
  exit 2
fi
command -v xcodebuild >/dev/null || { echo "Open Xcode on the Mac and finish its first-run setup."; exit 2; }
command -v xcrun >/dev/null
npm ci --ignore-scripts --no-audit --no-fund
npm run sync
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme TheHub
hub_build_mode="${1:-simulator}"
case "$hub_build_mode" in
  simulator)
    hub_simulator_id="$(xcrun simctl list devices available -j | python3 -c 'import json,sys;d=json.load(sys.stdin)["devices"];v=[x for k in sorted(d,reverse=True) for x in d[k] if x.get("isAvailable") and "iPhone" in x.get("name","")];v.sort(key=lambda x:x.get("state")!="Booted");print(v[0]["udid"] if v else "")')"
    [[ -n "$hub_simulator_id" ]] || { echo "Install an iPhone Simulator runtime in Xcode Settings → Components."; exit 2; }
    xcrun simctl boot "$hub_simulator_id" 2>/dev/null || true
    open -a Simulator
    xcrun simctl bootstatus "$hub_simulator_id" -b
    xcodebuild -project ios/App/App.xcodeproj -scheme TheHub -configuration Debug -destination "id=$hub_simulator_id" -derivedDataPath build/simulator CODE_SIGNING_ALLOWED=NO build
    xcrun simctl install "$hub_simulator_id" "build/simulator/Build/Products/Debug-iphonesimulator/The Hub.app"
    xcrun simctl launch "$hub_simulator_id" com.thomasonchildcaresolutions.thehub
    echo "Simulator launched. Complete the login, Parent Portal, public-page, and disposable-account deletion checks before archiving."
    ;;
  archive)
    # An archive with packaged UI needs the matching API CORS release first.
    hub_cors_header="$(curl -fsSI -X OPTIONS -H 'Origin: capacitor://localhost' https://tcs-operations-hub.vercel.app/api/auth/profile | tr -d '\r')"
    if ! echo "$hub_cors_header" | grep -qi '^access-control-allow-origin: capacitor://localhost$'; then
      echo "Publish the tested Hub web/API changes before creating a distribution archive."
      exit 2
    fi
    mkdir -p artifacts
    xcodebuild -project ios/App/App.xcodeproj -scheme TheHub -configuration Release -destination 'generic/platform=iOS' -archivePath artifacts/TheHub-1.0-build3.xcarchive -allowProvisioningUpdates archive
    echo "Archive prepared. Review its privacy report and signing in Xcode Organizer before uploading."
    ;;
  *) echo "Usage: bash scripts/build-ios.sh simulator|archive"; exit 2 ;;
esac
