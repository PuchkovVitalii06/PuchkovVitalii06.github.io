// Баннер согласия на аналитику (Google Consent Mode v2).
// Значения по умолчанию и обработка уже сохранённого выбора — в <head>,
// в том же скрипте, что и сам счётчик. Здесь только показ баннера
// и реакция на нажатие одной из двух кнопок.

(function () {
  var STORAGE_KEY = 'cookie_consent';
  var banner = document.getElementById('consent-banner');
  if (!banner) return;

  var saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    // localStorage недоступен — просто не будем запоминать выбор
  }

  // Выбор уже был раньше — «принято» уже применили в <head> до загрузки
  // этого файла, второй раз баннер не показываем
  if (saved === 'accepted' || saved === 'rejected') return;

  banner.hidden = false;

  function respond(choice) {
    var granted = choice === 'accepted';

    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        ad_storage: granted ? 'granted' : 'denied',
        ad_user_data: granted ? 'granted' : 'denied',
        ad_personalization: granted ? 'granted' : 'denied',
        analytics_storage: granted ? 'granted' : 'denied',
      });
    }

    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch (e) {
      // не критично — при следующем визите баннер просто покажется снова
    }

    banner.hidden = true;
  }

  document.getElementById('consent-accept').addEventListener('click', function () {
    respond('accepted');
  });

  document.getElementById('consent-reject').addEventListener('click', function () {
    respond('rejected');
  });
})();
