// Сервер сайта: раздаёт файлы из public/ и принимает заявки на /api/leads.
//
// Секреты — DATABASE_URL, BOT_TOKEN, TELEGRAM_CHAT_ID — читаются только тут,
// из переменных окружения. В public/ им попасть неоткуда: это единственная
// папка, которую сервер отдаёт наружу, и код внутри неё их даже не знает.
//
// require('dotenv').config() подхватывает файл .env, если он есть рядом —
// это только для запуска на своём компьютере. На Railway такого файла нет,
// переменные приходят от самой платформы, и эта строка там просто ничего
// не делает: dotenv не трогает уже заданные переменные.

require('dotenv').config();

const http = require('http');
const path = require('path');
const serveHandler = require('serve-handler');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const ALLOWED_SERVICES = [
  'Сайт-визитка',
  'Лендинг под услугу',
  'Поддержка и правки',
  'Другое',
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      service TEXT NOT NULL,
      comment TEXT
    )
  `);
}

// Те же правила, что в браузере в app.js — но здесь их обойти нельзя.
// Браузеру мы не доверяем: запрос на /api/leads можно отправить и в обход формы.
function validateLead(body) {
  const errors = {};
  const name = String((body && body.name) || '').trim();
  const contact = String((body && body.contact) || '').trim();
  const service = String((body && body.service) || '').trim();
  const comment = String((body && body.comment) || '').trim();

  if (name.length < 2) errors.name = 'Имя короче двух символов';
  else if (name.length > 80) errors.name = 'Слишком длинное имя';

  if (contact.length < 3) errors.contact = 'Укажи телефон или Telegram';
  else if (contact.length > 80) errors.contact = 'Слишком длинно';

  if (!ALLOWED_SERVICES.includes(service)) errors.service = 'Выбери из списка';

  if (comment.length > 500) errors.comment = 'Слишком длинный комментарий';

  return { errors, value: { name, contact, service, comment: comment || null } };
}

async function saveLead(lead) {
  await pool.query(
    'INSERT INTO leads (name, contact, service, comment) VALUES ($1, $2, $3, $4)',
    [lead.name, lead.contact, lead.service, lead.comment]
  );
}

async function notifyTelegram(lead) {
  const token = process.env.BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error('BOT_TOKEN или TELEGRAM_CHAT_ID не заданы на сервере');
  }

  const text = [
    'Новая заявка с сайта',
    '',
    'Имя: ' + lead.name,
    'Связь: ' + lead.contact,
    'Нужно: ' + lead.service,
    lead.comment ? 'Комментарий: ' + lead.comment : null,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error('Telegram ответил ' + response.status + ': ' + details);
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let size = 0;
    const LIMIT = 10 * 1024; // с запасом хватает на любую вменяемую заявку

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > LIMIT) {
        reject(new Error('too_large'));
        request.destroy();
        return;
      }
      raw += chunk;
    });

    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error('bad_json'));
      }
    });

    request.on('error', reject);
  });
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(body);
}

async function handleLeads(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { ok: false, stage: 'method', message: 'Метод не поддерживается' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (err) {
    sendJson(response, 400, { ok: false, stage: 'validation', message: 'Некорректный запрос' });
    return;
  }

  const { errors, value } = validateLead(body);
  if (Object.keys(errors).length > 0) {
    sendJson(response, 400, { ok: false, stage: 'validation', errors });
    return;
  }

  try {
    await saveLead(value);
  } catch (err) {
    console.error('Не удалось записать заявку в базу:', err);
    sendJson(response, 500, {
      ok: false,
      stage: 'db',
      message: 'Не получилось сохранить заявку. Попробуй ещё раз или напиши мне напрямую.',
    });
    return;
  }

  try {
    await notifyTelegram(value);
  } catch (err) {
    // Заявка уже в базе — данные не потеряны, посетителю говорим честно.
    console.error('Заявка сохранена, но уведомление в Telegram не ушло:', err);
    sendJson(response, 502, {
      ok: false,
      stage: 'telegram',
      message: 'Заявка сохранена, но написать тебе не получилось — свяжись со мной напрямую, контакты ниже.',
    });
    return;
  }

  sendJson(response, 200, { ok: true });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (url.pathname === '/api/leads') {
    handleLeads(request, response).catch((err) => {
      console.error('Неожиданная ошибка в /api/leads:', err);
      sendJson(response, 500, { ok: false, stage: 'server', message: 'Внутренняя ошибка сервера' });
    });
    return;
  }

  serveHandler(request, response, {
    public: PUBLIC_DIR,
    // Не показывать содержимое папок: запрос /images/ должен давать 404,
    // а не список файлов. Наружу отдаём только то, на что есть прямая ссылка.
    directoryListing: false,
    headers: [
      {
        // Картинки не меняются — разрешаем браузеру кэшировать их на неделю
        source: 'images/**',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }],
      },
    ],
  });
});

ensureSchema()
  .then(() => {
    server.listen(PORT, () => {
      console.log('Сервер запущен, слушаю порт ' + PORT);
    });
  })
  .catch((err) => {
    console.error('Не удалось подготовить базу данных при старте:', err);
    process.exit(1);
  });
