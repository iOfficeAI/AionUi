
cat-config:
	@base64 -D -i ~/.aibang-config-dev/aibang-config.txt | python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read()))' | pbcopy
