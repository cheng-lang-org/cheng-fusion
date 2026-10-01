#ifndef COLD_CONTEXT_HARNESS_H
#define COLD_CONTEXT_HARNESS_H

typedef struct ColdHarnessCompilation {
    Arena *arena;
    ColdCompilationContext *context;
    ColdSourceSnapshotTable *snapshot;
    int32_t root_scope_row;
    Symbols *symbols;
    ArenaCleanup owner_cleanup;
} ColdHarnessCompilation;

static void cold_harness_compilation_end(
    ColdHarnessCompilation *compilation, bool aborted);

static void cold_harness_compilation_cleanup(void *opaque) {
    cold_harness_compilation_end(
        (ColdHarnessCompilation *)opaque, true);
}

static void cold_harness_write_all(
        int fd, const uint8_t *bytes, size_t length) {
    size_t offset = 0;
    while (offset < length) {
        ssize_t written = write(fd, bytes + offset, length - offset);
        if (written <= 0) die("cold harness fixture write failed");
        offset += (size_t)written;
    }
}

static void cold_harness_compilation_begin(
        ColdHarnessCompilation *compilation, Arena *arena) {
    if (!compilation || !arena)
        die("cold harness compilation owner missing");
    memset(compilation, 0, sizeof(*compilation));
    compilation->arena = arena;
    compilation->context = arena_alloc(
        arena, sizeof(ColdCompilationContext));
    cold_compilation_context_begin_terminal_harness(
        compilation->context, arena);
    arena_cleanup_register(
        arena, &compilation->owner_cleanup,
        cold_harness_compilation_cleanup, compilation);
    compilation->root_scope_row = cold_symbol_scope_begin_root(
        compilation->context);
    compilation->symbols = symbols_new(
        compilation->context, compilation->root_scope_row);
}

static void cold_harness_compilation_begin_sized(
        ColdHarnessCompilation *compilation, Arena *arena,
        int32_t function_cap, int32_t type_cap,
        int32_t object_cap, int32_t const_cap,
        int32_t global_cap) {
    if (!compilation || !arena)
        die("cold harness compilation owner missing");
    memset(compilation, 0, sizeof(*compilation));
    compilation->arena = arena;
    compilation->context = arena_alloc(
        arena, sizeof(ColdCompilationContext));
    cold_compilation_context_begin_terminal_harness(
        compilation->context, arena);
    arena_cleanup_register(
        arena, &compilation->owner_cleanup,
        cold_harness_compilation_cleanup, compilation);
    compilation->root_scope_row = cold_symbol_scope_begin_root(
        compilation->context);
    compilation->symbols = symbols_new_sized(
        compilation->context, compilation->root_scope_row,
        function_cap, type_cap, object_cap,
        const_cap, global_cap);
}

static Symbols *cold_harness_compilation_new_symbols(
        ColdHarnessCompilation *compilation) {
    if (!compilation || !cold_compilation_context_active(
            compilation->context))
        die("cold harness compilation authority inactive");
    int32_t scope = cold_symbol_scope_begin_root(compilation->context);
    Symbols *symbols = symbols_new(compilation->context, scope);
    if (compilation->snapshot)
        symbols_bind_source_snapshot(symbols, compilation->snapshot);
    return symbols;
}

static ColdSourceSnapshotTable *cold_harness_compilation_seal_source(
        ColdHarnessCompilation *compilation, Span source,
        const char *relative_module_path) {
    if (!compilation || !compilation->context ||
        !relative_module_path || relative_module_path[0] == '\0' ||
        source.len <= 0 || !source.ptr ||
        compilation->snapshot)
        die("cold harness source fixture invalid");

    char template_path[] = "/tmp/cheng-cold-context.XXXXXX";
    char *package_root = mkdtemp(template_path);
    if (!package_root) die("cold harness package root create failed");
    char source_root[PATH_MAX];
    char source_path[PATH_MAX];
    char manifest_path[PATH_MAX];
    if (snprintf(source_root, sizeof(source_root), "%s/src",
                 package_root) <= 0 ||
        snprintf(source_path, sizeof(source_path), "%s/src/%s.cheng",
                 package_root, relative_module_path) <= 0 ||
        snprintf(manifest_path, sizeof(manifest_path),
                 "%s/cheng-package.toml", package_root) <= 0)
        die("cold harness fixture path overflow");
    if (mkdir(source_root, 0700) != 0)
        die("cold harness source root create failed");

    char parent_path[PATH_MAX];
    if (strlen(source_path) >= sizeof(parent_path))
        die("cold harness fixture path overflow");
    strcpy(parent_path, source_path);
    char *slash = strrchr(parent_path, '/');
    if (!slash) die("cold harness fixture parent missing");
    *slash = '\0';
    for (char *cursor = parent_path + strlen(source_root) + 1;
         *cursor; cursor++) {
        if (*cursor != '/') continue;
        *cursor = '\0';
        if (mkdir(parent_path, 0700) != 0 && errno != EEXIST)
            die("cold harness fixture directory create failed");
        *cursor = '/';
    }
    if (mkdir(parent_path, 0700) != 0 && errno != EEXIST)
        die("cold harness fixture directory create failed");

    int manifest_fd = open(
        manifest_path, O_WRONLY | O_CREAT | O_EXCL, 0600);
    if (manifest_fd < 0) die("cold harness manifest create failed");
    static const uint8_t manifest[] = "package_id = \"gate\"\n";
    cold_harness_write_all(
        manifest_fd, manifest, sizeof(manifest) - 1);
    if (close(manifest_fd) != 0)
        die("cold harness manifest close failed");
    int source_fd = open(
        source_path, O_WRONLY | O_CREAT | O_EXCL, 0600);
    if (source_fd < 0) die("cold harness source create failed");
    cold_harness_write_all(
        source_fd, source.ptr, (size_t)source.len);
    if (close(source_fd) != 0)
        die("cold harness source close failed");

    int previous_directory = open(".", O_RDONLY);
    if (previous_directory < 0 || chdir(package_root) != 0)
        die("cold harness package root enter failed");
    compilation->snapshot = arena_alloc(
        compilation->arena, sizeof(ColdSourceSnapshotTable));
    cold_source_snapshot_begin(
        compilation->snapshot, compilation->arena,
        compilation->context);
    char relative_path[PATH_MAX];
    if (snprintf(relative_path, sizeof(relative_path),
                 "src/%s.cheng", relative_module_path) <= 0)
        die("cold harness relative source path invalid");
    (void)cold_source_snapshot_capture(
        compilation->snapshot, relative_path);
    cold_source_snapshot_seal(compilation->snapshot);
    symbols_bind_source_snapshot(
        compilation->symbols, compilation->snapshot);
    if (fchdir(previous_directory) != 0 ||
        close(previous_directory) != 0)
        die("cold harness package root restore failed");

    if (unlink(source_path) != 0 || unlink(manifest_path) != 0)
        die("cold harness fixture unlink failed");
    char remove_path[PATH_MAX];
    strcpy(remove_path, parent_path);
    while (strcmp(remove_path, source_root) != 0) {
        if (rmdir(remove_path) != 0)
            die("cold harness fixture directory release failed");
        slash = strrchr(remove_path, '/');
        if (!slash) die("cold harness fixture parent release invalid");
        *slash = '\0';
    }
    if (rmdir(source_root) != 0 || rmdir(package_root) != 0)
        die("cold harness package root release failed");
    return compilation->snapshot;
}

static ColdSourceSnapshotTable *cold_harness_compilation_seal_sources(
        ColdHarnessCompilation *compilation,
        const Span *sources, const char *const *relative_module_paths,
        int32_t source_count) {
    if (!compilation || !compilation->context || compilation->snapshot ||
        !sources || !relative_module_paths || source_count <= 0 ||
        source_count > 16)
        die("cold harness source set invalid");
    char template_path[] = "/tmp/cheng-cold-context.XXXXXX";
    char *package_root = mkdtemp(template_path);
    if (!package_root) die("cold harness package root create failed");
    char source_root[PATH_MAX];
    char manifest_path[PATH_MAX];
    if (snprintf(source_root, sizeof(source_root), "%s/src",
                 package_root) <= 0 ||
        snprintf(manifest_path, sizeof(manifest_path),
                 "%s/cheng-package.toml", package_root) <= 0)
        die("cold harness source set path overflow");
    if (mkdir(source_root, 0700) != 0)
        die("cold harness source root create failed");
    int manifest_fd = open(
        manifest_path, O_WRONLY | O_CREAT | O_EXCL, 0600);
    if (manifest_fd < 0) die("cold harness manifest create failed");
    static const uint8_t manifest[] = "package_id = \"gate\"\n";
    cold_harness_write_all(
        manifest_fd, manifest, sizeof(manifest) - 1);
    if (close(manifest_fd) != 0)
        die("cold harness manifest close failed");

    char source_paths[16][PATH_MAX];
    char parent_paths[16][PATH_MAX];
    for (int32_t row = 0; row < source_count; row++) {
        if (!relative_module_paths[row] ||
            relative_module_paths[row][0] == '\0' ||
            sources[row].len <= 0 || !sources[row].ptr)
            die("cold harness source set row invalid");
        int written = snprintf(
            source_paths[row], sizeof(source_paths[row]),
            "%s/src/%s.cheng", package_root,
            relative_module_paths[row]);
        if (written <= 0 ||
            written >= (int)sizeof(source_paths[row]))
            die("cold harness source set row path overflow");
        strcpy(parent_paths[row], source_paths[row]);
        char *slash = strrchr(parent_paths[row], '/');
        if (!slash) die("cold harness source set parent missing");
        *slash = '\0';
        if (!cold_mkdir_p(parent_paths[row]))
            die("cold harness source set parent create failed");
        int source_fd = open(
            source_paths[row], O_WRONLY | O_CREAT | O_EXCL, 0600);
        if (source_fd < 0)
            die("cold harness source set file create failed");
        cold_harness_write_all(
            source_fd, sources[row].ptr,
            (size_t)sources[row].len);
        if (close(source_fd) != 0)
            die("cold harness source set file close failed");
    }

    int previous_directory = open(".", O_RDONLY);
    if (previous_directory < 0 || chdir(package_root) != 0)
        die("cold harness source set package enter failed");
    compilation->snapshot = arena_alloc(
        compilation->arena, sizeof(ColdSourceSnapshotTable));
    cold_source_snapshot_begin(
        compilation->snapshot, compilation->arena,
        compilation->context);
    for (int32_t row = 0; row < source_count; row++) {
        char relative_path[PATH_MAX];
        int written = snprintf(
            relative_path, sizeof(relative_path), "src/%s.cheng",
            relative_module_paths[row]);
        if (written <= 0 || written >= (int)sizeof(relative_path))
            die("cold harness source set relative path overflow");
        (void)cold_source_snapshot_capture(
            compilation->snapshot, relative_path);
    }
    cold_source_snapshot_seal(compilation->snapshot);
    symbols_bind_source_snapshot(
        compilation->symbols, compilation->snapshot);
    if (fchdir(previous_directory) != 0 ||
        close(previous_directory) != 0)
        die("cold harness source set package restore failed");

    for (int32_t row = 0; row < source_count; row++) {
        if (unlink(source_paths[row]) != 0)
            die("cold harness source set unlink failed");
    }
    for (int32_t row = 0; row < source_count; row++) {
        char release_path[PATH_MAX];
        strcpy(release_path, parent_paths[row]);
        while (strcmp(release_path, source_root) != 0) {
            if (rmdir(release_path) != 0 &&
                errno != ENOENT && errno != ENOTEMPTY)
                die("cold harness source set directory release failed");
            char *slash = strrchr(release_path, '/');
            if (!slash)
                die("cold harness source set parent release invalid");
            *slash = '\0';
        }
    }
    if (rmdir(source_root) != 0 ||
        unlink(manifest_path) != 0 || rmdir(package_root) != 0)
        die("cold harness source set package release failed");
    return compilation->snapshot;
}

static void cold_harness_compilation_end(
        ColdHarnessCompilation *compilation, bool aborted) {
    if (!compilation || !compilation->context) return;
    arena_cleanup_unregister(&compilation->owner_cleanup);
    if (compilation->snapshot &&
        compilation->snapshot->state != COLD_SOURCE_SNAPSHOT_DETACHED) {
        if (aborted)
            cold_source_snapshot_abort(compilation->snapshot);
        else
            cold_source_snapshot_end(compilation->snapshot);
    }
    cold_compilation_context_release(
        compilation->context, aborted);
    compilation->context = 0;
    compilation->snapshot = 0;
    compilation->symbols = 0;
}

#endif
