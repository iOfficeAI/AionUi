cask "aionui" do
  arch arm: "arm64", intel: "x64"

  version "1.7.1"
  sha256 arm:   "ec758b0f4727eea1fb13a7ca4176dbf75baab2f3dc135eacbaa8ce091d27d219",
         intel: "bdb9be0d79f6c7c6c7457f2668dd23ccd0c00a9c7b5a4129960c5d7650190a3a"

  url "https://github.com/iOfficeAI/AionUi/releases/download/v#{version}/AionUi-#{version}-mac-#{arch}.dmg"
  name "AionUi"
  desc "Unified GUI for command-line AI agents"
  homepage "https://github.com/iOfficeAI/AionUi"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :big_sur"

  app "AionUi.app"

  zap trash: [
    "~/Library/Application Support/AionUi",
    "~/Library/Preferences/com.aionui.app.plist",
    "~/Library/Saved Application State/com.aionui.app.savedState",
  ]
end
