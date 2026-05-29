# 🎓 Училищен Симулатор

Образователно мобилно приложение за интерактивно изпитване по учебен материал. AI учителката задава въпроси и насърчава ученика по педагогически правилен начин.

## ⚡ Бърз старт

### 1. Инсталирай зависимостите
```bash
npm install
```

### 2. Добави API ключ
Отвори `src/services/ai.js` и замени:
```js
const ANTHROPIC_API_KEY = "ЗАМЕНИ-С-ТВОЯ-API-KEY";
```
с твоя ключ от https://console.anthropic.com

### 3. Стартирай локално (за тест)
```bash
npx expo start
```
Сканирай QR кода с Expo Go приложението на телефона.

---

## 🏗️ Билд на APK (за Android)

### Еднократна настройка
```bash
npm install -g eas-cli
eas login
eas build:configure
```

В `app.json` замени:
```json
"projectId": "ЗАМЕНИ-С-ТВОЯ-EAS-PROJECT-ID"
```

### Билдване
```bash
eas build -p android --profile preview
```
След ~15 минути получаваш линк за сваляне на `.apk` файла.

---

## 📁 Структура на проекта

```
app/
  _layout.js      # Навигация
  index.js        # Начален екран (route)
  quiz.js         # Изпитване (route)

src/
  screens/
    WelcomeScreen.js   # Избор на клас/предмет/урок
    QuizScreen.js      # Чат с AI учителката
  data/
    lessons.js         # Всички уроци (добавяй тук!)
  services/
    ai.js              # Anthropic API
  theme.js             # Цветове и стилове
```

---

## ➕ Как да добавиш нов урок

Отвори `src/data/lessons.js` и добави в `LESSON_DATABASE`:

```js
"5_history_klett": {
  label: "5. клас • История • Клет",
  lessons: [
    {
      id: 1,
      title: "Заглавие на урока",
      subtitle: "Подзаглавие",
      topics: ["topic1", "topic2"],
      topicLabels: { topic1: "Тема 1", topic2: "Тема 2" },
      content: `Съдържание на урока...`
    }
  ]
}
```

Ключът е: `{клас}_{предмет}_{издателство}` (напр. `5_history_klett`)

---

## 🔮 Планирани функции
- [ ] Гласово разпознаване (Whisper API)
- [ ] Офлайн режим
- [ ] История на изпитванията
- [ ] Родителски панел с прогрес
- [ ] Повече уроци и предмети
