set chromeApp to "/Applications/Google Chrome.app"
set homePath to POSIX path of (path to home folder)
set profilePath to homePath & "Library/Application Support/Chrome Cheng Proxy"
set pacURL to "http://127.0.0.1:18080/cheng-gfw-split.pac"

do shell script "mkdir -p " & quoted form of profilePath
do shell script "open -na " & quoted form of chromeApp & " --args " & ¬
    "--user-data-dir=" & quoted form of profilePath & " " & ¬
    "--proxy-pac-url=" & quoted form of pacURL & " " & ¬
    "--disable-quic"
