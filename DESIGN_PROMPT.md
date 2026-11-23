# Промпт для дизайна экранов «Открыточной»

Скопируйте текст ниже целиком в инструмент для дизайна (Claude Design, Figma AI, v0, Galileo, Uizard и т.п.).

---

Design a desktop web app called «Открыточная» — a generator of scrapbook / collage-style greeting postcards. All UI text is in Russian. Target screen 1440×900, also show how the editor collapses at 1024 px.

**Mood and visual language.** Warm handmade stationery: cream paper, kraft cardboard, washi tape, torn paper edges, a bit of film-grain texture. Calm and cosy, not childish. Palette: paper background #F4ECDF, panels #FFFAF2, secondary paper #EBE0CF, ink text #3B2A20, muted text #7A6555, hairlines #DCCDB8, accent terracotta #C0623F (hover #A9532F, soft tint #F1D6C8), secondary sage #8A9A7B. Typography: headings and logo in a handwritten font with Cyrillic (Caveat 700), UI text in Rubik 400/500, 14 px base. Pill-shaped buttons, 10 px radius on cards, soft layered shadows, dashed dividers like stitch lines. Decorative touches only at the edges (a strip of washi tape on a panel header, torn-edge bottom on the top bar), never over working areas.

**Screen 1 — Editor (main screen).** Three columns under a top bar.
- Top bar: logo «✉ Открыточная», editable card name «Новая открытка», save status («Сохранено» / «Есть изменения»), then icon buttons Undo / Redo, buttons «T Текст», «✦ Автоколлаж», «Мои открытки», «Сохранить», and a primary terracotta button «Скачать ▾» with a dropdown: «PNG — с лучшим качеством», «JPG — файл поменьше», «PDF — для печати».
- Left panel «Библиотека» (≈290 px): an upload box with dashed border (category select + tags input + primary button «+ Загрузить картинки», hint «или перетащите файлы сюда»), category tabs «Все · Фоны · Вырезки · Стикеры · Рамки», search field «Поиск по названию или тегу», a row of tag chips (#весна #цветы #звёзды), and a 3-column grid of square thumbnails on a light checkerboard (to show transparency). Each thumbnail shows a «⋯» button on hover.
- Centre: a large canvas area on the paper background with the postcard in the middle (A6 landscape, 148×105 mm), with a realistic drop shadow as if a card lies on a table. Show a collage on it: textured background, pressed flowers and paper cut-outs slightly rotated around the edges, small stickers, and the handwritten text «С праздником!» in the centre. One element is selected: dashed terracotta frame, round corner handles, a rotation handle above.
- Right panel «Свойства» (≈270 px), two states:
  a) nothing selected: «Формат» select, «Цвет бумаги» swatches (8 round swatches + custom), block «Автоколлаж» with checkbox «С текстом (центр остаётся свободным)», text field, checkbox «Добавить рамку», select «Тема (тег)», primary button «✦ Собрать открытку»;
  b) a text element selected: link «← Настройки открытки», textarea, font select, colour, Bold / Italic toggles, align buttons, size slider; block «Слой» with «Наверх · Выше · Ниже · Вниз», sliders «Прозрачность» and «Поворот», buttons «Дублировать» and «Удалить» (red text), small hint with keyboard shortcuts.

**Screen 2 — Мои открытки (drafts).** Heading «Мои открытки» in the handwritten font, on the right a format select, «← К редактору» and primary «+ Новая открытка». A grid of saved cards like polaroids pinned with washi tape: thumbnail, name, format and date («Открытка A6 · 23 нояб., 03:28»), small buttons «Копия» and «Удалить». Include an empty state with an illustration of an empty envelope and the text «Пока нет сохранённых открыток. Создайте первую!».

**Screen 3 — Element editing modal.** Opens from «⋯» on a thumbnail: large preview, fields «Название», «Категория», «Теги (через запятую)», buttons «Удалить» (left, red), «Отмена», «Сохранить» (primary).

**Screen 4 — First launch / empty editor.** Empty library with a friendly hint «Библиотека пуста. Загрузите фоны, вырезки, стикеры и рамки.», empty card with handwritten hint «Перетащите элементы из библиотеки на открытку или нажмите «Автоколлаж»», and a highlighted upload box.

**States to show:** button hover / disabled, file drag-over on the upload box (terracotta tint), dragging a thumbnail onto the canvas (ghost preview + drop highlight), open export dropdown, active tab and active tag chip.

Deliver: the four screens, a small UI kit (buttons, inputs, select, tabs, chips, swatches, slider, modal, dropdown, thumbnail tile) and the colour/type tokens.
