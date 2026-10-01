#include <sys/socket.h>
#include <sys/types.h>

#include <errno.h>
#include <fcntl.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

enum { kDarwinMaxRights = 512 };

static int count_open_fds(void) {
    long limit = sysconf(_SC_OPEN_MAX);
    if (limit <= 0 || limit > 65536) {
        limit = 65536;
    }
    int count = 0;
    for (int fd = 0; fd < limit; ++fd) {
        errno = 0;
        if (fcntl(fd, F_GETFD) >= 0 || errno != EBADF) {
            ++count;
        }
    }
    return count;
}

static int send_rights(int socket_fd, int source_fd, size_t fd_count) {
    const uint8_t payload = UINT8_C(0x5a);
    struct iovec iov = {
        .iov_base = (void *)&payload,
        .iov_len = sizeof(payload),
    };
    const size_t control_bytes = CMSG_SPACE(fd_count * sizeof(int));
    uint8_t *control = calloc(1, control_bytes);
    if (control == NULL) {
        return -2;
    }
    struct msghdr message;
    memset(&message, 0, sizeof(message));
    message.msg_iov = &iov;
    message.msg_iovlen = 1;
    message.msg_control = control;
    message.msg_controllen = control_bytes;
    struct cmsghdr *header = CMSG_FIRSTHDR(&message);
    header->cmsg_len = CMSG_LEN(fd_count * sizeof(int));
    header->cmsg_level = SOL_SOCKET;
    header->cmsg_type = SCM_RIGHTS;
    int *fds = (int *)(void *)CMSG_DATA(header);
    for (size_t i = 0; i < fd_count; ++i) {
        fds[i] = source_fd;
    }
    const ssize_t sent = sendmsg(socket_fd, &message, 0);
    const int saved_errno = errno;
    free(control);
    errno = saved_errno;
    return sent == (ssize_t)sizeof(payload) ? 1 : -1;
}

static int receive_and_close_exact(int socket_fd, size_t expected_count) {
    uint8_t payload = 0;
    struct iovec iov = {
        .iov_base = &payload,
        .iov_len = sizeof(payload),
    };
    const size_t control_bytes =
        CMSG_SPACE(kDarwinMaxRights * sizeof(int));
    uint8_t *control = calloc(1, control_bytes);
    if (control == NULL) {
        return 0;
    }
    struct msghdr message;
    memset(&message, 0, sizeof(message));
    message.msg_iov = &iov;
    message.msg_iovlen = 1;
    message.msg_control = control;
    message.msg_controllen = control_bytes;
    const ssize_t received = recvmsg(socket_fd, &message, 0);
    size_t received_count = 0;
    int valid = received == (ssize_t)sizeof(payload) &&
        payload == UINT8_C(0x5a) &&
        (message.msg_flags & (MSG_CTRUNC | MSG_TRUNC)) == 0;
    for (struct cmsghdr *header = CMSG_FIRSTHDR(&message);
         header != NULL;
         header = CMSG_NXTHDR(&message, header)) {
        if (header->cmsg_level != SOL_SOCKET ||
            header->cmsg_type != SCM_RIGHTS ||
            header->cmsg_len < CMSG_LEN(sizeof(int))) {
            valid = 0;
            continue;
        }
        const size_t data_bytes = header->cmsg_len - CMSG_LEN(0);
        if (data_bytes % sizeof(int) != 0) {
            valid = 0;
            continue;
        }
        const size_t record_count = data_bytes / sizeof(int);
        int *fds = (int *)(void *)CMSG_DATA(header);
        for (size_t i = 0; i < record_count; ++i) {
            if (fds[i] < 0 || close(fds[i]) != 0) {
                valid = 0;
            }
            ++received_count;
        }
    }
    free(control);
    return valid && received_count == expected_count;
}

static int run_count_case(int send_socket,
                          int receive_socket,
                          int source_fd,
                          size_t fd_count) {
    const int before = count_open_fds();
    const int sent = send_rights(send_socket, source_fd, fd_count);
    if (before < 0 || sent != 1) {
        fprintf(stderr, "send count=%zu result=%d errno=%d\n",
                fd_count, sent, errno);
        return 0;
    }
    if (!receive_and_close_exact(receive_socket, fd_count)) {
        fprintf(stderr, "receive count=%zu failed\n", fd_count);
        return 0;
    }
    const int after = count_open_fds();
    if (after != before) {
        fprintf(stderr, "open delta count=%zu before=%d after=%d\n",
                fd_count, before, after);
        return 0;
    }
    return 1;
}

int main(void) {
#if !defined(__APPLE__)
    fputs("darwin_scm_rights_capacity_probe_status=unsupported\n", stdout);
    return 77;
#else
    int sockets[2] = {-1, -1};
    if (socketpair(AF_UNIX, SOCK_DGRAM, 0, sockets) != 0) {
        return 1;
    }
    const int source_fd = open("/dev/null", O_RDONLY | O_CLOEXEC);
    if (source_fd < 0) {
        return 2;
    }
    if (CMSG_SPACE(kDarwinMaxRights * sizeof(int)) != 2060U) {
        fprintf(stderr, "control space drift: %zu\n",
                CMSG_SPACE(kDarwinMaxRights * sizeof(int)));
        return 3;
    }
    if (!run_count_case(sockets[0], sockets[1], source_fd, 4)) {
        fputs("four-right receive/close failed\n", stderr);
        return 3;
    }
    const int range_before = count_open_fds();
    size_t observed_max = 4;
    size_t first_rejected = 0;
    for (size_t candidate = 5; candidate <= kDarwinMaxRights; ++candidate) {
        const int sent = send_rights(sockets[0], source_fd, candidate);
        if (sent != 1) {
            first_rejected = candidate;
            break;
        }
        if (!receive_and_close_exact(sockets[1], candidate)) {
            fprintf(stderr, "accepted count=%zu could not be drained\n",
                    candidate);
            return 3;
        }
        observed_max = candidate;
    }
    if (first_rejected == 0 || first_rejected != observed_max + 1U ||
        first_rejected > kDarwinMaxRights ||
        count_open_fds() != range_before) {
        fprintf(stderr,
                "capacity boundary invalid max=%zu first_rejected=%zu\n",
                observed_max, first_rejected);
        return 3;
    }
    if (send_rights(sockets[0], source_fd, kDarwinMaxRights) != -1) {
        fputs("512-right send unexpectedly accepted\n", stderr);
        return 4;
    }
    errno = 0;
    if (send_rights(sockets[0], source_fd, kDarwinMaxRights + 1U) != -1) {
        return 4;
    }
    if (close(source_fd) != 0 || close(sockets[0]) != 0 ||
        close(sockets[1]) != 0) {
        return 5;
    }
    printf("darwin_scm_rights_observed_send_max=%zu\n", observed_max);
    puts("darwin_scm_rights_send_512=rejected");
    puts("darwin_scm_rights_send_513=rejected");
    puts("darwin_scm_rights_recv_4_abort_open_delta=0");
    puts("darwin_scm_rights_recv_observed_max_abort_open_delta=0");
    puts("darwin_scm_rights_capacity_probe_status=pass");
    return 0;
#endif
}
