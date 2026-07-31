
cat-config:
	@base64 -D -i ~/.csbu-workmate-config-dev/csbu-workmate-config.txt | python3 -c 'import sys, urllib.parse; print(urllib.parse.unquote(sys.stdin.read()))' | pbcopy
