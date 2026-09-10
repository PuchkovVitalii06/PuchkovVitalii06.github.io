# Как Railway собирает сайт.
# Раньше файлы просто раздавал готовый образ Caddy. Теперь сайт ещё и
# принимает заявки, поэтому вместо веб-сервера — свой процесс на Node:
# server.js раздаёт файлы из public/ и обрабатывает /api/leads.

FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY public ./public

CMD ["node", "server.js"]
