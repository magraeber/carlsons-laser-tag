FROM node:24-bookworm-slim

# Tools used by VS Code and by the non-root workspace setup.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git procps sudo \
    && rm -rf /var/lib/apt/lists/* \
    && printf 'node ALL=(root) NOPASSWD:ALL\n' > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node
