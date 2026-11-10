#!/bin/bash
set -euo pipefail
hub_native_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$hub_native_root"
hub_build_mode="${1:-simulator}"
case "$hub_build_mode" in simulator|test|archive) ;; *) echo "Usage: bash scripts/build-ios.sh simulator|test|archive"; exit 2 ;; esac
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Xcode builds require the connected Mac. The project and web export can be checked separately here."
  exit 2
fi
command -v xcodebuild >/dev/null || { echo "Open Xcode on the Mac and finish its first-run setup."; exit 2; }
command -v xcrun >/dev/null
npm ci --ignore-scripts --no-audit --no-fund
npm run sync
xcodebuild -resolvePackageDependencies -project ios/App/App.xcodeproj -scheme TheHub
case "$hub_build_mode" in
  simulator|test)
    hub_simulator_id="$(xcrun simctl list devices available -j | python3 -c 'import json,sys;d=json.load(sys.stdin)["devices"];v=[x for k in sorted(d,reverse=True) for x in d[k] if x.get("isAvailable") and "iPhone" in x.get("name","")];v.sort(key=lambda x:x.get("state")!="Booted");print(v[0]["udid"] if v else "")')"
    [[ -n "$hub_simulator_id" ]] || { echo "Install an iPhone Simulator runtime in Xcode Settings → Components."; exit 2; }
    xcrun simctl boot "$hub_simulator_id" 2>/dev/null || true
    hub_developer_directory="$(xcode-select -p)"
    hub_simulator_window="$hub_developer_directory/Applications/Simulator.app"
    if [[ -d "$(dirname "$hub_developer_directory")/Applications/DeviceHub.app" ]]; then
      hub_simulator_window="$(dirname "$hub_developer_directory")/Applications/DeviceHub.app"
    fi
    if ! open -a "$hub_simulator_window"; then
      echo "Simulator window unavailable; continuing with the installed runtime through simctl."
    fi
    xcrun simctl bootstatus "$hub_simulator_id" -b
    if [[ "$hub_build_mode" == "test" ]]; then
      mkdir -p artifacts
      xcodebuild -project ios/App/App.xcodeproj -scheme TheHub -configuration Debug -destination "id=$hub_simulator_id" -derivedDataPath build/simulator -resultBundlePath "artifacts/TheHub-UITests-$(date +%Y%m%d-%H%M%S)-$$.xcresult" CODE_SIGNING_ALLOWED=NO test
      echo "Existing Xcode UI test suite passed. Signed-in transportation and physical-device checks are separate release gates."
    else
      xcodebuild -project ios/App/App.xcodeproj -scheme TheHub -configuration Debug -destination "id=$hub_simulator_id" -derivedDataPath build/simulator CODE_SIGNING_ALLOWED=NO build
      xcrun simctl install "$hub_simulator_id" "build/simulator/Build/Products/Debug-iphonesimulator/The Hub.app"
      xcrun simctl launch --terminate-running-process "$hub_simulator_id" com.thomasonchildcaresolutions.thehub
      echo "Simulator launched. Complete login, transportation, Parent Portal, public-page and disposable-account checks before archiving."
    fi
    ;;
  archive)
    # Use the production custom domain; deployment aliases may have Vercel SSO protection.
    hub_cors_header="$(curl --connect-timeout 15 --max-time 45 -fsS -D - -o /dev/null -X OPTIONS -H 'Origin: capacitor://localhost' https://thetcshub.com/api/auth/profile | tr -d '\r')"
    if ! echo "$hub_cors_header" | grep -qi '^access-control-allow-origin: capacitor://localhost$'; then
      echo "Publish and verify the matching Hub API CORS release before archiving."
      exit 2
    fi
    hub_settings="$(xcodebuild -project ios/App/App.xcodeproj -scheme TheHub -configuration Release -showBuildSettings -json)"
    read -r hub_version hub_build_number < <(printf '%s' "$hub_settings" | python3 -c 'import json,sys;rows=json.load(sys.stdin);s=next(r["buildSettings"] for r in rows if r.get("target")=="App");print(s["MARKETING_VERSION"],s["CURRENT_PROJECT_VERSION"])')
    [[ "$hub_version" =~ ^[0-9]+(\.[0-9]+){1,2}$ && "$hub_build_number" =~ ^[0-9]+$ ]] || { echo "Could not determine the app version and build number."; exit 2; }
    mkdir -p artifacts
    hub_archive="artifacts/TheHub-${hub_version}-build${hub_build_number}-$(date +%Y%m%d-%H%M%S)-$$.xcarchive"
    xcodebuild -project ios/App/App.xcodeproj -scheme TheHub -configuration Release -destination 'generic/platform=iOS' -archivePath "$hub_archive" -allowProvisioningUpdates archive
    hub_info="$hub_archive/Products/Applications/The Hub.app/Info.plist"
    [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$hub_info")" == 'com.thomasonchildcaresolutions.thehub' ]] || { echo "Archive app identity mismatch."; exit 2; }
    [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$hub_info")" == "$hub_version" ]] || { echo "Archive version mismatch."; exit 2; }
    [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$hub_info")" == "$hub_build_number" ]] || { echo "Archive build mismatch."; exit 2; }
    echo "Archive prepared: $hub_archive. Review privacy, signing and native test evidence in Xcode Organizer before uploading. No upload or App Review submission has been performed."
    ;;
esac
