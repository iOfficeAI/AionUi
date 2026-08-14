# Optional local AionCore for Docker builds

Place a Linux `aioncore` binary here when the pinned `aioncoreVersion` in
`package.json` is not published yet. The Dockerfile uses it if present:

```text
docker/prebuilt/aioncore
```

Do not commit the binary. After AionCore multi-user is released, remove this
file and let packaging download the pin from GitHub Releases instead.
