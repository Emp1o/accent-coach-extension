/*
1) Вставь код счётчика Яндекс Метрики на страницу.
2) Замени METRICA_COUNTER_ID на свой ID счётчика.
3) Создай цели click_download и click_install_guide.
*/
(function() {
  var counterId = 'METRICA_COUNTER_ID';
  var downloadBtn = document.getElementById('download-btn');
  var guideBtn = document.getElementById('install-guide-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      if (window.ym) ym(counterId, 'reachGoal', 'click_download');
    });
  }
  if (guideBtn) {
    guideBtn.addEventListener('click', function() {
      if (window.ym) ym(counterId, 'reachGoal', 'click_install_guide');
    });
  }
})();
