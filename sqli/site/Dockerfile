FROM node:16

WORKDIR /app
COPY ./package.json ./package-lock.json /app/
RUN npm ci

COPY . /app/

RUN npx tsc

ARG PORT=8080
ENV PORT=${PORT}
ARG FLAGS
ENV FLAGS=${FLAGS}
EXPOSE ${PORT}

CMD ["node", "/app/dest/index.js"]
