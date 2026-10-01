# File And Process IO

Modules: `std/os`, `std/syncio`, `std/streams`

Key APIs: `OpenFileResult/CloseFileResult/ReadAllBytesResult/WriteAllBytesResult`, `readFile/readFileInto/writeFile/writeFileBytes`, `fileExists/dirExists/createDir/removeFile/renameFile`, `joinPath/splitFile/walkDir`, `execCmdEx/execFileCapture`

File handles use `FileHandle = uint64`; `0` is invalid. Public code should use the `Result` APIs and `FileOpenMode` (`Read`, `WriteTruncate`, `ReadWrite`, `Append`) instead of `fopen`/`FILE*`/`ptr`.

Example: `examples/std/file_io.cheng`

Notes: The v1.1 baseline only checks local filesystem and local process capture behavior. It does not introduce new sandbox or permission semantics.
