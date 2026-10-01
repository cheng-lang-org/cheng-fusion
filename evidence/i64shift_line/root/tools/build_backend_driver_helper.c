#include <spawn.h>
#include <sys/wait.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

extern char **environ;

static void run_or_die(const char *label, char *argv[]) {
    pid_t pid;
    int status = posix_spawn(&pid, argv[0], NULL, NULL, argv, environ);
    if (status != 0) {
        fprintf(stderr, "[cheng_cold] %s: posix_spawn failed status=%d\n", label, status);
        exit(2);
    }
    waitpid(pid, &status, 0);
    int rc = WIFEXITED(status) ? WEXITSTATUS(status) : 126;
    if (rc != 0) {
        fprintf(stderr, "[cheng_cold] %s failed rc=%d\n", label, rc);
        exit(rc);
    }
}

int main(int argc, char **argv) {
    const char *self_path = argv[0];
    const char *root = "/Users/lbcheng/cheng-lang";
    
    /* Step 1: compile backend_driver_dispatch_min.cheng -> compiler_main.direct */
    char *step1_args[] = {
        "/Users/lbcheng/cheng-lang/artifacts/bootstrap/cheng.stage0",
        "system-link-exec",
        "--root:/Users/lbcheng/cheng-lang",
        "--in:src/core/tooling/backend_driver_dispatch_min.cheng",
        "--emit:exe",
        "--link-providers",
        "--target:arm64-apple-darwin",
        "--out:/Users/lbcheng/cheng-lang/artifacts/bootstrap/compiler_main.direct",
        "--report-out:/Users/lbcheng/cheng-lang/artifacts/bootstrap/compiler_main.direct.report.txt",
        NULL
    };
    run_or_die("build-backend-driver compile", step1_args);
    
    /* Step 2: verify generated compiler */
    char *status_args[] = {
        "/Users/lbcheng/cheng-lang/artifacts/bootstrap/compiler_main.direct",
        "status",
        NULL
    };
    run_or_die("build-backend-driver status check", status_args);
    
    /* Step 3: recursive build with generated compiler */
    char *step3_args[] = {
        "/Users/lbcheng/cheng-lang/artifacts/bootstrap/compiler_main.direct",
        "build-backend-driver",
        "--require-rebuild",
        "--target:arm64-apple-darwin",
        "--root:/Users/lbcheng/cheng-lang",
        NULL
    };
    run_or_die("build-backend-driver full backend install", step3_args);
    
    return 0;
}
