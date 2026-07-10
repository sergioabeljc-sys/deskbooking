FROM node:24-alpine

WORKDIR /app

# Instala dependências nativas para better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Volume para persistência do banco
VOLUME ["/data"]

EXPOSE 3000

ENV NODE_ENV=production
ENV DB_PATH=/data/workplace.db

CMD ["node", "--env-file=.env", "server.js"]
