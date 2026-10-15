// Профили LLM на выбор. Первый — по умолчанию; переключение: кнопка 🔌 или ⚙ -> Профиль.
window.LLM_CONFIGS = [
  {
    "name": "Atria (облако)",
    "endpoint": "https://api.atria-asi.ai/v1/responses",
    "apiKey": "",
    "model": "Atria-Dawn-Preview"
  },
  {
    "name": "Локальный (127.0.0.1:8080)",
    "endpoint": "http://127.0.0.1:8080/v1/chat/completions",
    "apiKey": "",
    "model": "qwen3.8-flash-next-iq3_s"
  }
];
