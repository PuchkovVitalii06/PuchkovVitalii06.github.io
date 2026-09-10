// Проверка и отправка формы заявки.
// Секретов здесь нет и быть не может: этот файл скачивает любой посетитель
// прямо из браузера. Всё, что боится чужих глаз — на сервере, в server.js.

(function () {
  const form = document.getElementById('apply-form');
  if (!form) return;

  const statusEl = document.getElementById('apply-status');
  const submitBtn = form.querySelector('.apply-form__submit');

  const fields = {
    name: { el: form.elements.name, minLength: 2, maxLength: 80 },
    contact: { el: form.elements.contact, minLength: 3, maxLength: 80 },
    service: { el: form.elements.service },
    comment: { el: form.elements.comment, maxLength: 500, optional: true },
  };

  function errorBox(name) {
    return form.querySelector('[data-error-for="' + name + '"]');
  }

  function setFieldError(name, message) {
    const input = fields[name].el;
    const box = errorBox(name);
    input.classList.toggle('field__input--invalid', Boolean(message));
    if (box) {
      box.textContent = message || '';
      box.hidden = !message;
    }
  }

  // Пустая строка — поле в порядке, что-то ещё — текст ошибки
  function validateField(name) {
    const cfg = fields[name];
    const value = cfg.el.value.trim();

    if (!cfg.optional && value.length === 0) return 'Заполни это поле';
    if (!cfg.optional && cfg.minLength && value.length < cfg.minLength) return 'Слишком коротко';
    if (cfg.maxLength && value.length > cfg.maxLength) return 'Слишком длинно — до ' + cfg.maxLength + ' символов';
    return '';
  }

  function validateAll() {
    let ok = true;
    Object.keys(fields).forEach(function (name) {
      const message = validateField(name);
      setFieldError(name, message);
      if (message) ok = false;
    });
    return ok;
  }

  // Проверяем поле сразу после того, как из него ушёл фокус —
  // не показываем ошибку, пока человек ещё печатает
  Object.keys(fields).forEach(function (name) {
    fields[name].el.addEventListener('blur', function () {
      setFieldError(name, validateField(name));
    });
  });

  function showStatus(kind, text) {
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.className = 'apply-form__status apply-form__status--' + kind;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    if (!validateAll()) {
      showStatus('error', 'Проверь поля выше — где-то ошибка.');
      return;
    }

    const payload = {
      name: fields.name.el.value.trim(),
      contact: fields.contact.el.value.trim(),
      service: fields.service.el.value,
      comment: fields.comment.el.value.trim(),
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправляю…';
    statusEl.hidden = true;

    fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data.ok) {
          form.reset();
          showStatus('success', 'Спасибо! Заявка отправлена, отвечу в течение дня.');
          return;
        }

        // Сервер разбирает ошибки по полям — показываем их прямо на месте
        if (result.data.stage === 'validation' && result.data.errors) {
          Object.keys(result.data.errors).forEach(function (name) {
            if (fields[name]) setFieldError(name, result.data.errors[name]);
          });
          showStatus('error', 'Проверь поля выше — где-то ошибка.');
          return;
        }

        showStatus(
          'error',
          result.data.message ||
            'Заявка не отправилась. Попробуй ещё раз или напиши мне напрямую — контакты ниже.'
        );
      })
      .catch(function () {
        showStatus(
          'error',
          'Не получилось отправить — проверь связь с интернетом или напиши мне напрямую, контакты ниже.'
        );
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Отправить заявку';
      });
  });
})();
