/**
 * Curated mapping from the original BOOKS folder into the site's category
 * tree. `sourcePath` is relative to the BOOKS_SOURCE_DIR env var (defaults to
 * /Users/georgij/Desktop/BOOKS). This file is the single source of truth for
 * the one-off import performed by scripts/seed.ts — after seeding, the site
 * itself becomes the source of truth and books can be managed from /admin.
 *
 * `confidence: "low"` marks titles/authors that could not be verified from
 * embedded PDF metadata or well-known bibliographic knowledge and are best
 * effort guesses from the (often messy) original file name. These are safe
 * to fix later from the admin edit form — every edit is kept in history.
 */

export type DocSeed = {
  sourcePath: string;
  title: string;
  authors?: string[];
  year?: string;
  alternateTitle?: string;
  description?: string;
  sourceNote?: string;
  confidence?: "low";
};

export type CategorySeed = {
  slug: string;
  name: string;
  description?: string;
  children?: CategorySeed[];
  documents?: DocSeed[];
};

export const catalog: CategorySeed[] = [
  {
    slug: "filosofiya",
    name: "Философия",
    description: "От философии языка до философии математики и науки.",
    children: [
      {
        slug: "filosofiya-matematiki",
        name: "Философия математики",
        documents: [
          {
            sourcePath: "Перминов_Философия_и_основания_математики.pdf",
            title: "Философия и основания математики",
            authors: ["Василий Перминов"],
            confidence: "low",
          },
          {
            sourcePath: "Лолли_Философия_математики_20_века.pdf",
            title: "Философия математики XX века",
            authors: ["Габриэле Лолли"],
          },
          {
            sourcePath:
              "Фурсов_Проблема_статуса_теоретического_знания_науки_в_полемике_между.pdf",
            title: "Проблема статуса теоретического знания науки в полемике",
            authors: ["Фурсов"],
            confidence: "low",
            sourceNote: "Название файла обрезано, стоит уточнить полностью.",
          },
          {
            sourcePath: "Математика_и_реальность_Сборник_МГУ.pdf",
            title: "Математика и реальность",
            sourceNote: "Сборник, МГУ",
          },
          {
            sourcePath:
              "Наука_как_общественное_благо_сборник_Конгресс_РОИФН.pdf",
            title: "Наука как общественное благо",
            sourceNote: "Сборник по итогам конгресса РОИФН",
          },
          {
            sourcePath:
              "Kurt_Gödel_On_Formally_Undecidable_Propositions_of_Principia_Mathematica_and_Related_Systems_1992.pdf",
            title:
              "On Formally Undecidable Propositions of Principia Mathematica and Related Systems",
            alternateTitle:
              "О формально неразрешимых предложениях Principia Mathematica и родственных систем",
            authors: ["Курт Гёдель"],
            year: "1992",
          },
          {
            sourcePath:
              "Хиникке/Khintikka_Ya_-_Logiko-epistemologicheskie_issledovania_-1980.djvu",
            title: "Логико-эпистемологические исследования",
            authors: ["Яакко Хинтикка"],
            year: "1980",
          },
          {
            sourcePath:
              "Хиникке/Khintikka_Ya_Gedel_K_-_O_Gedele_Kurt_Gedel_Stati_-2014.djvu",
            title: "О Гёделе: статьи",
            authors: ["Яакко Хинтикка", "Курт Гёдель"],
            year: "2014",
          },
          {
            sourcePath:
              "Хиникке/Khofshtadter_D_-_Gyodel_Esher_Bakh_-_eta_beskonechnaya_girlyanda_-2001.djvu",
            title: "Гёдель, Эшер, Бах: эта бесконечная гирлянда",
            authors: ["Дуглас Хофштадтер"],
            year: "2001",
          },
          {
            sourcePath: "Хиникке/Nagel_E__Nyumen_Dzh_R_-_Teorema_Gyodelya_-2010.djvu",
            title: "Теорема Гёделя",
            authors: ["Эрнест Нагель", "Джеймс Ньюман"],
            year: "2010",
          },
        ],
      },
      {
        slug: "filosofiya-yazyka",
        name: "Философия языка и логика",
        documents: [
          {
            sourcePath: "Крипке/naming_and_necessityocr.pdf",
            title: "Naming and Necessity",
            alternateTitle: "Именование и необходимость",
            authors: ["Сол Крипке"],
          },
        ],
      },
      {
        slug: "filosofiya-nauki",
        name: "Философия науки",
        documents: [
          {
            sourcePath: "Tegmark. Parallel universes.pdf",
            title: "Parallel Universes",
            alternateTitle: "Параллельные вселенные",
            authors: ["Макс Тегмарк"],
          },
          {
            sourcePath: "Tegmark. The Mathematical Universe.pdf",
            title: "The Mathematical Universe",
            alternateTitle: "Математическая Вселенная",
            authors: ["Макс Тегмарк"],
          },
        ],
      },
      {
        slug: "nemetskiy-idealizm",
        name: "Немецкий идеализм",
        documents: [
          {
            sourcePath: "hoelderlin_hyperion.pdf",
            title: "Гиперион",
            alternateTitle: "Hyperion",
            authors: ["Фридрих Гёльдерлин"],
          },
        ],
      },
    ],
  },
  {
    slug: "istoriya",
    name: "История",
  },
  {
    slug: "matematika",
    name: "Математика",
    children: [
      {
        slug: "analiz",
        name: "Анализ",
        documents: [
          {
            sourcePath: "Матан/Анализ/Анализ I. Зорич.pdf",
            title: "Анализ I",
            authors: ["Владимир Зорич"],
          },
          {
            sourcePath: "Матан/Анализ/Фихтенгольц 2015.pdf",
            title: "Курс математического анализа",
            authors: ["Григорий Фихтенгольц"],
            year: "2015",
          },
          {
            sourcePath: "Матан/Анализ/Лекции по математическому анализу. Кудрявцев.pdf",
            title: "Лекции по математическому анализу",
            authors: ["Лев Кудрявцев"],
          },
          {
            sourcePath: "Матан/Анализ/Основы матанализа. Ильин, Позняк.pdf",
            title: "Основы математического анализа",
            authors: ["Владимир Ильин", "Эдуард Позняк"],
          },
          {
            sourcePath:
              "Матан/Анализ/Calculus and Analytical Geometry by Thomas and Finney.pdf",
            title: "Calculus and Analytical Geometry",
            authors: ["George Thomas", "Ross Finney"],
          },
          {
            sourcePath: "Матан/Анализ/Курс математического анализа I. Каминин.djvu",
            title: "Курс математического анализа I",
            authors: ["Л. И. Камынин"],
            confidence: "low",
          },
          {
            sourcePath:
              "Матан/Анализ/Курс математического анализа II. Каминин..djvu",
            title: "Курс математического анализа II",
            authors: ["Л. И. Камынин"],
            confidence: "low",
          },
          {
            sourcePath: "Матан/Анализ/8 лекций Хичин.djvu",
            title: "8 лекций",
            authors: ["Найджел Хитчин"],
            confidence: "low",
          },
          {
            sourcePath: "Матан/Пока без папки/Асимптоматика. Интегралы и ряды.pdf",
            title: "Асимптотика. Интегралы и ряды",
            confidence: "low",
          },
          {
            sourcePath: "Матан/Пока без папки/Метод перевала.pdf",
            title: "Метод перевала",
            confidence: "low",
          },
          {
            sourcePath: "Матан/UnderstandingAnalysis.pdf",
            title: "Understanding Analysis",
            authors: ["Stephen Abbott"],
          },
          {
            sourcePath: "Матан/Mathematics for DS.pdf",
            title: "Mathematics for Machine Learning",
            authors: ["Marc Peter Deisenroth", "A. Aldo Faisal", "Cheng Soon Ong"],
          },
          {
            sourcePath: "Матан/1835_Coriolis.pdf",
            title: "Sur les équations du mouvement relatif des systèmes de corps",
            authors: ["Гаспар-Гюстав де Кориолис"],
            year: "1835",
            confidence: "low",
          },
          {
            sourcePath: "El'sgol'dz_Dif_ur_i_var_isch.pdf",
            title: "Дифференциальные уравнения и вариационное исчисление",
            authors: ["Лев Эльсгольц"],
          },
        ],
      },
      {
        slug: "algebra",
        name: "Алгебра",
        documents: [
          {
            sourcePath: "Матан/Алгебра/Алегбра. Винберг.pdf",
            title: "Алгебра",
            authors: ["Эрнест Винберг"],
          },
          {
            sourcePath: "Матан/Пока без папки/Конечные поля. Лидл.djvu",
            title: "Конечные поля",
            alternateTitle: "Finite Fields",
            authors: ["Рудольф Лидл", "Харальд Нидеррайтер"],
            confidence: "low",
          },
        ],
      },
      {
        slug: "lineynaya-algebra",
        name: "Линейная алгебра",
        documents: [
          {
            sourcePath:
              "Матан/Линейная алгебра/Задачи и теоремы Линейной Алгебры. Прослов.pdf",
            title: "Задачи и теоремы линейной алгебры",
            authors: ["В. В. Прасолов"],
            confidence: "low",
          },
          {
            sourcePath: "Матан/Линейная алгебра/Курс Арифметики. Серр.pdf",
            title: "Курс арифметики",
            authors: ["Жан-Пьер Серр"],
          },
        ],
      },
      {
        slug: "kombinatorika",
        name: "Комбинаторика",
        documents: [
          {
            sourcePath: "Матан/Комбинаторика/Комбинаторика Райгородский.pdf",
            title: "Комбинаторика",
            authors: ["Андрей Райгородский"],
          },
          {
            sourcePath:
              "Матан/Комбинаторика/Вероятность и Алгебра в Комбинаторике. Райгородский.pdf",
            title: "Вероятность и алгебра в комбинаторике",
            authors: ["Андрей Райгородский"],
          },
          {
            sourcePath: "Матан/Комбинаторика/Комбинаторика Бродский.pdf",
            title: "Комбинаторика",
            authors: ["И. Л. Бродский"],
            confidence: "low",
          },
          {
            sourcePath: "Матан/Комбинаторика/Комбинаторика Веревкин.pdf",
            title: "Комбинаторика",
            authors: ["О. С. Веревкин"],
            confidence: "low",
          },
          {
            sourcePath: "Матан/Комбинаторика/Комбинаторика откуда?.pdf",
            title: "Комбинаторика: откуда?",
            confidence: "low",
          },
          {
            sourcePath:
              "Матан/Комбинаторика/Generatingfunctionology (mostly combinatorics).pdf",
            title: "generatingfunctionology",
            authors: ["Herbert Wilf"],
          },
          {
            sourcePath:
              "Матан/Комбинаторика/Combinatorics  a guided tour by Mazur, David R.pdf",
            title: "Combinatorics: A Guided Tour",
            authors: ["David Mazur"],
          },
          {
            sourcePath: "Матан/Комбинаторика/Аналитическая кобминаторика.pdf",
            title: "Аналитическая комбинаторика",
            authors: ["Филипп Флажоле", "Роберт Седжвик"],
            confidence: "low",
          },
          {
            sourcePath:
              "Матан/Комбинаторика/Combinatorial Reasoning An Introduction to the Art of Counting by Duane DeTemple, William Webb.pdf",
            title: "Combinatorial Reasoning: An Introduction to the Art of Counting",
            authors: ["Duane DeTemple", "William Webb"],
          },
          {
            sourcePath: "Матан/Пока без папки/Лекции о производящих функциях.pdf",
            title: "Лекции о производящих функциях",
            confidence: "low",
          },
          {
            sourcePath: "Кнут/Konkretnaya_matematika_Grekhem_Knut_Patashnik.pdf",
            title: "Конкретная математика",
            authors: ["Рональд Грэхем", "Дональд Кнут", "Орен Паташник"],
          },
        ],
      },
      {
        slug: "diskretnaya-matematika",
        name: "Дискретная математика",
        description: "Логика, доказательства, графы и комбинаторные структуры.",
        documents: [
          {
            sourcePath: "Матан/Book of proof.pdf",
            title: "Book of Proof",
            authors: ["Richard Hammack"],
          },
          {
            sourcePath: "Матан/text.pdf",
            title: "Discrete Mathematics with Applications",
            authors: ["Susanna Epp"],
          },
          {
            sourcePath: "Haggarti-Discretnaya-matematika.pdf",
            title: "Дискретная математика",
            authors: ["Роб Хаггарти"],
            confidence: "low",
          },
          {
            sourcePath:
              "Матан/Комбинаторика/Дискретная математика и комбинаторика. Андерсон.djvu",
            title: "Дискретная математика и комбинаторика",
            authors: ["Джеймс Андерсон"],
          },
        ],
      },
      {
        slug: "teoriya-veroyatnostey",
        name: "Теория вероятностей",
        documents: [
          {
            sourcePath: "Матан/Теория вероятностей/modamo_Geschichte.pdf",
            title: "Geschichte",
            confidence: "low",
            sourceNote:
              "Имя файла не позволяет уверенно определить автора и заголовок — стоит проверить вручную.",
          },
        ],
      },
      {
        slug: "optimizatsiya",
        name: "Оптимизация",
        documents: [
          {
            sourcePath: "Матан/Оптимизация/Алгоритмы оптимизации. Уолер:Кохендефер.pdf",
            title: "Алгоритмы оптимизации",
            authors: ["Микел Кочендерфер", "Тим Уилер"],
            confidence: "low",
          },
          {
            sourcePath:
              "Матан/Оптимизация/Алгоритмы оптимизации, основанные на методе проб и ошибок.pdf",
            title: "Алгоритмы оптимизации, основанные на методе проб и ошибок",
            confidence: "low",
          },
        ],
      },
      {
        slug: "topologiya",
        name: "Топология",
        documents: [
          {
            sourcePath: "Матан/Топология/Наглядная топология.pdf",
            title: "Наглядная топология",
            confidence: "low",
          },
          {
            sourcePath: "Матан/Топология/Прогулки по замкнутым поверхностям.pdf",
            title: "Прогулки по замкнутым поверхностям",
            confidence: "low",
          },
          {
            sourcePath: "Матан/Топология/Элементарная топология.pdf",
            title: "Элементарная топология",
            authors: [
              "Олег Виро",
              "Олег Иванов",
              "Никита Нецветаев",
              "Виктор Харламов",
            ],
          },
          {
            sourcePath: "Матан/Топология/Начальный курс топологии в листочках.pdf",
            title: "Начальный курс топологии в листочках",
            confidence: "low",
          },
          {
            sourcePath:
              "V_V_Prasolov_-_Elementy_kombinatornooy_i_differentsialnoy_topologii.pdf",
            title: "Элементы комбинаторной и дифференциальной топологии",
            authors: ["В. В. Прасолов"],
          },
        ],
        children: [
          {
            slug: "uzly",
            name: "Узлы",
            documents: [
              {
                sourcePath: "Матан/Топология/Узлы/Узлы.pdf",
                title: "Узлы",
                confidence: "low",
              },
              {
                sourcePath: "Матан/Топология/Узлы/uzly_khronologiya.pdf",
                title: "Узлы: хронология",
                confidence: "low",
              },
              {
                sourcePath: "Матан/Топология/Узлы/uzly_zatsepleniya.pdf",
                title: "Узлы и зацепления",
                confidence: "low",
              },
            ],
          },
        ],
      },
      {
        slug: "teoriya-mnozhestv",
        name: "Теория множеств",
      },
    ],
  },
  {
    slug: "programmirovanie",
    name: "Программирование",
    description: "Языки, алгоритмы и системы — вне основной тематики сайта, но по вашей просьбе тоже здесь.",
    children: [
      {
        slug: "algoritmy-i-sistemy",
        name: "Алгоритмы и системы",
        documents: [
          {
            sourcePath: "Кнут/Knut_D_-_Iskusstvo_Programmirovania_Tom_1_3-E.pdf",
            title: "Искусство программирования. Том 1",
            authors: ["Дональд Кнут"],
          },
          {
            sourcePath: "Код/CS/Computer Science- An Overview (12th Global Edition).pdf",
            title: "Computer Science: An Overview",
            authors: ["J. Glenn Brookshear"],
            year: "12th ed.",
          },
          {
            sourcePath: "Код/CS/96a2b94d4be48285f2605d843a1e6db37da9a944.pdf",
            title:
              "Introduction to Computing Systems: From Bits & Gates to C/C++ & Beyond",
            authors: ["Yale Patt", "Sanjay Patel"],
          },
          {
            sourcePath: "Код/CS/Ch_Pettsold_Kod_Tayny_yazyk_informatiki.pdf",
            title: "Код: тайный язык информатики",
            authors: ["Чарльз Петцольд"],
          },
          {
            sourcePath: "Код/Программирование Теоремы и задачи. Шень.pdf",
            title: "Программирование: теоремы и задачи",
            authors: ["Александр Шень"],
          },
          {
            sourcePath:
              "Код/Высоконагруженные приложения. Программирование, масштабирование, поддержка (Клеппман 2018).pdf",
            title: "Высоконагруженные приложения",
            authors: ["Мартин Клеппман"],
            year: "2018",
          },
          {
            sourcePath:
              "Viktor_Nikitovich_Ivanov_Programmirovanie_logicheskih_kontrollerov.pdf",
            title: "Программирование логических контроллеров",
            authors: ["Виктор Иванов"],
          },
        ],
      },
      {
        slug: "rust",
        name: "Rust",
        documents: [
          {
            sourcePath: "Programmirovanie_na_Rust_2021_Stiv_Klabnik_Kerol_Nikols.pdf",
            title: "Программирование на Rust",
            alternateTitle: "The Rust Programming Language",
            authors: ["Стив Кланик", "Кэрол Николс"],
            year: "2021",
          },
          {
            sourcePath: "rustbook.pdf",
            title: "The Rust Programming Language",
            alternateTitle: "Программирование на Rust",
            authors: ["Steve Klabnik", "Carol Nichols"],
          },
        ],
      },
      {
        slug: "python",
        name: "Python",
        documents: [
          {
            sourcePath: "Код/Питоню/Python-Cookbook-3rd-Edition.pdf",
            title: "Python Cookbook",
            authors: ["David Beazley", "Brian K. Jones"],
            year: "3rd ed.",
          },
          {
            sourcePath: "Код/Питоню/[Paul_Deitel,_Dr._Harvey_Deitel]_Python_for_Progra.pdf",
            title: "Python for Programmers",
            authors: ["Paul Deitel", "Harvey Deitel"],
          },
          {
            sourcePath: "Код/Питоню/Python 3 (Самое необходимое) - 2016.pdf",
            title: "Python 3. Самое необходимое",
            year: "2016",
            confidence: "low",
          },
          {
            sourcePath: "Код/Питоню/Python-for-Civil...pdf",
            title: "Python for Civil and Structural Engineers",
            authors: ["Vittorio Lora"],
          },
          {
            sourcePath: "Код/Питоню/Introducing_Python_Modern_Computing.pdf",
            title: "Introducing Python",
            confidence: "low",
          },
          {
            sourcePath: "Код/Питоню/Foundations of Robotics A Multidiscip....pdf",
            title: "Foundations of Robotics: A Multidisciplinary Approach",
            confidence: "low",
          },
          {
            sourcePath: "Код/Питоню/Simulation with Python Develop Simula....pdf",
            title: "Simulation with Python",
            confidence: "low",
          },
          {
            sourcePath: "Код/ML Книги/Python_i_mashinnoe_obuchenie.pdf",
            title: "Python и машинное обучение",
            confidence: "low",
          },
        ],
      },
      {
        slug: "mashinnoe-obuchenie",
        name: "Машинное обучение и данные",
        documents: [
          {
            sourcePath:
              "Код/ML Книги/Пойнтер Я. - Программируем с PyTorch (Бестселлеры O’Reilly) - 2020.pdf",
            title: "Программируем с PyTorch",
            authors: ["Ян Пойнтер"],
            year: "2020",
          },
          {
            sourcePath: "Код/ML Книги/Advancing into Analy... by George Mount.pdf",
            title: "Advancing into Analytics",
            authors: ["George Mount"],
          },
          {
            sourcePath: "Код/ML Книги/Learning Regular Expressions (Ben Forta).pdf",
            title: "Learning Regular Expressions",
            authors: ["Ben Forta"],
          },
          {
            sourcePath: "Код/ML Книги/vyugin1.pdf",
            title: "Математические основы теории машинного обучения и прогнозирования",
            authors: ["Владимир Вьюгин"],
            confidence: "low",
          },
          {
            sourcePath:
              "Код/ML Книги/Крупномасштабное_машинное_обучение_вместе_с_Python_2018_Шарден,.pdf",
            title: "Крупномасштабное машинное обучение вместе с Python",
            authors: ["Бастьен Шарден"],
            year: "2018",
            confidence: "low",
          },
          {
            sourcePath: "Код/ML Книги/89550880a4.pdf",
            title:
              "Как учится машина. Революция в области нейронных сетей и глубокого обучения",
            authors: ["Ян Лекун"],
          },
        ],
      },
      {
        slug: "kvantovye-vychisleniya",
        name: "Квантовые вычисления",
        documents: [
          {
            sourcePath:
              "Код/Квант/Силва_В_Разработка_с_использованием_квантовых_компьютеров_Библиотека.pdf",
            title: "Разработка с использованием квантовых компьютеров",
            authors: ["В. Силва"],
          },
          {
            sourcePath:
              "Код/Квант/Программирование_квантовых_компьютеров_Базовые_алгоритмы_и_примеры.pdf",
            title: "Программирование квантовых компьютеров: базовые алгоритмы и примеры кода",
            sourceNote: "Издание O'Reilly",
          },
          {
            sourcePath: "Код/Квант/programmirovaniekvantovyhkompyuterov.pdf",
            title:
              "Программирование квантовых компьютеров: базовые алгоритмы и примеры кода (другая копия)",
            confidence: "low",
            sourceNote: "Похоже на другую копию/скан того же издания.",
          },
          {
            sourcePath: "Код/Квант/DESY_Qiskit_Intro_Kuehn.pdf",
            title: "Introduction to Qiskit",
            authors: ["Stefan Kühn"],
          },
          {
            sourcePath: "Код/Квант/Introduction to Qiskit 7.pdf",
            title: "Qiskit — вводная презентация",
            confidence: "low",
          },
          {
            sourcePath: "Код/Квант/77735-33616.pdf",
            title: "Отличная квантовая механика",
            authors: ["Александр Львовский"],
            sourceNote: "Учебное пособие, издательство «Альпина нон-фикшн».",
          },
        ],
      },
      {
        slug: "java",
        name: "Java",
        documents: [
          {
            sourcePath:
              "Код/Питоню/НеПитон/Core JAVA Interview Questions Youll M....pdf",
            title: "Core Java Interview Questions You'll Most Likely Be Asked",
            authors: ["Vibrant Publishers"],
          },
          {
            sourcePath:
              "Код/Питоню/НеПитон/Exceptions in Java Basics, advanced c....pdf",
            title: "Exceptions in Java: Basics, Advanced Concepts, and Real API Examples",
            authors: ["Nik Lumi"],
          },
          {
            sourcePath:
              "Код/Питоню/НеПитон/Jakarta_EE_for_Java_Developers_Build_Cloud_Native_and_Enterprise.pdf",
            title: "Jakarta EE for Java Developers",
            confidence: "low",
          },
        ],
      },
      {
        slug: "informatsionnaya-bezopasnost",
        name: "Информационная безопасность",
        documents: [
          {
            sourcePath: "Код/Питоню/НеПитон/Hacking For Dummies ... by Kevin Beaver.pdf",
            title: "Hacking For Dummies",
            authors: ["Kevin Beaver"],
          },
        ],
      },
      {
        slug: "bazy-dannykh",
        name: "Базы данных",
        documents: [
          {
            sourcePath: "Код/Питоню/SQL Server Simplifie... by Garg  Vishal.pdf",
            title: "SQL Server Simplified",
            authors: ["Vishal Garg"],
            confidence: "low",
          },
        ],
      },
      {
        slug: "veb-razrabotka",
        name: "Веб-разработка",
        documents: [
          {
            sourcePath: "Код/ML Книги/Reactive Patterns with RxJS for Angul....pdf",
            title: "Reactive Patterns with RxJS for Angular",
            authors: ["L. Chebbi"],
          },
        ],
      },
      {
        slug: "c",
        name: "C",
        documents: [
          {
            sourcePath: "Код/C/Expert_C_Programming.pdf",
            title: "Expert C Programming",
            authors: ["Peter van der Linden"],
          },
        ],
      },
      {
        slug: "haskell",
        name: "Haskell",
        documents: [
          {
            sourcePath: "Код/Haskell/ohaskell.pdf",
            title: "О Haskell по-человечески",
            authors: ["Денис Шевченко"],
          },
        ],
      },
      {
        slug: "swift",
        name: "Swift",
        documents: [
          {
            sourcePath:
              "Код/SWIFT/Swift-Osnovy-razrabotki-prilozheniy-pod-iOS-iPadOS-i-macOS_RuLit_Me_649511.pdf",
            title: "Swift. Основы разработки приложений под iOS, iPadOS и macOS",
            confidence: "low",
          },
        ],
      },
      {
        slug: "julia",
        name: "Julia",
        documents: [
          {
            sourcePath: "Julia/julia-1.8.5.pdf",
            title: "Julia 1.8.5 — официальная документация",
            sourceNote: "Официальная документация языка Julia",
          },
        ],
      },
    ],
  },
  {
    slug: "yazyki",
    name: "Языки",
    children: [
      {
        slug: "kitayskiy",
        name: "Китайский",
        children: [
          {
            slug: "uchebniki",
            name: "Учебники",
            documents: [
              {
                sourcePath: "China/учебники/Elementary_Comprehensive_I.pdf",
                title: "Elementary Comprehensive Course I",
                confidence: "low",
              },
              {
                sourcePath: "China/учебники/Elementary_Listening_Course_I.pdf",
                title: "Elementary Listening Course I",
                confidence: "low",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "literatura",
    name: "Литература",
    children: [
      {
        slug: "esse",
        name: "Эссе",
        documents: [
          {
            sourcePath: "Чтиво/Bigredson_DFW-1.pdf",
            title: "Big Red Son",
            authors: ["Дэвид Фостер Уоллес"],
            confidence: "low",
          },
        ],
      },
    ],
  },
];

export type CategoryRelationSeed = {
  a: string[];
  b: string[];
  label: string;
};

/** Conceptual cross-links that don't follow from shared authors alone. */
export const categoryRelationSeeds: CategoryRelationSeed[] = [
  {
    a: ["filosofiya", "filosofiya-matematiki"],
    b: ["matematika"],
    label: "философия математики",
  },
];

export type AuthorRelationSeed = {
  a: string;
  b: string;
  label: string;
};

/** Real, content-grounded links between authors (not fabricated biography). */
export const authorRelationSeeds: AuthorRelationSeed[] = [
  { a: "Курт Гёдель", b: "Яакко Хинтикка", label: "статьи о Гёделе" },
  { a: "Курт Гёдель", b: "Дуглас Хофштадтер", label: "книга о Гёделе" },
  { a: "Курт Гёдель", b: "Эрнест Нагель", label: "теорема Гёделя" },
  { a: "Курт Гёдель", b: "Джеймс Ньюман", label: "теорема Гёделя" },
];
