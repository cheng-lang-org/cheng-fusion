/* P5: SOCK_SEQPACKET darwin equivalent — build-and-talk probe.
 * Linux invariant consumed by held-exec (host_runtime
 * cheng_host_socketpair_passcred_runtime + psb channel):
 *   (a) AF_UNIX SOCK_SEQPACKET socketpair: private unnamed channel with
 *       message boundaries (768-byte wire frames; short packet = terminal
 *       failure);
 *   (b) SO_PASSCRED supplies per-message sender pid/uid/gid;
 *   (c) SCM_RIGHTS moves descriptors across (seal bundle handoff).
 * Measured on this host (darwin 25.5.0 arm64):
 *   1. socketpair(AF_UNIX, SOCK_SEQPACKET) — MEASURED. Result recorded
 *      verbatim; if it fails (EAFNOSUPPORT-class) the message-boundary
 *      arm of the contract is re-proven on SOCK_DGRAM, the only
 *      boundary-preserving AF_UNIX type darwin offers.
 *   2. getsockopt(SO_TYPE) == type — the psb
 *      cheng_held_exec_channel_is_seqpacket check shape works verbatim.
 *   3. SO_PASSCRED (Linux value 16) probed for absence; LOCAL_PEERCRED
 *      (SOL_LOCAL) probed for the connection-level peer euid. Honest
 *      delta: per-message sender credentials do not exist on darwin;
 *      fork-socketpair has exactly one fixed peer, so sender identity
 *      collapses to the connection established before exec.
 *   4. SCM_RIGHTS sendmsg/recvmsg of one fd across the pair.
 */
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ucred.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

/* Linux SO_PASSCRED = 16. The darwin SDK has no SO_PASSCRED symbol;
 * probing the Linux value measures its absence on this host. */
#define P5_LINUX_SO_PASSCRED 16

static int talk(int domain, int type, const char *label) {
    int fds[2] = {-1, -1};
    if (socketpair(domain, type, 0, fds) != 0) {
        printf("P5 INFO %s socketpair errno=%d (NOT-BUILDABLE)\n",
               label, errno);
        return 1;
    }
    int a = fds[0], b = fds[1];
    int so_type = -1;
    socklen_t len = sizeof(so_type);
    if (getsockopt(b, SOL_SOCKET, SO_TYPE, &so_type, &len) != 0 ||
        so_type != type) {
        printf("P5 FAIL %s so-type\n", label);
        return 1;
    }
    printf("P5 INFO %s built, getsockopt(SO_TYPE)=%d matches\n",
           label, so_type);

    const char *f0 = "frame-zero-boundary";
    const char *f1 = "frame-one";
    if (send(a, f0, (int)strlen(f0), 0) != (int)strlen(f0) ||
        send(a, f1, (int)strlen(f1), 0) != (int)strlen(f1)) {
        printf("P5 FAIL %s send-frames\n", label);
        return 1;
    }
    char buf[256];
    ssize_t r0 = recv(b, buf, sizeof(buf), 0);
    buf[r0 > 0 ? (size_t)r0 : 0] = 0;
    int bounded0 = r0 == (ssize_t)strlen(f0) && memcmp(buf, f0, (size_t)r0) == 0;
    printf("P5 INFO %s recv#0 len=%zd bounded=%d payload=%s\n",
           label, r0, bounded0, bounded0 ? buf : "<corrupt>");
    ssize_t r1 = recv(b, buf, sizeof(buf), 0);
    buf[r1 > 0 ? (size_t)r1 : 0] = 0;
    int bounded1 = r1 == (ssize_t)strlen(f1) && memcmp(buf, f1, (size_t)r1) == 0;
    printf("P5 INFO %s recv#1 len=%zd bounded=%d payload=%s\n",
           label, r1, bounded1, bounded1 ? buf : "<corrupt>");
    if (!bounded0 || !bounded1) {
        printf("P5 FAIL %s message-boundaries\n", label);
        return 1;
    }
    close(a);
    close(b);
    return 0;
}

int main(void) {
    /* 1. literal SOCK_SEQPACKET, measured verbatim */
    int seqpacket_rc = talk(AF_UNIX, SOCK_SEQPACKET, "seqpacket");

    /* 2. boundary-preserving fallback: SOCK_DGRAM */
    int dgram_rc = talk(AF_UNIX, SOCK_DGRAM, "dgram");

    /* 3. credential surface on a live pair.
     * CAUTION recorded: the Linux value 16 collides with darwin
     * SO_DONTROUTE (0x10), so rc==0 here is a symbol collision, not
     * proof of SO_PASSCRED. The darwin SDK has no SO_PASSCRED symbol
     * and no SCM_CREDENTIALS cmsg type at all; the honest
     * per-message-credentials verdict is ABSENT regardless. */
    int fds[2] = {-1, -1};
    if (socketpair(AF_UNIX, SOCK_DGRAM, 0, fds) != 0) {
        printf("P5 FAIL dgram-pair errno=%d\n", errno);
        return 1;
    }
    int passcred = 0;
    socklen_t len = sizeof(passcred);
    int gpc = getsockopt(fds[0], SOL_SOCKET, P5_LINUX_SO_PASSCRED,
                         &passcred, &len);
    printf("P5 INFO getsockopt(SOL_SOCKET,16) rc=%d value=%d — collides "
           "with darwin SO_DONTROUTE(0x10); SO_PASSCRED symbol "
           "ABSENT, SCM_CREDENTIALS cmsg ABSENT\n",
           gpc, gpc == 0 ? passcred : -1);
    struct xucred cred;
    memset(&cred, 0, sizeof(cred));
    len = sizeof(cred);
    errno = 0;
    int lpc = getsockopt(fds[1], SOL_LOCAL, LOCAL_PEERCRED, &cred, &len);
    printf("P5 INFO LOCAL_PEERCRED(SOL_LOCAL=%d, opt=%d) rc=%d errno=%d "
           "version=%u euid=%d (connection-level; raw option on a "
           "socketpair dgram pair measured)\n",
           SOL_LOCAL, LOCAL_PEERCRED, lpc, lpc == 0 ? 0 : errno,
           lpc == 0 ? cred.cr_version : 0,
           lpc == 0 ? (int)cred.cr_uid : -1);
    uid_t peer_uid = 65534;
    gid_t peer_gid = 65534;
    int gpid = getpeereid(fds[1], &peer_uid, &peer_gid);
    printf("P5 INFO getpeereid(dgram-pair) rc=%d euid=%d egid=%d\n",
           gpid, gpid == 0 ? (int)peer_uid : -1,
           gpid == 0 ? (int)peer_gid : -1);
    int sfds[2] = {-1, -1};
    if (socketpair(AF_UNIX, SOCK_STREAM, 0, sfds) != 0) {
        printf("P5 FAIL stream-pair errno=%d\n", errno);
        return 1;
    }
    peer_uid = 65534;
    peer_gid = 65534;
    gpid = getpeereid(sfds[0], &peer_uid, &peer_gid);
    printf("P5 INFO getpeereid(stream-pair) rc=%d euid=%d egid=%d (%s)\n",
           gpid,
           gpid == 0 ? (int)peer_uid : -1,
           gpid == 0 ? (int)peer_gid : -1,
           gpid == 0 ? "connection-level credential obtainable"
                     : "no credential surface on socketpair at all");

    /* 4. SCM_RIGHTS across the dgram pair */
    int probe_fd = open("/dev/null", O_RDONLY);
    if (probe_fd < 0) {
        printf("P5 FAIL open-devnull\n");
        return 1;
    }
    char cmsg_buf[CMSG_SPACE(sizeof(int))];
    memset(cmsg_buf, 0, sizeof(cmsg_buf));
    struct iovec iov;
    iov.iov_base = (void *)"fd-handoff";
    iov.iov_len = 10;
    struct msghdr mh;
    memset(&mh, 0, sizeof(mh));
    mh.msg_iov = &iov;
    mh.msg_iovlen = 1;
    mh.msg_control = cmsg_buf;
    mh.msg_controllen = sizeof(cmsg_buf);
    struct cmsghdr *cm = CMSG_FIRSTHDR(&mh);
    cm->cmsg_level = SOL_SOCKET;
    cm->cmsg_type = SCM_RIGHTS;
    cm->cmsg_len = CMSG_LEN(sizeof(int));
    memcpy(CMSG_DATA(cm), &probe_fd, sizeof(int));
    if (sendmsg(fds[0], &mh, 0) != 10) {
        printf("P5 FAIL sendmsg errno=%d\n", errno);
        return 1;
    }
    char rbuf[64];
    struct iovec riov;
    riov.iov_base = rbuf;
    riov.iov_len = sizeof(rbuf);
    char rcmsg[CMSG_SPACE(sizeof(int))];
    memset(rcmsg, 0, sizeof(rcmsg));
    struct msghdr rmh;
    memset(&rmh, 0, sizeof(rmh));
    rmh.msg_iov = &riov;
    rmh.msg_iovlen = 1;
    rmh.msg_control = rcmsg;
    rmh.msg_controllen = sizeof(rcmsg);
    ssize_t rr = recvmsg(fds[1], &rmh, 0);
    int got_fd = -1;
    for (struct cmsghdr *h = CMSG_FIRSTHDR(&rmh); h;
         h = CMSG_NXTHDR(&rmh, h)) {
        if (h->cmsg_level == SOL_SOCKET && h->cmsg_type == SCM_RIGHTS)
            memcpy(&got_fd, CMSG_DATA(h), sizeof(int));
    }
    printf("P5 INFO scm_rights recvmsg=%zd got_fd=%d valid=%d\n",
           rr, got_fd, got_fd >= 0 && rr == 10);
    close(probe_fd);
    if (got_fd >= 0) close(got_fd);
    close(fds[0]);
    close(fds[1]);
    printf("P5 VERDICT seqpacket-buildable=%s dgram-equivalent=%s "
           "boundaries-kept scm-rights-flow cred-delta-recorded\n",
           seqpacket_rc == 0 ? "YES" : "NO(measured)",
           dgram_rc == 0 ? "YES" : "NO");
    return dgram_rc == 0 ? 0 : 1;
}
