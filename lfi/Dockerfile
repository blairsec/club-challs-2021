FROM archlinux:latest

# Quality of life and common languages
RUN pacman --noconfirm -Sy base-devel coreutils git vim tmux\
    openbsd-netcat curl wget\
    supervisor nginx apache xinetd\
    php php-cgi php-apache php-fpm\
    python python-pip\
    nodejs npm\
    rust\
    perl\
    ruby rubygems

# Service ports
EXPOSE 1337 2337 3337 4337
# Debugging ports
EXPOSE 31337 32337 33337 34337

# Set up chall dir
RUN useradd -m chall
WORKDIR /chall
COPY ./files .
RUN chown -R chall:chall /chall

WORKDIR /setup
COPY ./setup .

# Run init.sh
RUN [ -f init.sh ] && chmod +x ./init.sh && ./init.sh

# Remove setup
WORKDIR /
RUN rm -rf /setup

# Set up supervisord
RUN mkdir -p /var/log/supervisor
COPY ./supervisord.conf /etc/supervisord.conf

# Chown again in case any
RUN chown -R chall:chall /chall

# Debug environment variable
ENV DEBUG 0

# Start supervisord on startup
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
