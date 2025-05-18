require('dotenv').config();
const Imap = require('imap');
const { simpleParser } = require('mailparser');

// Настройки подключения
const imapConfig = {
  user: process.env.EMAIL,
  password: process.env.PASSWORD,
  host: process.env.IMAP_HOST,
  port: process.env.IMAP_PORT,
  tls: true,
  tlsOptions: { rejectUnauthorized: false },
  debug: console.log,
  authTimeout: 30000 // увеличиваем таймаут аутентификации
};

console.log('=== ПРОГРАММА ПРОВЕРКИ ПОЧТЫ ===');
console.log(`Подключение к ${imapConfig.host}:${imapConfig.port} для ${imapConfig.user}`);

// Функция для форматирования даты
function formatDate(date) {
  return new Date(date).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Создаем IMAP-соединение
const imap = new Imap(imapConfig);

// Обработчик ошибок
imap.once('error', (err) => {
  console.error('!!! ОШИБКА СОЕДИНЕНИЯ:', err);
  process.exit(1);
});

// Обработчик успешного подключения
imap.once('ready', () => {
  console.log('✓ Соединение установлено успешно');
  
  // Получаем список всех доступных папок
  imap.getBoxes((err, boxes) => {
    if (err) {
      console.error('!!! Ошибка при получении списка папок:', err);
    } else {
      console.log('Доступные папки:');
      listFolders(boxes, '');
    }
    
    // Открываем папку INBOX
    imap.openBox('INBOX', false, (err, box) => {
      if (err) {
        console.error('!!! Ошибка при открытии папки "INBOX":', err);
        tryDefaultFolders();
        return;
      }
      
      processFolder(box);
    });
  });
});

// Рекурсивная функция для вывода папок
function listFolders(boxes, prefix) {
  Object.keys(boxes).forEach(key => {
    console.log(`${prefix}- ${key}`);
    if (boxes[key].children) {
      listFolders(boxes[key].children, prefix + '  ');
    }
  });
}

// Попытка открыть другие стандартные папки, если INBOX не работает
function tryDefaultFolders() {
  const commonFolders = ['Inbox', 'inbox', 'ВХОДЯЩИЕ', 'Входящие', 'входящие'];
  
  let folderIndex = 0;
  
  function tryNextFolder() {
    if (folderIndex >= commonFolders.length) {
      console.error('!!! Не удалось открыть ни одну папку с входящими письмами');
      imap.end();
      return;
    }
    
    const folder = commonFolders[folderIndex++];
    console.log(`Пробуем открыть папку "${folder}"...`);
    
    imap.openBox(folder, false, (err, box) => {
      if (err) {
        console.log(`Папка "${folder}" недоступна:`, err.message);
        tryNextFolder();
      } else {
        console.log(`✓ Папка "${folder}" успешно открыта`);
        processFolder(box);
      }
    });
  }
  
  tryNextFolder();
}

// Обработка содержимого папки
function processFolder(box) {
  console.log(`✓ Папка открыта успешно. Всего сообщений: ${box.messages.total}`);
  
  if (box.messages.total === 0) {
    console.log('В папке нет сообщений');
    imap.end();
    return;
  }
  
  // Ищем ВСЕ сообщения
  imap.search(['ALL'], (err, results) => {
    if (err) {
      console.error('!!! Ошибка при поиске сообщений:', err);
      imap.end();
      return;
    }
    
    console.log(`✓ Найдено сообщений: ${results.length}`);
    
    if (results.length === 0) {
      console.log('Сообщений не найдено');
      imap.end();
      return;
    }
    
    // Получаем последние 10 писем для демонстрации
    const fetchOptions = { bodies: '', struct: true };
    const limitedResults = results.slice(-10); // последние 10 писем
    
    console.log(`Получаем данные для ${limitedResults.length} последних писем...`);
    const f = imap.fetch(limitedResults, fetchOptions);
    
    let messageCount = 0;
    
    f.on('message', (msg, seqno) => {
      console.log(`\n--- Обработка письма #${seqno} ---`);
      
      msg.on('body', (stream, info) => {
        let buffer = '';
        
        stream.on('data', (chunk) => {
          buffer += chunk.toString('utf8');
        });
        
        stream.once('end', () => {
          // Парсим письмо
          simpleParser(buffer)
            .then(mail => {
              messageCount++;
              
              // Выводим информацию о письме
              console.log(`От: ${mail.from?.text || 'Не указан'}`);
              console.log(`Кому: ${mail.to?.text || 'Не указан'}`);
              console.log(`Тема: ${mail.subject || 'Без темы'}`);
              console.log(`Дата: ${formatDate(mail.date)}`);
              
              // Информация о вложениях
              if (mail.attachments && mail.attachments.length > 0) {
                console.log(`Вложений: ${mail.attachments.length}`);
                mail.attachments.forEach((att, i) => {
                  console.log(`  ${i+1}. ${att.filename} (${att.size} байт)`);
                });
              }
              
              // Краткий текст письма (первые 150 символов)
              const text = mail.text || mail.html || 'Нет текста';
              console.log(`Текст: ${text.substring(0, 150)}${text.length > 150 ? '...' : ''}`);
            })
            .catch(error => {
              console.error(`!!! Ошибка при парсинге письма #${seqno}:`, error);
            });
        });
      });
    });
    
    f.once('error', err => {
      console.error('!!! Ошибка при получении писем:', err);
    });
    
    f.once('end', () => {
      console.log('\n=== Получение писем завершено ===');
      console.log(`Всего в ящике: ${results.length} писем`);
      console.log(`Отображено: ${messageCount} писем`);
      imap.end();
    });
  });
}

// Обработчик завершения соединения
imap.once('end', () => {
  console.log('Соединение закрыто');
});

// Устанавливаем соединение
console.log('Подключение к почтовому серверу...');
imap.connect();