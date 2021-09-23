FROM rust:latest

# for healthcheck
RUN apt-get update -y && apt-get install -y netcat

WORKDIR /app
COPY Cargo.toml Cargo.lock /app/
RUN mkdir src
RUN echo "fn main() {}" > src/main.rs

RUN cargo build --release
RUN rm -r src

COPY src /app/src
RUN touch src/main.rs
RUN cargo build --release

ARG PORT=8081
ENV PORT=${PORT}
ARG HEALTHCHECK_FREQ=30000
ENV HEALTHCHECK_FREQ=${HEALTHCHECK_FREQ}

CMD ["/app/target/release/load_balancer"]
