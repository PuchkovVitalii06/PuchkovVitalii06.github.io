# Как Railway собирает сайт.
# Берём готовый образ с веб-сервером Caddy и кладём внутрь файлы сайта.
# Ничего не собирается и не компилируется — это по-прежнему обычные HTML и CSS.

FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY . /srv
