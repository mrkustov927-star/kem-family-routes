window.KEM_ROUTE = {
  title: "Семейные маршруты по Кеми с Первыми",
  version: "0.1.0",
  updatedAt: "2026-07-17",
  disclaimer: "Тестовый фрагмент маршрута. Точки с отметкой needs-check требуют полевой проверки координат и формулировок.",
  chapters: [
    { id: "railway", title: "От вокзала к городу" },
    { id: "memory", title: "Память и культура" },
    { id: "industry", title: "Город труда" },
    { id: "old-town", title: "Старый город" },
    { id: "river", title: "Кемь и поморское наследие" }
  ],
  plannedPoints: [
    { number: 1, id: "station", title: "Вокзал, история станции и памятник-паровоз", chapter: "railway", status: "ready" },
    { number: 2, id: "kirov-square", title: "Площадь Кирова и памятник железнодорожникам", chapter: "railway", status: "research" },
    { number: 3, id: "school-2", title: "Бывшая школа № 2", chapter: "railway", status: "research" },
    { number: 4, id: "water-tower", title: "Водонапорная башня и проект «Маяк Белого моря»", chapter: "railway", status: "ready" },
    { number: 5, id: "pueta", title: "Река Пуэта", chapter: "railway", status: "research" },
    { number: 6, id: "music-school", title: "Музыкальная школа", chapter: "railway", status: "research" },
    { number: 7, id: "zvyagin", title: "Дом, где жил Звягин, и памятная табличка", chapter: "railway", status: "research" },
    { number: 8, id: "proletarsky-houses", title: "История домов на проспекте Пролетарском", chapter: "railway", status: "research" },
    { number: 9, id: "new-school", title: "Новая школа на Вокзальной, 20", chapter: "railway", status: "research" },
    { number: 10, id: "officers-house", title: "Дом творчества, бывший Дом офицеров и военный городок", chapter: "railway", status: "ready" },
    { number: 11, id: "internationalists", title: "Памятник воинам-интернационалистам", chapter: "memory", status: "research" },
    { number: 12, id: "ckis-square", title: "Площадь у ЦКиС и магазин «Маяк»", chapter: "memory", status: "research" },
    { number: 13, id: "ckis", title: "ЦКиС и развитие культуры Кеми", chapter: "memory", status: "research" },
    { number: 14, id: "energy-streets", title: "Улицы энергетиков", chapter: "memory", status: "research" },
    { number: 15, id: "bakery", title: "Хлебозавод", chapter: "memory", status: "research" },
    { number: 16, id: "library-lenin", title: "Библиотека и памятник Ленину", chapter: "memory", status: "research" },
    { number: 17, id: "administration", title: "Здание администрации", chapter: "memory", status: "research" },
    { number: 18, id: "skate-park", title: "Скейт-парк", chapter: "memory", status: "research" },
    { number: 19, id: "chapel", title: "Часовня «Неупиваемая чаша»", chapter: "memory", status: "research" },
    { number: 20, id: "lespromkhoz", title: "Здание леспромхоза", chapter: "industry", status: "research" },
    { number: 21, id: "rafting-office", title: "Сплавная контора", chapter: "industry", status: "research" },
    { number: 22, id: "police-pension", title: "Здания милиции и пенсионного фонда", chapter: "industry", status: "research" },
    { number: 23, id: "volna", title: "Кинотеатр «Волна»", chapter: "industry", status: "research" },
    { number: 24, id: "ice-arena", title: "Ледовая арена", chapter: "industry", status: "research" },
    { number: 25, id: "school-1", title: "Бывшая школа № 1", chapter: "old-town", status: "research" },
    { number: 26, id: "pushkin", title: "Памятник Пушкину", chapter: "old-town", status: "research" },
    { number: 27, id: "minin", title: "Памятник Виктору Минину", chapter: "old-town", status: "research" },
    { number: 28, id: "annunciation", title: "Благовещенский собор", chapter: "old-town", status: "research" },
    { number: 29, id: "slon-office", title: "Здание бывшей конторы СЛОНа", chapter: "old-town", status: "ready" },
    { number: 30, id: "revolution-square", title: "Сквер жертв революции и его памятники", chapter: "old-town", status: "research" },
    { number: 31, id: "humpback-bridge", title: "Мост, который называли Горбатым", chapter: "old-town", status: "research" },
    { number: 32, id: "sea-rapid-memorial", title: "Памятник у Морского порога", chapter: "old-town", status: "ready" },
    { number: 33, id: "pomorye-museum", title: "Музей «Поморье»", chapter: "river", status: "research" },
    { number: 34, id: "kem-river-bridge", title: "Мост через Кемь и история реки", chapter: "river", status: "research" },
    { number: 35, id: "vitsupa-ostrog", title: "Улица Вицупа и место деревянного острога", chapter: "river", status: "research" },
    { number: 36, id: "pomor-house", title: "Дом Помора и бывшая вечерняя школа", chapter: "river", status: "research" },
    { number: 37, id: "printing-house", title: "Бывшая типография на улице Каменева", chapter: "river", status: "research" },
    { number: 38, id: "city-park", title: "Городской парк и тропа здоровья", chapter: "river", status: "research" },
    { number: 39, id: "stadium", title: "Городской стадион", chapter: "river", status: "research" },
    { number: 40, id: "mass-grave", title: "Братская могила на Береговой и старое кладбище", chapter: "river", status: "research" },
    { number: 41, id: "golodnukha", title: "Улица Мосорина и гора «Голоднуха»", chapter: "river", status: "research" }
  ],
  points: [
    {
      id: "station",
      number: 1,
      chapter: "railway",
      title: "Вокзал и памятник-паровоз",
      shortTitle: "Вокзал",
      coordinates: [64.955037, 34.570146],
      coordinateStatus: "verified",
      coordinateNote: "Координата железнодорожного вокзала по картографическому сервису; точку показа у паровоза уточнить на месте.",
      duration: "6–8 минут",
      image: "./assets/illustrations/station.svg",
      imageAlt: "Иллюстрация железнодорожной станции Кемь",
      intro: "Отсюда удобно начать разговор о том, как железная дорога изменила Кемь и связала город с большой страной.",
      facts: [
        "Станция Кемь возникла на линии Мурманской железной дороги в годы Первой мировой войны.",
        "Железная дорога повлияла на рост города, появление новых профессий и развитие пристанционных кварталов.",
        "Паровоз помогает перевести разговор от дат к людям: машинистам, путейцам, дежурным и ремонтникам."
      ],
      show: "Сначала показать здание вокзала, затем перевести внимание на паровоз и железнодорожные пути.",
      guideText: "Предложите семье представить Кемь до железной дороги: сколько времени занимала бы дорога до Петрозаводска или Мурманска? После ответов свяжите появление станции с новой скоростью жизни города.",
      familyQuestion: "Какие профессии нужны, чтобы один поезд безопасно дошёл до следующей станции?",
      safety: "Не приближаться к путям и служебным зонам. Группа остаётся на общедоступной площадке.",
      sources: [
        { title: "Карельский муниципальный музей: история станции Кемь", url: "https://karjalanmu.ru/stanciya-kem/istoriya/17/" },
        { title: "Координата вокзала на 2ГИС", url: "https://2gis.ru/kem/directions/points/%7C34.570146%2C64.955037%3B70000001044693749" }
      ]
    },
    {
      id: "water-tower",
      number: 2,
      chapter: "railway",
      title: "Водонапорная башня и «Маяк Белого моря»",
      shortTitle: "Водонапорная башня",
      coordinates: [64.95545, 34.5722],
      coordinateStatus: "needs-check",
      coordinateNote: "Предварительная точка рядом со станцией. Требуется зафиксировать точные координаты места показа.",
      duration: "7–9 минут",
      image: "./assets/illustrations/tower.svg",
      imageAlt: "Иллюстрация старой водонапорной башни",
      intro: "Промышленная постройка может стать заметным символом города — если жители находят для неё новую роль.",
      facts: [
        "Водонапорные башни были частью железнодорожной инфраструктуры: вода требовалась паровозам и пристанционному хозяйству.",
        "Башня сохранилась как выразительный ориентир вокзального района.",
        "Проект «Маяк Белого моря» предложил превратить наследие в общественное и культурное пространство."
      ],
      show: "Показать силуэт башни и попросить найти детали старой инженерной архитектуры.",
      guideText: "Сравните башню с маяком: обе постройки видны издалека, но служат разным задачам. Затем расскажите, как переосмысление старого здания помогает сохранить память места.",
      familyQuestion: "Какую новую функцию вы бы придумали для башни, чтобы сюда хотелось возвращаться семьёй?",
      safety: "Осматривать только с разрешённой территории; не заходить внутрь ограждений и технических зон.",
      sources: [
        { title: "Каталог водонапорных башен: Кемь", url: "https://watertowers.ru/vodonapornye-bashni/kem-vodonapornaya-bashnya" },
        { title: "Республика Карелия: проект «Маяк Белого моря»", url: "https://rk.karelia.ru/social/proekt-mayak-belogo-morya-v-kemi-vyigral-vserossijskij-konkurs/" }
      ]
    },
    {
      id: "officers-house",
      number: 3,
      chapter: "railway",
      title: "Военный городок и бывший Дом офицеров",
      shortTitle: "Дом офицеров",
      coordinates: [64.951379, 34.586868],
      coordinateStatus: "needs-check",
      coordinateNote: "Предварительная точка на улице Фрунзе. Нужно подтвердить точное здание бывшего Дома офицеров и место остановки группы.",
      duration: "8–10 минут",
      image: "./assets/illustrations/officers-house.svg",
      imageAlt: "Иллюстрация дома офицеров и самолёта в небе",
      intro: "Эта остановка связывает историю военного городка, городского Дома офицеров и воспоминания жителей о событиях холодной войны.",
      facts: [
        "Военный городок был отдельной частью повседневной жизни Кеми со своими службами и общественными пространствами.",
        "Дом офицеров был местом встреч, концертов, кружков и семейного досуга.",
        "Сюжет о самолёте KAL 902 нужно рассказывать с опорой на проверенные документы и местные свидетельства, отделяя факт от городской легенды."
      ],
      show: "Обозначить границы бывшего военного городка и показать здание, после полевой проверки его адреса.",
      guideText: "Начните не с военной техники, а с повседневности: куда ходили дети, где встречались семьи, как звучала музыка в Доме офицеров. Историю самолёта подайте как исследовательскую задачу: что подтверждают источники, а что ещё предстоит уточнить.",
      familyQuestion: "Почему воспоминания очевидцев важно записывать, но всё равно проверять по документам?",
      safety: "Не перекрывать тротуар и входы в действующие учреждения или жилые здания.",
      sources: [
        { title: "Карельский муниципальный музей: Кемь во второй половине XX века", url: "https://karjalanmu.ru/kem-vo-vtoroj-polovine-xx-veka/istoriya/18/" },
        { title: "Предварительная координата на улице Фрунзе", url: "https://2gis.ru/kem/directions/points/%7C34.586868%2C64.951379%3B70030076298062567" }
      ]
    },
    {
      id: "slon-office",
      number: 4,
      chapter: "old-town",
      title: "Здание бывшей конторы СЛОНа",
      shortTitle: "Контора СЛОНа",
      coordinates: [64.953481, 34.614892],
      coordinateStatus: "verified",
      coordinateNote: "Координата здания по адресу улица Ленина, 10; историческую функцию помещений и период нужно сверять по музейным данным.",
      duration: "8–10 минут",
      image: "./assets/illustrations/slon.svg",
      imageAlt: "Сдержанная иллюстрация исторического здания и архивных листов",
      intro: "Это трудная точка маршрута — здесь важно говорить точно, спокойно и с уважением к памяти людей.",
      facts: [
        "Кемь была важным пересыльным пунктом на пути к Соловецким островам.",
        "История Соловецкого лагеря особого назначения связана с системой политических репрессий раннего советского периода.",
        "Здание в городской памяти связывают с лагерным управлением; конкретные функции и даты должны сопровождаться ссылкой на источник."
      ],
      show: "Показать фасад с общедоступной точки, затем предложить рассмотреть дорогу и направление к побережью как часть географии пересылки.",
      guideText: "Перед рассказом предупредите группу, что тема тяжёлая. Не используйте театрализацию. Сосредоточьтесь на человеческом достоинстве, документах и том, почему городу важно сохранять свидетельства прошлого.",
      familyQuestion: "Как рассказывать о тяжёлой истории так, чтобы сохранять правду и уважение к людям?",
      safety: "Не заходить на частную территорию и не фотографировать людей без разрешения.",
      sources: [
        { title: "Карельский муниципальный музей: Кемь и СЛОН", url: "https://karjalanmu.ru/9493-2/istoriya/29/" },
        { title: "Соловецкий монастырь: история СЛОНа", url: "https://solovki-monastyr.ru/abbey/soviet-period/slon/339/" },
        { title: "Координата здания на улице Ленина, 10", url: "https://2gis.ru/kem/directions/points/%7C34.614892%2C64.953481%3B70030076137395845" }
      ]
    },
    {
      id: "sea-rapid-memorial",
      number: 5,
      chapter: "river",
      title: "Памятник у Морского порога",
      shortTitle: "Морской порог",
      coordinates: [64.948668, 34.61795],
      coordinateStatus: "needs-check",
      coordinateNote: "На карте указана ближайшая найденная мемориальная точка. Нужно подтвердить отдельные координаты памятника у Морского порога.",
      duration: "7–9 минут",
      image: "./assets/illustrations/sea-rapid.svg",
      imageAlt: "Иллюстрация реки Кемь, порога и памятного знака",
      intro: "У воды особенно ясно видно, как природа определяла пути, занятия и характер поморского города.",
      facts: [
        "Река Кемь связывает город с Белым морем и веками определяет его пространство.",
        "Морской порог — не только природный объект, но и важная точка городской памяти.",
        "Текст памятника, дату установки и посвящение нужно читать по самому объекту и сверять с муниципальным паспортом."
      ],
      show: "Сначала дать группе услышать воду, затем показать направление течения, порог и памятный объект.",
      guideText: "Сделайте короткую паузу без слов. После неё попросите назвать звуки и детали, которые заметила семья. От природного наблюдения переходите к истории места и тексту на памятнике.",
      familyQuestion: "Почему памятные места часто появляются у реки, дороги или моста?",
      safety: "Держаться подальше от кромки воды и скользких камней; детей сопровождают взрослые.",
      sources: [
        { title: "Документ Кемского муниципального района о памятном объекте", url: "https://m.kemrk.ru/assets/files/106/181/182/749/234-ot-10.04.2023-11554.doc" },
        { title: "Предварительная мемориальная точка на 2ГИС", url: "https://2gis.ru/kem/directions/points/%7C34.61795%2C64.948668%3B70030076434809350" }
      ]
    }
  ]
};
